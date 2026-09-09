/**
 * Seed script — creates the 500 fake profiles required by the Matcha subject,
 * each with a real portrait photo fetched from the Pexels API.
 *
 * SEED-DATA ONLY. Everything it creates is namespaced behind the
 * `seed_user_<n>` username prefix so it can never touch — or be confused with —
 * real accounts registered through /register. The app itself never assigns
 * stock photos to anyone; this script is the only place Pexels is used.
 *
 * Photo storage deliberately reuses the exact same machinery as the real
 * upload feature (POST /api/profile/me/photos), without modifying it:
 *   - files land in uploadService.UPLOAD_DIR (uploads/photos)
 *   - filenames follow uploadService.buildFilename's pattern
 *   - bytes are validated with uploadService.detectImageMime (magic signatures)
 *   - URLs are `${UPLOAD_URL_PREFIX}/<filename>` and rows go in via
 *     profileQueries.insertPhoto(userId, url, true) — marked profile picture
 *   - fame_rating is recomputed with the real fameRatingService
 *
 * Pexels rate limit (200 req/hour free tier) strategy:
 *   - only ~4-8 SEARCH api calls per run: a pool of up to 320 photo URLs per
 *     gender is fetched once (per_page=80, extra page only on shortfall)
 *   - the URL pool is cached in data/pexelsPool.json for 24h, so re-runs make
 *     ZERO api calls (--fresh-pool forces a refetch)
 *   - 1s delay between search calls; 429 aborts pool building with a warning
 *   - image DOWNLOADS go to the images.pexels.com CDN (no api key, not part of
 *     the 200/hour api budget) and are still politely throttled
 *   - any failure (api, download, bad bytes) logs a warning and that profile
 *     is simply seeded WITHOUT a photo — the run never crashes
 *
 * Usage (from Backend/):
 *   npm run seed:fake                      # 500 profiles
 *   npm run seed:fake -- --count 50        # smaller test run
 *   npm run seed:fake -- --wipe            # delete previous seed users first
 *   npm run seed:fake -- --no-photos       # skip Pexels entirely
 *   npm run seed:fake -- --fresh-pool      # ignore the cached URL pool
 *
 * All seed accounts share the password: Seed!Pass2026
 */
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { faker } from '@faker-js/faker';
import { pool, query } from '../src/config/db';
import { env } from '../src/config/env';
import { insertPhoto } from '../src/db/queries/profileQueries';
import { recalculateFameRating } from '../src/services/fameRatingService';
import {
  detectImageMime,
  resolveUploadPath,
  safeUnlink,
  UPLOAD_DIR,
  UPLOAD_URL_PREFIX,
} from '../src/services/uploadService';

// ------------------------------- Constants --------------------------------

const SEED_USERNAME_REGEX = '^seed_user_[0-9]+$';
const SEED_PASSWORD = 'Seed!Pass2026';
const BCRYPT_SALT_ROUNDS = 10; // mirrors authService

const DEFAULT_COUNT = 500;
const POOL_CACHE_PATH = path.join(env.DATA_DIR, 'pexelsPool.json');
const POOL_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const PEXELS_SEARCH_ENDPOINT = 'https://api.pexels.com/v1/search';
const PEXELS_PER_PAGE = 80; // max allowed
const API_CALL_DELAY_MS = 1_000; // politeness delay between search calls
const DOWNLOAD_CONCURRENCY = 4;
const DOWNLOAD_STAGGER_MS = 60;
const FETCH_TIMEOUT_MS = 20_000;

// Two queries per gender; page 2 is fetched only when page 1 is not enough.
const PEXELS_QUERIES: Record<'male' | 'female', string[]> = {
  male: ['man portrait face', 'smiling man portrait'],
  female: ['woman portrait face', 'smiling woman portrait'],
};

const TAG_POOL = [
  'travel', 'coffee', 'fitness', 'music', 'hiking', 'cooking', 'photography',
  'reading', 'gaming', 'yoga', 'cinema', 'football', 'swimming', 'dancing',
  'vegan', 'geek', 'painting', 'running', 'sushi', 'camping',
];

const LOCATIONS = [
  'Maârif, Casablanca', 'Gauthier, Casablanca', 'Anfa, Casablanca',
  'Hay Hassani, Casablanca', 'Ain Diab, Casablanca', 'Casablanca',
  'Rabat', 'Marrakesh', 'Mohammedia',
];

