import { AppError } from '../utils/AppError';

/**
 * Forward and reverse geocoding via the free Nominatim / OpenStreetMap API (no API key).
 *
 * Nominatim usage policy compliance:
 *  - A meaningful User-Agent identifying the app is sent on every request.
 *  - Outbound calls go through ONE serialized queue spaced MIN_INTERVAL_MS
 *    apart, so even concurrent users can never exceed ~1 req/s. The queue is
 *    bounded: past MAX_QUEUE_DEPTH waiting callers we answer 503 instead of
 *    piling up requests.
 *  - Results (including "not found") are cached in memory, so repeated lookups
 *    of the same place never hit the provider again.
 *  - Only the address fields we actually need are requested.
 *
 * Provider failures (unreachable, timeout, 429 rate limit, 5xx) surface as a
 * 503 AppError with a user-readable message; "place not found" is a 400.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'MatchaDatingApp/1.0 (school project; https://github.com/lkazaz/Matchaa)';
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_QUEUE_DEPTH = 20;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // successful lookups: 24h
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000; // "not found": 10 min
const CACHE_MAX_ENTRIES = 1000;

/** Coarser than street level: Nominatim place_rank 26+ is a road, 30 a house. */
const MAX_APPROXIMATE_PLACE_RANK = 25;

const serviceUnavailable = (message: string): AppError => new AppError(message, 503);

let lastRequestAt = 0;
let queueTail: Promise<void> = Promise.resolve();
let waitingCount = 0;

/**
 * Waits for this caller's turn in the shared queue. Each slot starts at least
 * MIN_INTERVAL_MS after the previous one, which is what keeps concurrent
 * callers under the 1 request/second policy (a bare "check the last timestamp"
 * throttle lets two simultaneous callers fire together).
 */
const throttle = async (): Promise<void> => {
  if (waitingCount >= MAX_QUEUE_DEPTH) {
    throw serviceUnavailable(
      'The location service is busy right now. Please try again in a minute.'
    );
  }

  waitingCount += 1;
  const slot = queueTail.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
  });
  queueTail = slot;

  try {
    await slot;
  } finally {
    waitingCount -= 1;
  }
};

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Returns the live entry for `key`, or undefined on a miss / expiry. */
const cacheGet = (key: string): CacheEntry | undefined => {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
};

