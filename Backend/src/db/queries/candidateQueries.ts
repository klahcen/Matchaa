import { query } from '../../config/db';
import { buildGeoSignalsSql } from '../../services/matchScoringService';

/**
 * Shared candidate-pool data access for Browsing AND Research.
 *
 * This module owns every discovery rule that must behave identically in both
 * features (extracted from browsingQueries.ts so the two can never drift):
 *   - the viewer CTE (gender / preference / coordinates)
 *   - the hard exclusions in `base`: never the viewer themself, verified
 *     accounts only, at least one photo, blocks excluded in BOTH directions,
 *     and binary gender preference compatibility
 *   - the shared column set: age, geo signals, shared tags, profile photo
 *   - the user filter clauses: age range, fame range, location partial match,
 *     tag match (ANY by default, ALL optional)
 *   - getViewerOrientation
 *
 * Location privacy: other users' exact coordinates never leave this module.
 * The candidate rows are read through `grid_users`, which snaps latitude and
 * longitude to a ~1 km grid (LOCATION_GRID_DECIMALS) BEFORE any distance,
 * same-area flag, sort key, relevance score or map position is computed. So
 * nothing derived from a candidate's location, even when probed from many
 * viewer positions, can reveal more than which grid cell they are in.
 *
 * What is NOT shared (feature-specific, lives in each feature's own module):
 *   - Browsing: the `scored` CTE (relevance formula) and relevance sorting
 *   - Research: plain sorting with no scoring at all
 *
 * All SQL is raw and fully parameterized; dynamic ORDER BY/LIMIT parts are
 * assembled from validated enums and bound parameters only.
 */

/**
 * Candidate coordinates are rounded to this many decimals: 0.01° is ~1.1 km
 * north-south and ~0.9 km east-west at Moroccan latitudes.
 */
export const LOCATION_GRID_DECIMALS = 2;

/**
 * Max per-axis offset (degrees) added to a cell centre for the map, so markers
 * in one cell don't stack. Under half a cell (0.005°), so a marker never leaves
 * its own cell. It is derived from the public user id, so subtracting it gives
 * back the cell centre and nothing finer.
 */
export const MAP_SPREAD_DEGREES = 0.004;

export type SortField = 'relevance' | 'age' | 'location' | 'fame' | 'commonTags';
export type SortOrder = 'asc' | 'desc';

/**
 * Default sort direction per field, matching the spec: fame/commonTags default
 * to desc, age to asc. `location` asc = nearest first; `relevance` is always
 * desc (highest score first) and ignores an explicit asc as meaningless.
 */
export const DEFAULT_SORT_ORDER: Record<SortField, SortOrder> = {
  relevance: 'desc',
  age: 'asc',
  location: 'asc',
  fame: 'desc',
  commonTags: 'desc',
};

export interface CandidateFilters {
  minAge?: number;
  maxAge?: number;
  location?: string;
  minFame?: number;
  maxFame?: number;
  /** Lowercase tag names. */
  tags?: string[];
  /**
   * ANY (default, matches typical search UX and the Browsing behavior) keeps a
   * candidate sharing at least one of the tags; ALL requires every tag.
   * Flip here in one place — both features honour it.
   */
  tagsMatch?: 'any' | 'all';
  /**
   * Swipe mode (Browsing only): the viewer's id. Hides everyone they already
   * liked or passed on, so the deck never deals the same profile twice.
   */
  excludeSwipedBy?: number;
}

export interface CandidatePagination {
  limit: number;
  offset: number;
}

/** One candidate profile — the shared summary shape (no relevance score). */
export interface CandidateRow {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  age: number | null;
  gender: string | null;
  photo_url: string | null;
  location_text: string | null;
  fame_rating: number;
  shared_tag_count: number;
  shared_tags: string[];
  /** Whole km (at least 1) from the viewer to the candidate's ~1 km grid cell. */
  distance_km: number | null;
  same_area: boolean;
  /** Grid cell centre plus a fixed per-user spread inside the cell; never exact GPS. */
  map_latitude: number | null;
  map_longitude: number | null;
}

export interface ViewerOrientation {
  id: number;
  gender: 'male' | 'female';
  /** The gender this viewer wants to see. */
  preference: 'male' | 'female';
  /** Retained in the response contract; always false under the binary model. */
  genderRequired: false;
}

