import { AppError } from './AppError';

/**
 * Shared manual query-parameter validation for list endpoints (Browsing and
 * Research). Extracted verbatim from browsingController.ts so both features
 * reject the same malformed input with the same messages — no validation
 * library, and never a generic failure where a specific one is possible.
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_PAGE = 100_000;

export const MIN_AGE = 18;
export const MAX_AGE = 120;
export const MAX_FAME = 1_000_000;
export const MAX_LOCATION_LENGTH = 255;
export const MAX_TAG_FILTERS = 20;
export const TAG_NAME_PATTERN = /^[a-z0-9_-]{2,30}$/;

/** Reads a raw query value, treating absent/empty as undefined. */
export const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Parses an integer query parameter within [min, max].
 * Rejects floats, NaN, Infinity and out-of-range values with a clear message.
 */
export const parseBoundedInt = (raw: unknown, label: string, min: number, max: number): number => {
  const text = readString(raw);
  if (text === undefined) {
    throw AppError.badRequest(`${label} is required`);
  }
  if (!/^-?\d+$/.test(text)) {
    throw AppError.badRequest(`${label} must be a whole number (got "${text}")`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw AppError.badRequest(`${label} must be between ${min} and ${max} (got ${parsed})`);
  }
  return parsed;
};

export const parseOptionalInt = (
  raw: unknown,
  label: string,
  min: number,
  max: number
): number | undefined => {
  if (readString(raw) === undefined) return undefined;
  return parseBoundedInt(raw, label, min, max);
};

/**
 * Validates a sortBy value against the endpoint's allowed enum.
 * `allowed` and `fallback` are passed in because Browsing additionally offers
 * 'relevance' while Research does not.
 */
export const parseSortField = <T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T => {
  const text = readString(raw);
  if (text === undefined) return fallback;
  if (!allowed.includes(text as T)) {
    throw AppError.badRequest(
      `sortBy must be one of: ${allowed.join(', ')} (got "${text}")`
    );
  }
  return text as T;
};

/** Validates sortOrder, defaulting to the field's sensible direction. */
export const parseSortOrder = (raw: unknown, defaultOrder: 'asc' | 'desc'): 'asc' | 'desc' => {
  const text = readString(raw);
  if (text === undefined) return defaultOrder;
  const normalized = text.toLowerCase();
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw AppError.badRequest(`sortOrder must be either: asc, desc (got "${text}")`);
  }
  return normalized;
};

/**
 * Parses the comma-separated `tags` parameter into normalized tag names.
 * Accepts a leading '#' and any casing; rejects malformed entries and caps the
 * count so a huge list cannot be used to build an expensive ANY() array.
 */
export const parseTagFilters = (raw: unknown): string[] | undefined => {
  const text = readString(raw);
  if (text === undefined) return undefined;

  const parts = text
    .split(',')
    .map((part) => part.trim().replace(/^#/, '').toLowerCase())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return undefined;

  if (parts.length > MAX_TAG_FILTERS) {
    throw AppError.badRequest(
      `Too many tag filters: maximum is ${MAX_TAG_FILTERS} (got ${parts.length})`
    );
  }

  const invalid = parts.filter((part) => !TAG_NAME_PATTERN.test(part));
  if (invalid.length > 0) {
    throw AppError.badRequest(
      `Invalid tag filter${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}. ` +
        'Tags must be 2-30 characters of lowercase letters, numbers, underscores or hyphens.'
    );
  }

  // De-duplicate so "#vegan,vegan" does not count twice against the cap.
  return Array.from(new Set(parts));
};

export const parseLocationFilter = (raw: unknown): string | undefined => {
  const text = readString(raw);
  if (text === undefined) return undefined;
  if (text.length > MAX_LOCATION_LENGTH) {
    throw AppError.badRequest(`location must not exceed ${MAX_LOCATION_LENGTH} characters`);
  }
  // Reject wildcard characters so a caller cannot inject LIKE metacharacters
  // and turn the filter into an expensive full scan.
  if (/[%_\\]/.test(text)) {
    throw AppError.badRequest('location must not contain the characters % _ or \\');
  }
  return text;
};

/**
 * Parses a cross-filter range pair (minAge/maxAge, minFame/maxFame) and rejects
 * an inverted range with one shared message shape.
 */
export const parseRangePair = (
  rawMin: unknown,
  rawMax: unknown,
  label: string,
  min: number,
  max: number
): { min?: number; max?: number } => {
  const minParsed = parseOptionalInt(rawMin, `min${label}`, min, max);
  const maxParsed = parseOptionalInt(rawMax, `max${label}`, min, max);
  if (minParsed !== undefined && maxParsed !== undefined && minParsed > maxParsed) {
    throw AppError.badRequest(
      `min${label} (${minParsed}) cannot be greater than max${label} (${maxParsed})`
    );
  }
  return {
    ...(minParsed !== undefined ? { min: minParsed } : {}),
    ...(maxParsed !== undefined ? { max: maxParsed } : {}),
  };
};

/** Parses page + limit with the shared defaults/caps (limit 20, max 50). */
export const parsePagination = (
  rawPage: unknown,
  rawLimit: unknown
): { page: number; limit: number; offset: number } => {
  const page = rawPage === undefined ? 1 : parseBoundedInt(rawPage, 'page', 1, MAX_PAGE);
  const limit =
    rawLimit === undefined ? DEFAULT_LIMIT : parseBoundedInt(rawLimit, 'limit', 1, MAX_LIMIT);
  return { page, limit, offset: (page - 1) * limit };
};
