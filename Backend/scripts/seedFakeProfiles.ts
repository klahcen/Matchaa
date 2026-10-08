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
 *   - without PEXELS_API_KEY the cached pool is reused even when stale, so a
 *     key is only needed to build a brand-new pool
 *   - any failure (api, download, bad bytes) logs a warning and that profile
 *     gets a locally generated placeholder avatar instead — the run never crashes
 *
 * Every seeded profile passes the profile-completion gate (biography, 2-5 tags,
 * a profile picture, a location with coordinates), so all of them show up in
 * browse/search/map. Orientations are binary but varied: most profiles want
 * the opposite gender, ~18% want the same gender, so testers of any
 * orientation get candidates.
 *
 * Usage (from Backend/):
 *   npm run seed:fake                      # 500 profiles
 *   npm run seed:fake -- --count 50        # smaller test run
 *   npm run seed:fake -- --wipe            # delete previous seed users first
 *   npm run seed:fake -- --no-photos       # skip Pexels; placeholder avatars only
 *   npm run seed:fake -- --fresh-pool      # ignore the cached URL pool
 *
 * Password: all seed accounts share one password, read from SEED_PASSWORD
 * (environment or Backend/.env). When it is unset, a strong random password is
 * generated for the run and printed once at the end.
 */
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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
const BCRYPT_SALT_ROUNDS = 10; // mirrors authService
const GENERATED_PASSWORD_LENGTH = 20;

// Share of profiles attracted to their own gender (the rest want the opposite one).
const SAME_SEX_PREFERENCE_SHARE = 0.18;

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
  male: ['Moroccan man portrait', 'North African man portrait'],
  female: ['Moroccan woman portrait', 'North African woman portrait'],
};

const TAG_POOL = [
  'coffee', 'atay', 'football', 'raja', 'wydad', 'gnawa', 'rai', 'andalusi',
  'chaabi', 'cooking', 'tagine', 'couscous', 'harira', 'travel', 'surfing',
  'hiking', 'atlas', 'beach', 'cinema', 'photography', 'reading', 'fitness',
  'running', 'yoga', 'gaming', 'volunteering', 'languages', 'startups',
  'architecture', 'history',
];

interface MoroccanLocation {
  text: string;
  latitude: number;
  longitude: number;
}

const MOROCCAN_LOCATIONS: MoroccanLocation[] = [
  { text: 'Maarif, Casablanca', latitude: 33.5869, longitude: -7.6377 },
  { text: 'Gauthier, Casablanca', latitude: 33.5909, longitude: -7.6305 },
  { text: 'Anfa, Casablanca', latitude: 33.5944, longitude: -7.6608 },
  { text: 'Ain Diab, Casablanca', latitude: 33.5915, longitude: -7.6906 },
  { text: 'Hay Hassani, Casablanca', latitude: 33.5638, longitude: -7.6812 },
  { text: 'Sidi Maarouf, Casablanca', latitude: 33.5229, longitude: -7.6477 },
  { text: 'Agdal, Rabat', latitude: 34.0023, longitude: -6.8501 },
  { text: 'Hassan, Rabat', latitude: 34.0224, longitude: -6.8325 },
  { text: 'Hay Riad, Rabat', latitude: 33.9532, longitude: -6.8682 },
  { text: 'Gueliz, Marrakech', latitude: 31.6342, longitude: -8.0107 },
  { text: 'Medina, Marrakech', latitude: 31.6295, longitude: -7.9811 },
  { text: 'Ville Nouvelle, Fes', latitude: 34.0372, longitude: -5.0036 },
  { text: 'Medina, Fes', latitude: 34.0611, longitude: -4.9777 },
  { text: 'Malabata, Tangier', latitude: 35.7806, longitude: -5.7834 },
  { text: 'Iberia, Tangier', latitude: 35.7736, longitude: -5.8136 },
  { text: 'Agadir Bay, Agadir', latitude: 30.4074, longitude: -9.5995 },
  { text: 'Talborjt, Agadir', latitude: 30.4241, longitude: -9.5945 },
  { text: 'Centre Ville, Meknes', latitude: 33.8955, longitude: -5.5473 },
  { text: 'Oujda Centre, Oujda', latitude: 34.6814, longitude: -1.9086 },
  { text: 'Mohammedia Centre, Mohammedia', latitude: 33.6861, longitude: -7.3829 },
];

