import { AppError } from '../utils/AppError';

/**
 * Reverse geocoding via the free Nominatim / OpenStreetMap API (no API key).
 *
 * Nominatim usage policy compliance:
 *  - A meaningful User-Agent identifying the app is sent on every request.
 *  - A minimum interval is enforced between calls (module-level throttle),
 *    so bursts of requests can never exceed ~1 req/s.
 *  - Only the address fields we actually need are requested.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'MatchaDatingApp/1.0 (school project; https://github.com/lkazaz/Matchaa)';
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 10000;

let lastRequestAt = 0;

/**
 * Serializes outbound Nominatim calls to respect the 1 request/second policy.
 */
const throttle = async (): Promise<void> => {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
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
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
  display_name?: string;
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

    if (!response.ok) {
      throw AppError.internal(`Geocoding provider returned status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err?.name === 'AbortError') {
      throw AppError.internal('Geocoding provider timed out. Please try again.');
    }
    throw AppError.internal('Unable to reach the geocoding provider. Please try again later.');
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

/**
 * Builds a coarse, neighborhood-level location string from Nominatim address parts.
 * Never includes house number or street, so the stored text stays approximate
 * and safe to show publicly.
 */
const buildLocationText = (address: NominatimAddress | undefined, fallback: string): string => {
  if (!address) return fallback;

  // Ordered from most granular (neighborhood) to coarsest (county), so the
  // first available part gives neighborhood-level precision.
  const localityCandidates = [
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
  ];

  const locality = localityCandidates
    .map((part) => (typeof part === 'string' ? cleanNamePart(part) : ''))
    .find((part) => part.length > 1);

  const region = address.state ? cleanNamePart(address.state) : '';
  const country = address.country ? cleanNamePart(address.country) : '';

  const parts = [locality, region, country].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : fallback;
};

/**
 * Converts lat/lng into a readable neighborhood/city string.
 * Throws a 502-style AppError when the provider cannot resolve the coordinates.
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  const data = await nominatimGet<NominatimReverseResponse>('/reverse', {
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '14',
    'accept-language': 'en',
  });

  if (!data || typeof data !== 'object') {
    throw AppError.badRequest('Could not resolve those coordinates to a location.');
  }

  return buildLocationText(data.address, data.display_name || 'Unknown location');
};

export interface GeocodeResult {
  lat: number;
  lng: number;
  resolvedText: string;
}

/**
 * Converts free-text location input (city or neighborhood) into coordinates
 * plus a normalized readable string. Used for the manual-entry fallback.
 * Throws a 400 when the text cannot be resolved.
 */
export const geocodeLocation = async (locationText: string): Promise<GeocodeResult> => {
  const data = await nominatimGet<NominatimSearchResult[]>('/search', {
    q: locationText,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    'accept-language': 'en',
  });

  if (!Array.isArray(data) || data.length === 0) {
    throw AppError.badRequest(
      `Could not find "${locationText}". Try a city or neighborhood name, e.g. "Casablanca".`
    );
  }

  const lat = Number.parseFloat(String(data[0].lat));
  const lng = Number.parseFloat(String(data[0].lon));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw AppError.badRequest('The location provider returned invalid coordinates.');
  }

  return {
    lat,
    lng,
    resolvedText: buildLocationText(data[0].address, data[0].display_name || locationText),
  };
};