export const getViewerOrientation = async (viewerId: number): Promise<ViewerOrientation | null> => {
  const result = await query<{ gender: string | null; sexual_preferences: string | null }>(
    `SELECT gender, sexual_preferences FROM users WHERE id = $1 LIMIT 1`,
    [viewerId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const gender = row.gender === 'female' ? 'female' : 'male';
  const preference = row.sexual_preferences === 'male' ? 'male' : 'female';

  return {
    id: viewerId,
    gender,
    preference,
    genderRequired: false,
  };
};

export interface CandidateCte {
  /** `WITH viewer AS (...), grid_users AS (...), base AS (...), candidates AS (...)` — no trailing SELECT. */
  sql: string;
  /** Bound parameters used by `sql` ($1..$N): viewer id, grid constants, geo constants. */
  values: any[];
}

/**
 * Builds the shared candidate-pool CTE chain. Callers continue binding their
 * own parameters from `values.length + 1` and select `FROM candidates` (or a
 * feature-specific CTE wrapping it, like Browsing's `scored`).
 *
 * The candidates set is referenced by outer queries under the alias `c`, which
 * is also what buildFilterWhereClause and the location ORDER BY assume.
 */
export const buildCandidateCte = (viewerId: number): CandidateCte => {
  const values: any[] = [viewerId];
  const bind = (value: number): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const pGridDecimals = bind(LOCATION_GRID_DECIMALS);
  const pSpread = bind(MAP_SPREAD_DEGREES);

  // Geographic signal expressions, bound once and reused across both CTE
  // levels so the Haversine formula and its radius constant appear a single
  // time. Their `u` alias is a grid_users row, so every signal is cell-level.
  const geo = buildGeoSignalsSql(values.length + 1);
  values.push(...geo.values);

  // Fixed pseudo-random spread in [-spread, +spread] per axis, from the user id
  // (bigint so large ids can't overflow int4).
  const spread = (multiplier: number): string =>
    `((((u.id::bigint * ${multiplier}) % 1000)::float / 999.0) - 0.5) * 2 * ${pSpread}::float`;

  const sql = `
    WITH viewer AS (
      SELECT id, gender,
             sexual_preferences AS preference,
             latitude, longitude, location_text
      FROM users
      WHERE id = $1
    ),
    -- Candidates with coordinates snapped to the ~1 km grid. Every column below
    -- reads location from here, never from users.latitude/longitude directly.
    grid_users AS (
      SELECT id, username, first_name, last_name, gender, sexual_preferences,
             fame_rating, location_text, birthdate, is_verified,
             ROUND(latitude::numeric, ${pGridDecimals}::int)::float AS latitude,
             ROUND(longitude::numeric, ${pGridDecimals}::int)::float AS longitude
      FROM users
    ),
    base AS (
      SELECT
        u.id,
        u.username,
        u.first_name,
        u.last_name,
        u.gender,
        u.fame_rating,
        u.location_text,
        CASE WHEN u.latitude IS NULL OR u.longitude IS NULL THEN NULL
             ELSE ROUND((u.latitude + ${spread(7919)})::numeric, 5)::float
        END AS map_latitude,
        CASE WHEN u.latitude IS NULL OR u.longitude IS NULL THEN NULL
             ELSE ROUND((u.longitude + ${spread(104729)})::numeric, 5)::float
        END AS map_longitude,
        CASE WHEN u.birthdate IS NULL THEN NULL
             ELSE date_part('year', age(u.birthdate))::int
        END AS age,
        ${geo.distanceKm} AS distance_km,
        ${geo.textExact}  AS text_exact,
        ${geo.textPartial} AS text_partial,
        (SELECT COUNT(*)::int
           FROM user_tags ct
           JOIN user_tags vt ON vt.tag_id = ct.tag_id
          WHERE ct.user_id = u.id AND vt.user_id = v.id) AS shared_tag_count,
        COALESCE((SELECT json_agg(t.name ORDER BY t.name)
           FROM user_tags ct
           JOIN user_tags vt ON vt.tag_id = ct.tag_id AND vt.user_id = v.id
           JOIN tags t ON t.id = ct.tag_id
          WHERE ct.user_id = u.id), '[]'::json) AS shared_tags,
        -- Prefer the flagged profile picture; fall back to the oldest photo so
        -- a user who deleted their profile picture stays discoverable.
        (SELECT p.url FROM photos p
          WHERE p.user_id = u.id
          ORDER BY p.is_profile_picture DESC, p.created_at ASC, p.id ASC
          LIMIT 1) AS photo_url
      FROM grid_users u
      CROSS JOIN viewer v
      WHERE u.id <> v.id
        AND u.is_verified = TRUE
        -- Must have at least one photo to be worth showing.
        AND EXISTS (SELECT 1 FROM photos p WHERE p.user_id = u.id)
        -- Exclude blocks in BOTH directions.
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = v.id AND b.blocked_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = v.id)
        -- Binary mutual preference filter:
        -- I see users whose gender matches my preference, and who also want my gender.
        AND u.gender::text = v.preference::text
        AND u.sexual_preferences::text = v.gender::text
    ),
    candidates AS (
      SELECT b.*,
             ${geo.sameArea('b.distance_km', 'b.text_exact')} AS same_area
      FROM base b
    )`;

  return { sql, values };
};

/**
 * Builds the shared user-filter clause for the outer SELECT (applied to the
 * candidate alias `c`). `next` binds a value and returns its placeholder, so
 * every filter value stays parameterized. Returns '' when no filter is set —
 * an empty search is a valid "everyone eligible" query.
 */
export const buildFilterWhereClause = (
  filters: CandidateFilters,
  next: (value: any) => string
): string => {
  const whereFilters: string[] = [];

  if (filters.minAge !== undefined) {
    whereFilters.push(`c.age IS NOT NULL AND c.age >= ${next(filters.minAge)}`);
  }
  if (filters.maxAge !== undefined) {
    whereFilters.push(`c.age IS NOT NULL AND c.age <= ${next(filters.maxAge)}`);
  }
  if (filters.minFame !== undefined) {
    whereFilters.push(`c.fame_rating >= ${next(filters.minFame)}`);
  }
  if (filters.maxFame !== undefined) {
    whereFilters.push(`c.fame_rating <= ${next(filters.maxFame)}`);
  }
  if (filters.location) {
    // Partial, case-insensitive match against the readable location.
    whereFilters.push(`LOWER(c.location_text) LIKE '%' || ${next(filters.location.toLowerCase())} || '%'`);
  }
  if (filters.tags && filters.tags.length > 0) {
    if (filters.tagsMatch === 'all') {
      // Candidate must carry EVERY requested tag: count the distinct matches
      // and require the full list length.
      whereFilters.push(`(
        SELECT COUNT(DISTINCT LOWER(ftg.name))
          FROM user_tags ft
          JOIN tags ftg ON ftg.id = ft.tag_id
         WHERE ft.user_id = c.id AND LOWER(ftg.name) = ANY(${next(filters.tags)}::text[])
      ) = ${next(filters.tags.length)}`);
    } else {
      // Default ANY: "shares at least one of these tags" — names matched lowercase.
      whereFilters.push(`EXISTS (
        SELECT 1 FROM user_tags ft
        JOIN tags ftg ON ftg.id = ft.tag_id
        WHERE ft.user_id = c.id AND LOWER(ftg.name) = ANY(${next(filters.tags)}::text[])
      )`);
    }
  }

  if (filters.excludeSwipedBy !== undefined) {
    const pViewer = next(filters.excludeSwipedBy);
    whereFilters.push(`NOT EXISTS (SELECT 1 FROM likes sl WHERE sl.liker_id = ${pViewer} AND sl.liked_id = c.id)`);
    whereFilters.push(`NOT EXISTS (SELECT 1 FROM passes sp WHERE sp.user_id = ${pViewer} AND sp.passed_user_id = c.id)`);
  }

  return whereFilters.length > 0 ? `AND ${whereFilters.join('\n      AND ')}` : '';
};

/**
 * Location ordering, shared so "nearest first" means the same thing in both
 * features: confirmed same-area rows lead, then measured distance, then
 * text-only city matches, then everything unknown. Desc reverses the measured
 * distance. Callers append their own total-order tiebreak.
 */
export const buildLocationOrderBy = (order: SortOrder, tiebreak: string): string =>
  order === 'asc'
    ? `c.same_area DESC, c.distance_km ASC NULLS LAST, c.text_partial DESC, ${tiebreak}`
    : `c.distance_km DESC NULLS LAST, c.same_area DESC, ${tiebreak}`;

/** Maps one raw pg row to the shared CandidateRow shape. */
export const mapCandidateRow = (r: Record<string, any>): CandidateRow => ({
  id: r.id,
  username: r.username,
  first_name: r.first_name,
  last_name: r.last_name,
  age: r.age ?? null,
  gender: r.gender ?? null,
  photo_url: r.photo_url ?? null,
  location_text: r.location_text ?? null,
  fame_rating: r.fame_rating ?? 0,
  shared_tag_count: r.shared_tag_count ?? 0,
  shared_tags: Array.isArray(r.shared_tags) ? r.shared_tags : [],
  distance_km: r.distance_km === null || r.distance_km === undefined ? null : Number(r.distance_km),
  same_area: Boolean(r.same_area),
  map_latitude: r.map_latitude === null || r.map_latitude === undefined ? null : Number(r.map_latitude),
  map_longitude: r.map_longitude === null || r.map_longitude === undefined ? null : Number(r.map_longitude),
});

/**
 * Shared SELECT column list for the candidate summary (alias `c`).
 * The exposed distance is whole kilometres with a floor of 1 km, matching the
 * grid precision it is computed from (sorting and scoring still use the
 * unrounded cell-level value internally).
 */
export const CANDIDATE_SELECT_COLUMNS = `
      c.id, c.username, c.first_name, c.last_name, c.age, c.gender,
      c.photo_url, c.location_text, c.fame_rating,
      c.shared_tag_count, c.shared_tags,
      CASE WHEN c.distance_km IS NULL THEN NULL
           ELSE GREATEST(1, ROUND(c.distance_km::numeric))::int
      END AS distance_km,
      c.same_area, c.map_latitude, c.map_longitude`;

/** Page query + count query pair sharing one WHERE, so total never disagrees. */
export interface BuiltCandidateQuery {
  sql: string;
  countSql: string;
  /** Parameters for `sql` (includes limit/offset). */
  values: any[];
  /** Parameters for `countSql` (excludes limit/offset). */
  countValues: any[];
}