const cacheSet = (key: string, value: unknown, ttlMs: number): void => {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order: drop the oldest entry.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimReverseResponse {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
  /** Set (with HTTP 200) when nothing exists at the coordinates, e.g. open sea. */
  error?: string;
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  place_rank?: number;
  address?: NominatimAddress;
}

/**
 * Performs a GET against Nominatim with a timeout and JSON parsing.
 */
const nominatimGet = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  await throttle();

  const url = new URL(`${NOMINATIM_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw serviceUnavailable(
        'The location service is receiving too many requests. Please try again in a minute.'
      );
    }
    if (!response.ok) {
      console.error(`[Geocoding] Nominatim returned HTTP ${response.status} for ${path}`);
      throw serviceUnavailable(
        'The location service is temporarily unavailable. Please try again later.'
      );
    }

    return (await response.json()) as T;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.name === 'AbortError') {
      throw serviceUnavailable('The location service took too long to answer. Please try again.');
    }
    if (err instanceof SyntaxError) {
      throw serviceUnavailable(
        'The location service sent an unreadable answer. Please try again later.'
      );
    }
    throw serviceUnavailable(
      'Unable to reach the location service right now. Please try again later.'
    );
  } finally {
    clearTimeout(timer);
  }
};

/**
 * OpenStreetMap names are frequently bilingual, e.g. a Casablanca suburb comes
 * back as "Arrondissement de Mers Sultan مقاطعة مرس السلطان". Since we request
 * accept-language=en, drop the secondary (non-Latin) script from a mixed string
 * so the stored text stays readable.
 *
 * A string with no Latin letters at all (e.g. "東京", "Москва") is left untouched,
 * otherwise locations in non-Latin-script countries would be erased.
 */
const NON_LATIN_RUN =
  /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\uFB50-\uFDFF\uFE70-\uFEFF]+/g;
const HAS_LATIN = /[A-Za-z\u00C0-\u024F]/;

const cleanNamePart = (value: string): string => {
  const stripped = HAS_LATIN.test(value) ? value.replace(NON_LATIN_RUN, ' ') : value;
  // Collapse the whitespace left behind by the removal, and tidy separators.
  // Only whitespace that already exists is normalized, so hyphens inside a
  // name ("Casablanca-Settat") are preserved rather than split apart.
  return stripped
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:-])/g, '$1')
    .replace(/([,.;:])\s*/g, '$1 ')
    .replace(/[,.;:\-\s]+$/g, '')
    .replace(/^[,.;:\-\s]+/g, '')
    .trim();
};

/** First usable (cleaned, 2+ chars) name among the candidates, or ''. */
const firstNamePart = (candidates: (string | undefined)[]): string =>
  candidates
    .map((part) => (typeof part === 'string' ? cleanNamePart(part) : ''))
    .find((part) => part.length > 1) ?? '';

/**
 * Builds a coarse, neighborhood-level location string from Nominatim address parts,
 * e.g. "Maarif, Casablanca, Morocco" or "Casablanca, Morocco".
 * Never includes house number or street, so the stored text stays approximate
 * and safe to show publicly.
 */
const buildLocationText = (address: NominatimAddress | undefined, fallback: string): string => {
  if (!address) return fallback;

  // Ordered from most granular (neighborhood) to coarsest (county), so the
  // first available part gives neighborhood-level precision.
  const locality = firstNamePart([
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.city_district,
    address.city,
    address.town,
    address.village,
    address.hamlet,
    address.municipality,
    address.county,
  ]);
  const city = firstNamePart([address.city, address.town, address.village, address.municipality]);
  const region = firstNamePart([address.state, address.county]);
  const country = address.country ? cleanNamePart(address.country) : '';

  // The city is named after a neighborhood ("Maarif, Casablanca"); the region
  // only stands in when there is no city at all (rural places).
  const parts = [locality, city, city ? '' : region, country].filter((part, index, all) =>
    part.length > 0 && all.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === index
  );

  return parts.length > 0 ? parts.join(', ') : fallback;
};

/**
 * Converts lat/lng into a readable neighborhood/city string.
 * Throws a 400 when nothing is there, a 503 when the provider is unavailable.
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  // ~11 m buckets: plenty for a neighbourhood-level (zoom 14) answer.
  const cacheKey = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached.value as string;

  const data = await nominatimGet<NominatimReverseResponse>('/reverse', {
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '14',
    'accept-language': 'en',
  });

  if (!data || typeof data !== 'object' || data.error || (!data.address && !data.display_name)) {
    throw AppError.badRequest(
      'We could not match your position to a city or neighborhood. Enter your location manually instead.'
    );
  }

  const text = buildLocationText(data.address, data.display_name || 'Unknown location');
  cacheSet(cacheKey, text, CACHE_TTL_MS);
  return text;
};

export interface GeocodeResult {
  lat: number;
  lng: number;
  resolvedText: string;
}

const placeNotFound = (locationText: string): AppError =>
  AppError.badRequest(
    `We couldn't find "${locationText}". Check the spelling, or try a nearby city or ` +
      'neighborhood (e.g. "Maarif, Casablanca").'
  );

/**
 * Converts free-text location input (city or neighborhood) into approximate
 * coordinates plus a normalized readable string. Used for the manual-entry
 * fallback when the user declines GPS.
 *
 * featureType=settlement limits matches to inhabited places from region down to
 * neighbourhood, so a typed street address can never pin the user to a house;
 * the coordinates returned are the place's centre. As a second guard, anything
 * finer than a neighbourhood is snapped to a ~1 km grid.
 *
 * Throws a 400 when the text cannot be resolved, a 503 when the provider is
 * unavailable. Nothing is cached on provider failure.
 */
export const geocodeLocation = async (locationText: string): Promise<GeocodeResult> => {
  const cacheKey = `search:${locationText.trim().toLowerCase().replace(/\s+/g, ' ')}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    if (cached.value === null) throw placeNotFound(locationText);
    return cached.value as GeocodeResult;
  }

  const data = await nominatimGet<NominatimSearchResult[]>('/search', {
    q: locationText,
    format: 'jsonv2',
    addressdetails: '1',
    featureType: 'settlement',
    limit: '1',
    'accept-language': 'en',
  });

  if (!Array.isArray(data) || data.length === 0) {
    cacheSet(cacheKey, null, NEGATIVE_CACHE_TTL_MS);
    throw placeNotFound(locationText);
  }

  const place = data[0];
  let lat = Number.parseFloat(String(place.lat));
  let lng = Number.parseFloat(String(place.lon));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw serviceUnavailable(
      'The location service returned an invalid answer. Please try again later.'
    );
  }

  if (typeof place.place_rank === 'number' && place.place_rank > MAX_APPROXIMATE_PLACE_RANK) {
    lat = Math.round(lat * 100) / 100;
    lng = Math.round(lng * 100) / 100;
  }

  const result: GeocodeResult = {
    lat,
    lng,
    resolvedText: buildLocationText(place.address, place.display_name || locationText),
  };
  cacheSet(cacheKey, result, CACHE_TTL_MS);
  return result;
};