interface PoolPhoto {
  id: number;
  url: string; // images.pexels.com CDN url (src.medium)
  gender: 'male' | 'female';
}

interface PoolCache {
  fetchedAt: string;
  photos: PoolPhoto[];
}

type Gender = 'male' | 'female' | 'other';

interface SeedSpec {
  index: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  sexualPreferences: string;
  birthdate: string; // yyyy-mm-dd
  biography: string | null;
  latitude: number | null;
  longitude: number | null;
  locationText: string | null;
  lastConnection: Date;
  tags: string[];
  photo: PoolPhoto | null; // assigned from the pool (null = no photo)
}

// --------------------------------- CLI -------------------------------------

interface CliArgs {
  count: number;
  wipe: boolean;
  noPhotos: boolean;
  freshPool: boolean;
}

const parseArgs = (): CliArgs => {
  const args: CliArgs = { count: DEFAULT_COUNT, wipe: false, noPhotos: false, freshPool: false };
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--wipe') args.wipe = true;
    else if (token === '--no-photos') args.noPhotos = true;
    else if (token === '--fresh-pool') args.freshPool = true;
    else if (token === '--count') {
      const parsed = Number.parseInt(argv[i + 1] ?? '', 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5000) {
        console.error('[Seed] --count must be an integer between 1 and 5000.');
        process.exit(1);
      }
      args.count = parsed;
      i += 1;
    } else {
      console.error(`[Seed] Unknown argument "${token}". Use --count N, --wipe, --no-photos, --fresh-pool.`);
      process.exit(1);
    }
  }
  return args;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------ Pexels pool --------------------------------

class PexelsRateLimitedError extends Error {}