type Gender = 'male' | 'female';

const MOROCCAN_FIRST_NAMES: Record<Gender, string[]> = {
  male: [
    'Youssef', 'Amine', 'Mehdi', 'Hamza', 'Omar', 'Ayoub', 'Anas', 'Ilyas',
    'Adam', 'Reda', 'Karim', 'Sofiane', 'Nabil', 'Hicham', 'Taha', 'Othmane',
    'Zakaria', 'Ismail', 'Rayan', 'Soufiane',
  ],
  female: [
    'Sara', 'Aya', 'Imane', 'Salma', 'Nour', 'Meryem', 'Khadija', 'Hajar',
    'Fatima Zahra', 'Ghita', 'Rania', 'Wiam', 'Lina', 'Malak', 'Soukaina',
    'Zineb', 'Houda', 'Asmae', 'Nadia', 'Yasmine',
  ],
};

const MOROCCAN_LAST_NAMES = [
  'El Amrani', 'Bennani', 'Alaoui', 'El Fassi', 'Berrada', 'Tazi',
  'Idrissi', 'Belkadi', 'Mansouri', 'Cherkaoui', 'Lahlou', 'Benali',
  'Ouazzani', 'Hassani', 'El Khattabi', 'Bouzid', 'Amrani', 'Raji',
  'Lamrani', 'Sabri', 'El Mansouri', 'Ziani', 'Bennis', 'Bouras',
];

