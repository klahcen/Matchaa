import { query } from '../../config/db';
import { buildGeoSignalsSql } from '../../services/matchScoringService';

/**
 * Shared candidate-pool data access for Browsing AND Research.
 *
 * This module owns every discovery rule that must behave identically in both
 * features (extracted from browsingQueries.ts so the two can never drift):
 *   - the viewer CTE (gender / effective preference / coordinates)
 *   - the hard exclusions in `base`: never the viewer themself, verified
 *     accounts only, at least one photo, blocks excluded in BOTH directions,
 *     and sexual-orientation compatibility (unspecified preference defaults
 *     to bisexual; NULL gender fails gendered comparisons)
 *   - the shared column set: age, geo signals, shared tags, profile photo
 *   - the user filter clauses: age range, fame range, location partial match,
 *     tag match (ANY by default, ALL optional)
 *   - getViewerOrientation + the "gender required" rule
 *
 * What is NOT shared (feature-specific, lives in each feature's own module):
 *   - Browsing: the `scored` CTE (relevance formula) and relevance sorting
 *   - Research: plain sorting with no scoring at all
 *
 * All SQL is raw and fully parameterized; dynamic ORDER BY/LIMIT parts are
 * assembled from validated enums and bound parameters only.
 */

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
  distance_km: number | null;
  same_area: boolean;
}

export interface ViewerOrientation {
  id: number;
  gender: string | null;
  /** Effective preference after applying the "unspecified = bisexual" rule. */
  preference: 'heterosexual' | 'homosexual' | 'bisexual';
  /**
   * True when a gendered preference cannot be evaluated because the viewer has
   * not set their own gender. Controllers return zero rows plus this flag
   * rather than silently widening the filter to bisexual.
   */
  genderRequired: boolean;
}

/**
 * Resolves the viewer's effective orientation, applying the documented default
 * (unspecified sexual preference => bisexual).
 */
export const getViewerOrientation = async (viewerId: number): Promise<ViewerOrientation | null> => {
  const result = await query<{ gender: string | null; sexual_preferences: string | null }>(
    `SELECT gender, sexual_preferences FROM users WHERE id = $1 LIMIT 1`,
    [viewerId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const raw = (row.sexual_preferences ?? '').trim().toLowerCase();
  const preference: ViewerOrientation['preference'] =
    raw === 'heterosexual' || raw === 'homosexual' ? raw : 'bisexual';

  const gender = (row.gender ?? '').trim().toLowerCase() || null;

  return {
    id: viewerId,
    gender,
    preference,
    // A gendered preference needs the viewer's own gender to be meaningful.
    genderRequired: preference !== 'bisexual' && gender === null,
  };
};

export interface CandidateCte {
  /** `WITH viewer AS (...), base AS (...), candidates AS (...)` — no trailing SELECT. */
  sql: string;
  /** Bound parameters used by `sql` ($1..$N): viewer id + geo constants. */
  values: any[];
}

/**
 * Builds the shared three-CTE candidate pool. Callers continue binding their
 * own parameters from `values.length + 1` and select `FROM candidates` (or a
 * feature-specific CTE wrapping it, like Browsing's `scored`).
 *
 * The candidates set is referenced by outer queries under the alias `c`, which
 * is also what buildFilterWhereClause and the location ORDER BY assume.
 */
export const buildCandidateCte = (viewerId: number): CandidateCte => {
  const values: any[] = [viewerId];

  // Geographic signal expressions, bound once ($2..$N) and reused across both
  // CTE levels so the Haversine formula and its radius constant appear a
  // single time.
  const geo = buildGeoSignalsSql(values.length + 1);
  values.push(...geo.values);

  const sql = `
    WITH viewer AS (
      SELECT id, gender,
             COALESCE(NULLIF(LOWER(BTRIM(sexual_preferences)), ''), 'bisexual') AS preference,
             latitude, longitude, location_text
      FROM users
      WHERE id = $1
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
      FROM users u
      CROSS JOIN viewer v
      WHERE u.id <> v.id
        AND u.is_verified = TRUE
        -- Must have at least one photo to be worth showing.
        AND EXISTS (SELECT 1 FROM photos p WHERE p.user_id = u.id)
        -- Exclude blocks in BOTH directions.
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = v.id AND b.blocked_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = v.id)
        -- Orientation filter, enforced here so excluded profiles are never
        -- returned by the API at all (not merely hidden by the frontend).
        --   bisexual     -> any gender (including candidates with none set)
        --   heterosexual -> candidate gender must DIFFER from the viewer's
        --   homosexual   -> candidate gender must MATCH the viewer's
        -- A NULL on either side fails the comparison, so gendered viewers never
        -- see candidates of unknown gender, and a viewer with no gender set gets
        -- zero rows (controllers short-circuit that case with a clear flag).
        AND (
          v.preference = 'bisexual'
          OR (v.preference = 'heterosexual' AND v.gender IS NOT NULL
                AND u.gender IS NOT NULL AND u.gender <> v.gender)
          OR (v.preference = 'homosexual'   AND v.gender IS NOT NULL
                AND u.gender IS NOT NULL AND u.gender =  v.gender)
        )
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
});

/** Shared SELECT column list for the candidate summary (alias `c`). */
export const CANDIDATE_SELECT_COLUMNS = `
      c.id, c.username, c.first_name, c.last_name, c.age, c.gender,
      c.photo_url, c.location_text, c.fame_rating,
      c.shared_tag_count, c.shared_tags,
      ROUND(c.distance_km::numeric, 1)::float AS distance_km,
      c.same_area`;

/** Page query + count query pair sharing one WHERE, so total never disagrees. */
export interface BuiltCandidateQuery {
  sql: string;
  countSql: string;
  /** Parameters for `sql` (includes limit/offset). */
  values: any[];
  /** Parameters for `countSql` (excludes limit/offset). */
  countValues: any[];
}