/** One GET /v1/search call. Throws PexelsRateLimitedError on HTTP 429. */
const pexelsSearch = async (searchQuery: string, page: number, gender: 'male' | 'female'): Promise<PoolPhoto[]> => {
  const url =
    `${PEXELS_SEARCH_ENDPOINT}?query=${encodeURIComponent(searchQuery)}` +
    `&per_page=${PEXELS_PER_PAGE}&page=${page}&orientation=portrait`;

  const response = await fetch(url, {
    headers: { Authorization: env.PEXELS_API_KEY },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (response.status === 429) throw new PexelsRateLimitedError('Pexels rate limit reached (HTTP 429)');
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Pexels rejected the API key (HTTP ${response.status}). Check PEXELS_API_KEY in Backend/.env.`);
  }
  if (!response.ok) throw new Error(`Pexels search failed with HTTP ${response.status}`);

  const body = (await response.json()) as { photos?: Array<{ id: number; src?: { medium?: string } }> };
  return (body.photos ?? [])
    .filter((photo) => typeof photo?.src?.medium === 'string')
    .map((photo) => ({ id: photo.id, url: photo.src!.medium!, gender }));
};

const loadPoolCache = (): PoolCache | null => {
  try {
    if (!fs.existsSync(POOL_CACHE_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(POOL_CACHE_PATH, 'utf8')) as PoolCache;
    if (!Array.isArray(cache.photos) || !cache.fetchedAt) return null;
    if (Date.now() - new Date(cache.fetchedAt).getTime() > POOL_CACHE_MAX_AGE_MS) return null;
    return cache;
  } catch {
    return null; // corrupt cache — just refetch
  }
};

const savePoolCache = (photos: PoolPhoto[]): void => {
  try {
    fs.mkdirSync(path.dirname(POOL_CACHE_PATH), { recursive: true });
    const cache: PoolCache = { fetchedAt: new Date().toISOString(), photos };
    fs.writeFileSync(POOL_CACHE_PATH, JSON.stringify(cache));
  } catch (error: any) {
    console.warn(`[Seed] Warning: could not write pool cache (${error?.message}). Continuing without it.`);
  }
};

/**
 * Builds the photo URL pool: as many distinct portraits per gender as needed,
 * with the fewest possible api calls (cached across runs, adaptive page 2).
 * NEVER throws — on any failure it returns whatever it managed to collect.
 */
const buildPhotoPool = async (neededPerGender: number, freshPool: boolean): Promise<PoolPhoto[]> => {
  if (!freshPool) {
    const cache = loadPoolCache();
    if (cache) {
      const male = cache.photos.filter((p) => p.gender === 'male').length;
      const female = cache.photos.filter((p) => p.gender === 'female').length;
      console.log(`[Seed] Reusing cached Pexels pool (${male} male / ${female} female urls, fetched ${cache.fetchedAt}).`);
      return cache.photos;
    }
  }

  if (!env.PEXELS_API_KEY) {
    console.warn('[Seed] Warning: PEXELS_API_KEY is not set in Backend/.env — seeding WITHOUT photos.');
    return [];
  }

  const collected: PoolPhoto[] = [];
  const seenIds = new Set<number>();
  let rateLimited = false;
  let apiCalls = 0;

  const fetchForGender = async (gender: 'male' | 'female', needed: number): Promise<void> => {
    for (let page = 1; page <= 2; page += 1) {
      const have = collected.filter((p) => p.gender === gender).length;
      if (have >= needed || rateLimited) return;

      for (const searchQuery of PEXELS_QUERIES[gender]) {
        if (rateLimited) return;
        try {
          apiCalls += 1;
          const photos = await pexelsSearch(searchQuery, page, gender);
          for (const photo of photos) {
            if (!seenIds.has(photo.id)) {
              seenIds.add(photo.id);
              collected.push(photo);
            }
          }
          console.log(`[Seed] Pexels "${searchQuery}" p${page}: +${photos.length} urls (api calls so far: ${apiCalls}).`);
          await sleep(API_CALL_DELAY_MS);
        } catch (error: any) {
          if (error instanceof PexelsRateLimitedError) {
            rateLimited = true;
            console.warn('[Seed] Warning: Pexels rate limit hit — stopping api calls and continuing with the partial pool.');
          } else {
            console.warn(`[Seed] Warning: Pexels "${searchQuery}" p${page} failed (${error?.message}) — skipping this page.`);
          }
        }
      }
    }
  };

  await fetchForGender('female', neededPerGender);
  await fetchForGender('male', neededPerGender);

  console.log(
    `[Seed] Pool ready: ${collected.filter((p) => p.gender === 'female').length} female / ` +
    `${collected.filter((p) => p.gender === 'male').length} male urls using ${apiCalls} api call(s) ` +
    `(limit: 200/hour; downloads come from the CDN and do not count).`
  );

  if (collected.length > 0) savePoolCache(collected);
  return collected;
};

// --------------------------- Photo download/store ---------------------------

/**
 * Downloads one CDN image and stores it exactly like the real upload feature:
 * bytes validated by detectImageMime, deterministic filename in UPLOAD_DIR,
 * returns the public "/uploads/photos/..." URL (null on any failure).
 */
const downloadAndStorePhoto = async (photoUrl: string): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetch(photoUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error: any) {
    console.warn(`[Seed] Warning: photo download failed (${error?.message}) — profile will have no photo.`);
    return null;
  }
  if (!response.ok) {
    console.warn(`[Seed] Warning: photo download returned HTTP ${response.status} — profile will have no photo.`);
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const unique = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const tmpPath = path.join(UPLOAD_DIR, `seed-tmp-${unique}`);

  try {
    fs.writeFileSync(tmpPath, buffer);

    // Same magic-signature validation the real upload endpoint applies.
    const mime = detectImageMime(tmpPath);
    if (!mime) {
      safeUnlink(tmpPath);
      console.warn('[Seed] Warning: downloaded file is not a valid JPEG/PNG/WebP — profile will have no photo.');
      return null;
    }

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const filename = `${unique}${ext}`; // mirrors uploadService.buildFilename
    fs.renameSync(tmpPath, path.join(UPLOAD_DIR, filename));
    return `${UPLOAD_URL_PREFIX}/${filename}`;
  } catch (error: any) {
    safeUnlink(tmpPath);
    console.warn(`[Seed] Warning: could not store photo (${error?.message}) — profile will have no photo.`);
    return null;
  }
};

/** Tiny worker pool: downloads `urls` with bounded concurrency. */
const downloadAll = async (specs: SeedSpec[]): Promise<Map<number, string | null>> => {
  const results = new Map<number, string | null>(); // spec.index -> public url
  const queue = specs.filter((spec) => spec.photo !== null);
  if (queue.length === 0) return results;

  console.log(`[Seed] Downloading ${queue.length} photos (concurrency ${DOWNLOAD_CONCURRENCY})...`);
  let cursor = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const spec = queue[cursor];
      cursor += 1;
      await sleep(DOWNLOAD_STAGGER_MS);
      const publicUrl = await downloadAndStorePhoto(spec.photo!.url);
      results.set(spec.index, publicUrl);
      done += 1;
      if (done % 50 === 0) console.log(`[Seed]   ...${done}/${queue.length} photos downloaded`);
    }
  };

  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
  return results;
};

// ------------------------------ User building -------------------------------

const pickGender = (): Gender => {
  const roll = Math.random();
  if (roll < 0.45) return 'female';
  if (roll < 0.9) return 'male';
  return 'other';
};

const pickLastConnection = (): Date => {
  // 5% "online" (within the 5-minute window), the rest spread over 10 days.
  if (Math.random() < 0.05) {
    return new Date(Date.now() - Math.floor(Math.random() * 4 * 60 * 1000));
  }
  return faker.date.recent({ days: 10 });
};

const buildSpecs = (count: number, pool: PoolPhoto[]): SeedSpec[] => {
  // Shuffle per-gender pools so photo assignment looks random run to run.
  const femalePool = faker.helpers.shuffle(pool.filter((p) => p.gender === 'female'));
  const malePool = faker.helpers.shuffle(pool.filter((p) => p.gender === 'male'));
  const otherPool = faker.helpers.shuffle([...femalePool, ...malePool]);
  const cursors = { female: 0, male: 0, other: 0 };

  const nextPhoto = (gender: Gender): PoolPhoto | null => {
    const source = gender === 'female' ? femalePool : gender === 'male' ? malePool : otherPool;
    if (cursors[gender] >= source.length) {
      if (source.length === 0) return null;
      cursors[gender] = 0; // pool exhausted: recycle (documented trade-off)
    }
    const photo = source[cursors[gender]];
    cursors[gender] += 1;
    return photo;
  };

  const specs: SeedSpec[] = [];
  for (let i = 1; i <= count; i += 1) {
    const gender = pickGender();
    const username = `seed_user_${String(i).padStart(4, '0')}`;
    const hasCoords = Math.random() < 0.8; // 20% rely on location_text only (geo fallback cases)

    specs.push({
      index: i,
      username,
      email: `${username}@matcha.seed`,
      firstName: gender === 'male' ? faker.person.firstName('male') : faker.person.firstName('female'),
      lastName: faker.person.lastName(),
      gender,
      sexualPreferences: faker.helpers.weightedArrayElement([
        { weight: 60, value: 'heterosexual' },
        { weight: 20, value: 'homosexual' },
        { weight: 20, value: 'bisexual' },
      ]),
      birthdate: faker.date.birthdate({ min: 21, max: 48, mode: 'age' }).toISOString().slice(0, 10),
      biography: Math.random() < 0.9 ? faker.lorem.sentences({ min: 1, max: 3 }) : null,
      latitude: hasCoords ? Number((33.53 + Math.random() * 0.12).toFixed(6)) : null,   // Casablanca area
      longitude: hasCoords ? Number((-7.66 + Math.random() * 0.14).toFixed(6)) : null,
      locationText: faker.helpers.arrayElement(LOCATIONS),
      lastConnection: pickLastConnection(),
      tags: faker.helpers.arrayElements(TAG_POOL, { min: 2, max: 5 }),
      photo: nextPhoto(gender),
    });
  }
  return specs;
};

// --------------------------------- Wipe -------------------------------------

/** Deletes every previously seeded user (photos files first, then rows). */
const wipeSeedUsers = async (): Promise<number> => {
  const photoRows = await query<{ url: string }>(
    `SELECT p.url FROM photos p JOIN users u ON u.id = p.user_id WHERE u.username ~ $1`,
    [SEED_USERNAME_REGEX]
  );
  for (const row of photoRows.rows) {
    const filePath = resolveUploadPath(row.url);
    if (filePath) safeUnlink(filePath);
  }

  const deleted = await query(
    `DELETE FROM users WHERE username ~ $1`, // FKs cascade photos/likes/views/blocks/reports/user_tags
    [SEED_USERNAME_REGEX]
  );
  console.log(`[Seed] Wiped ${deleted.rowCount ?? 0} previous seed user(s) and ${photoRows.rowCount ?? 0} photo file(s).`);
  return deleted.rowCount ?? 0;
};

// --------------------------------- Main -------------------------------------

const ensureTag = async (name: string, cache: Map<string, number>): Promise<number> => {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const inserted = await query<{ id: number }>(
    `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`,
    [name]
  );
  let tagId = inserted.rows[0]?.id;
  if (tagId === undefined) {
    const existing = await query<{ id: number }>(`SELECT id FROM tags WHERE name = $1 LIMIT 1`, [name]);
    tagId = existing.rows[0]?.id;
  }
  cache.set(name, tagId);
  return tagId;
};

async function main(): Promise<void> {
  const args = parseArgs();
  const startedAt = Date.now();

  console.log(`[Seed] Seeding ${args.count} fake profile(s)${args.noPhotos ? ' WITHOUT photos' : ''}...`);

  try {
    // Refuse to run on top of an old seed set unless --wipe was given.
    const existing = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users WHERE username ~ $1`,
      [SEED_USERNAME_REGEX]
    );
    const existingCount = existing.rows[0]?.count ?? 0;
    if (existingCount > 0 && !args.wipe) {
      console.error(
        `[Seed] ${existingCount} seed user(s) already exist (username prefix "seed_user_"). ` +
        `Re-run with --wipe to replace them. Real registered users are never touched.`
      );
      process.exitCode = 1;
      return;
    }
    if (args.wipe && existingCount > 0) await wipeSeedUsers();

    // 1. Specs + photo pool (Pexels api calls happen only here, and only if needed).
    const perGenderNeeded = Math.ceil((args.count * 0.45) + 10);
    const photoPool = args.noPhotos ? [] : await buildPhotoPool(perGenderNeeded, args.freshPool);
    const specs = buildSpecs(args.count, photoPool);
    const withoutPhoto = specs.filter((spec) => spec.photo === null).length;
    if (!args.noPhotos && withoutPhoto > 0) {
      console.warn(`[Seed] Warning: the pool was too small for ${withoutPhoto} profile(s) — they will have no photo.`);
    }

    // 2. Downloads (CDN, throttled) before any DB writes so failures are known early.
    const downloaded = await downloadAll(specs);

    // 3. DB inserts: users, tags, photos (same insertPhoto the real feature uses), fame.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_SALT_ROUNDS); // one hash for all seed accounts
    const tagCache = new Map<string, number>();
    let photosStored = 0;

    for (const spec of specs) {
      const userResult = await query<{ id: number }>(
        `INSERT INTO users (email, username, first_name, last_name, password_hash, is_verified,
                            gender, sexual_preferences, biography, birthdate,
                            latitude, longitude, location_text, last_connection)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9::date,$10,$11,$12,$13)
         RETURNING id`,
        [
          spec.email, spec.username, spec.firstName, spec.lastName, passwordHash,
          spec.gender, spec.sexualPreferences, spec.biography, spec.birthdate,
          spec.latitude, spec.longitude, spec.locationText, spec.lastConnection,
        ]
      );
      const userId = userResult.rows[0].id;

      for (const tagName of spec.tags) {
        const tagId = await ensureTag(tagName, tagCache);
        await query(`INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, tagId]);
      }

      const publicUrl = downloaded.get(spec.index) ?? null;
      if (publicUrl) {
        await insertPhoto(userId, publicUrl, true); // marked as profile picture, like a real upload
        photosStored += 1;
      }

      // Deterministic fame via the real service (views=0, likes=0, +10 when complete).
      await recalculateFameRating(userId);

      if (spec.index % 50 === 0) console.log(`[Seed]   ...${spec.index}/${args.count} profiles created`);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `\n[Seed] Done in ${elapsed}s — ${specs.length} profiles, ${photosStored} photos stored ` +
      `(${specs.length - photosStored} without photo), password for every seed account: ${SEED_PASSWORD}`
    );
    console.log('[Seed] Log in with e.g. seed_user_0001@matcha.seed / Seed!Pass2026');
  } catch (error: any) {
    console.error('[Seed] Fatal error (database?):', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