const MOROCCAN_BIO_TEMPLATES = [
  'I am happiest over atay, good conversation, and a walk by the sea.',
  'Weekdays are for work, weekends are for family, friends, and discovering new places.',
  'Always ready for a calm cafe, live music, or a quick trip outside the city.',
  'I like simple plans: good food, honest laughs, and people who keep their word.',
  'Football, road trips, and homemade couscous can fix almost any week.',
  'Looking for someone kind, curious, and ready to build something serious slowly.',
  'I love medina walks, sunset photos, and trying the best small restaurants in town.',
  'Big fan of Moroccan music, quiet evenings, and spontaneous beach days.',
  'I work hard, stay close to family, and appreciate people with good energy.',
  'Coffee after work, Sunday tagine, and a little adventure whenever possible.',
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

interface SeedPassword {
  value: string;
  fromEnv: boolean;
}

interface SeedSpec {
  index: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  sexualPreferences: Gender;
  birthdate: string; // yyyy-mm-dd
  biography: string;
  latitude: number;
  longitude: number;
  locationText: string;
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

// ------------------------------- Password ----------------------------------

/**
 * Strong random password (crypto RNG) with at least one lowercase, uppercase,
 * digit and symbol, so it also satisfies the app's registration rules.
 */
const generateStrongPassword = (): string => {
  const classes = [
    'abcdefghijkmnopqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
    '!@#%^*-_=+',
  ];
  const all = classes.join('');
  const chars = classes.map((set) => set[crypto.randomInt(set.length)]);
  while (chars.length < GENERATED_PASSWORD_LENGTH) chars.push(all[crypto.randomInt(all.length)]);

  // Fisher-Yates so the guaranteed characters are not always at the start.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** SEED_PASSWORD from the environment, or a freshly generated one. */
const resolveSeedPassword = (): SeedPassword => {
  const fromEnv = process.env.SEED_PASSWORD;
  if (fromEnv && fromEnv.trim().length > 0) {
    if (fromEnv.length < 8) {
      console.warn('[Seed] Warning: SEED_PASSWORD is shorter than 8 characters.');
    }
    return { value: fromEnv, fromEnv: true };
  }
  return { value: generateStrongPassword(), fromEnv: false };
};

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

const loadPoolCache = (allowStale = false): PoolCache | null => {
  try {
    if (!fs.existsSync(POOL_CACHE_PATH)) return null;
    const cache = JSON.parse(fs.readFileSync(POOL_CACHE_PATH, 'utf8')) as PoolCache;
    if (!Array.isArray(cache.photos) || !cache.fetchedAt) return null;
    if (!allowStale && Date.now() - new Date(cache.fetchedAt).getTime() > POOL_CACHE_MAX_AGE_MS) return null;
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
  if (freshPool && !env.PEXELS_API_KEY) {
    console.warn('[Seed] Warning: --fresh-pool needs PEXELS_API_KEY; reusing the cached pool instead.');
  }
  if (!freshPool || !env.PEXELS_API_KEY) {
    const cache = loadPoolCache(!env.PEXELS_API_KEY);
    if (cache) {
      const male = cache.photos.filter((p) => p.gender === 'male').length;
      const female = cache.photos.filter((p) => p.gender === 'female').length;
      const ageMs = Date.now() - new Date(cache.fetchedAt).getTime();
      const staleNote = ageMs > POOL_CACHE_MAX_AGE_MS ? ' stale' : '';
      console.log(`[Seed] Reusing${staleNote} cached Pexels pool (${male} male / ${female} female urls, fetched ${cache.fetchedAt}).`);
      return cache.photos;
    }
  }

  if (!env.PEXELS_API_KEY) {
    console.warn(
      '[Seed] Warning: PEXELS_API_KEY is not set and no cached Pexels pool is available — ' +
      'every profile gets a generated placeholder avatar.'
    );
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
    console.warn(`[Seed] Warning: photo download failed (${error?.message}) — using a placeholder avatar.`);
    return null;
  }
  if (!response.ok) {
    console.warn(`[Seed] Warning: photo download returned HTTP ${response.status} — using a placeholder avatar.`);
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
      console.warn('[Seed] Warning: downloaded file is not a valid JPEG/PNG/WebP — using a placeholder avatar.');
      return null;
    }

    const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    const filename = `${unique}${ext}`; // mirrors uploadService.buildFilename
    fs.renameSync(tmpPath, path.join(UPLOAD_DIR, filename));
    return `${UPLOAD_URL_PREFIX}/${filename}`;
  } catch (error: any) {
    safeUnlink(tmpPath);
    console.warn(`[Seed] Warning: could not store photo (${error?.message}) — using a placeholder avatar.`);
    return null;
  }
};

// --------------------------- Placeholder avatars ----------------------------

const AVATAR_SIZE = 256;
const AVATAR_BACKGROUNDS: [number, number, number][] = [
  [94, 129, 172], [191, 97, 106], [163, 190, 140], [208, 135, 112],
  [180, 142, 173], [136, 192, 208], [235, 203, 139], [143, 188, 187],
];

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer): number => {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC32_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/**
 * Renders a generic head-and-shoulders silhouette on a coloured gradient as a
 * real PNG (no dependencies, no network), so a profile always has a valid
 * profile picture even with --no-photos or when a download fails.
 */
const renderAvatarPng = (seed: number): Buffer => {
  const [r, g, b] = AVATAR_BACKGROUNDS[seed % AVATAR_BACKGROUNDS.length];
  const rowLength = AVATAR_SIZE * 3 + 1;
  const raw = Buffer.alloc(rowLength * AVATAR_SIZE);
  const centre = AVATAR_SIZE / 2;

  for (let y = 0; y < AVATAR_SIZE; y += 1) {
    raw[y * rowLength] = 0; // filter type: none
    const shade = 1.1 - (0.3 * y) / AVATAR_SIZE;
    for (let x = 0; x < AVATAR_SIZE; x += 1) {
      const inHead = (x - centre) ** 2 + (y - 100) ** 2 <= 46 ** 2;
      const inShoulders = ((x - centre) / 96) ** 2 + ((y - 250) / 84) ** 2 <= 1;
      const offset = y * rowLength + 1 + x * 3;
      if (inHead || inShoulders) {
        raw[offset] = 245;
        raw[offset + 1] = 245;
        raw[offset + 2] = 245;
      } else {
        raw[offset] = Math.min(255, Math.round(r * shade));
        raw[offset + 1] = Math.min(255, Math.round(g * shade));
        raw[offset + 2] = Math.min(255, Math.round(b * shade));
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(AVATAR_SIZE, 0);
  header.writeUInt32BE(AVATAR_SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  // compression, filter and interlace methods stay 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

/** Stores a placeholder avatar like an upload; returns its public URL or null. */
const storePlaceholderAvatar = (seed: number): string | null => {
  const unique = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const filename = `${unique}.png`; // mirrors uploadService.buildFilename
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    fs.writeFileSync(filePath, renderAvatarPng(seed));
    if (detectImageMime(filePath) !== 'image/png') {
      safeUnlink(filePath);
      return null;
    }
    return `${UPLOAD_URL_PREFIX}/${filename}`;
  } catch (error: any) {
    safeUnlink(filePath);
    console.warn(`[Seed] Warning: could not write placeholder avatar (${error?.message}).`);
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
  return Math.random() < 0.5 ? 'female' : 'male';
};

const pickLastConnection = (): Date => {
  // 5% "online" (within the 5-minute window), the rest spread over 10 days.
  if (Math.random() < 0.05) {
    return new Date(Date.now() - Math.floor(Math.random() * 4 * 60 * 1000));
  }
  return faker.date.recent({ days: 10 });
};

/**
 * Every seeded profile gets coordinates (manual-location users are geocoded
 * too, so a text-only location is no longer a real-world case) and a
 * location_text in the same "Neighborhood, City, Country" shape the geocoder
 * produces for real users.
 */
const pickMoroccanLocation = (): {
  locationText: string;
  latitude: number;
  longitude: number;
} => {
  const location = faker.helpers.arrayElement(MOROCCAN_LOCATIONS);

  return {
    locationText: `${location.text}, Morocco`,
    latitude: Number((location.latitude + faker.number.float({ min: -0.018, max: 0.018 })).toFixed(6)),
    longitude: Number((location.longitude + faker.number.float({ min: -0.018, max: 0.018 })).toFixed(6)),
  };
};

/** Two distinct template sentences, for more varied bios. */
const pickMoroccanBio = (): string =>
  faker.helpers.arrayElements(MOROCCAN_BIO_TEMPLATES, 2).join(' ');

/** Binary preference: mostly the opposite gender, sometimes the same one. */
const pickSexualPreference = (gender: Gender): Gender => {
  if (Math.random() < SAME_SEX_PREFERENCE_SHARE) return gender;
  return gender === 'male' ? 'female' : 'male';
};

const buildSpecs = (count: number, pool: PoolPhoto[]): SeedSpec[] => {
  // Shuffle per-gender pools so photo assignment looks random run to run.
  const femalePool = faker.helpers.shuffle(pool.filter((p) => p.gender === 'female'));
  const malePool = faker.helpers.shuffle(pool.filter((p) => p.gender === 'male'));
  const cursors = { female: 0, male: 0 };

  const nextPhoto = (gender: Gender): PoolPhoto | null => {
    const source = gender === 'female' ? femalePool : malePool;
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
    const location = pickMoroccanLocation();

    specs.push({
      index: i,
      username,
      email: `${username}@matcha.seed`,
      firstName: faker.helpers.arrayElement(MOROCCAN_FIRST_NAMES[gender]),
      lastName: faker.helpers.arrayElement(MOROCCAN_LAST_NAMES),
      gender,
      sexualPreferences: pickSexualPreference(gender),
      birthdate: faker.date.birthdate({ min: 21, max: 48, mode: 'age' }).toISOString().slice(0, 10),
      biography: pickMoroccanBio(),
      latitude: location.latitude,
      longitude: location.longitude,
      locationText: location.locationText,
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

  const seedPassword = resolveSeedPassword();

  console.log(
    `[Seed] Seeding ${args.count} fake profile(s)` +
    `${args.noPhotos ? ' with placeholder avatars (--no-photos)' : ''}...`
  );

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
      console.warn(
        `[Seed] Warning: the Pexels pool was too small for ${withoutPhoto} profile(s) — ` +
        'those profiles get a generated placeholder avatar instead.'
      );
    }

    // 2. Downloads (CDN, throttled) before any DB writes so failures are known early.
    const downloaded = await downloadAll(specs);

    // 3. DB inserts: users, tags, photos (same insertPhoto the real feature uses), fame.
    const passwordHash = await bcrypt.hash(seedPassword.value, BCRYPT_SALT_ROUNDS); // one hash for all seed accounts
    const tagCache = new Map<string, number>();
    let photosStored = 0;
    let placeholdersStored = 0;
    let incompleteProfiles = 0;

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

      // Every profile needs a profile picture to pass the completion gate:
      // fall back to a generated avatar when there is no downloaded portrait.
      let publicUrl = downloaded.get(spec.index) ?? null;
      if (publicUrl) {
        photosStored += 1;
      } else {
        publicUrl = storePlaceholderAvatar(spec.index);
        if (publicUrl) placeholdersStored += 1;
      }
      if (publicUrl) {
        await insertPhoto(userId, publicUrl, true); // marked as profile picture, like a real upload
      } else {
        incompleteProfiles += 1;
      }

      // Deterministic fame via the real service (views=0, likes=0, +10 when complete).
      await recalculateFameRating(userId);

      if (spec.index % 50 === 0) console.log(`[Seed]   ...${spec.index}/${args.count} profiles created`);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `\n[Seed] Done in ${elapsed}s — ${specs.length} profiles, ${photosStored} Pexels photos, ` +
      `${placeholdersStored} placeholder avatars.`
    );
    if (incompleteProfiles > 0) {
      console.warn(
        `[Seed] Warning: ${incompleteProfiles} profile(s) have no picture (disk error?) and ` +
        'will not pass the profile-completion gate.'
      );
    }

    // Orientation mix, with one example account per combination for testers.
    const combos: [Gender, Gender][] = [['male', 'female'], ['female', 'male'], ['male', 'male'], ['female', 'female']];
    console.log('[Seed] Orientation mix (gender -> wants):');
    for (const [gender, wants] of combos) {
      const matching = specs.filter((spec) => spec.gender === gender && spec.sexualPreferences === wants);
      const example = matching[0] ? `, e.g. ${matching[0].username}` : '';
      console.log(`[Seed]   ${gender} -> ${wants}: ${matching.length}${example}`);
    }

    console.log('[Seed] Log in with a seed username (e.g. seed_user_0001) and the seed password.');
    if (seedPassword.fromEnv) {
      console.log('[Seed] Password: uses SEED_PASSWORD from the environment.');
    } else {
      console.log('[Seed] ================================================================');
      console.log('[Seed]  SEED_PASSWORD was not set. Generated password for ALL seed accounts:');
      console.log(`[Seed]      ${seedPassword.value}`);
      console.log('[Seed]  It is not stored anywhere: save it now, or set SEED_PASSWORD and re-run with --wipe.');
      console.log('[Seed] ================================================================');
    }
  } catch (error: any) {
    console.error('[Seed] Fatal error (database?):', error?.message || error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
