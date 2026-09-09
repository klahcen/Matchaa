/**
 * ============================================================================
 * MATCHA — MATCH RELEVANCE SCORING
 * ============================================================================
 *
 * Single source of truth for the suggestion ranking formula. The constants and
 * the arithmetic live here in TypeScript (so they are documented, type-checked
 * and unit-testable), and are emitted into the SQL as *bound parameters* so the
 * database performs the sorting and pagination.
 *
 * Scoring MUST happen in SQL rather than in JS: paginating first and then
 * sorting in memory would rank only the fetched page instead of the whole
 * result set, which breaks both ordering and pagination.
 *
 * Every value the SQL needs is passed as a $n placeholder. Nothing is
 * string-interpolated from user input, so there is no injection surface.
 *
 * ----------------------------------------------------------------------------
 * THE FORMULA
 * ----------------------------------------------------------------------------
 * Three independent signals are each normalised to [0, 1], combined as a
 * weighted sum, and scaled to a 0–100 integer "relevance score":
 *
 *     relevance = round( 100 × ( W_GEO  × S_geo
 *                              + W_TAGS × S_tags
 *                              + W_FAME × S_fame ) )
 *
 *   W_GEO  = 0.45     W_TAGS = 0.35     W_FAME = 0.20     (sum = 1.00)
 *
 * ----------------------------------------------------------------------------
 * WHY THESE WEIGHTS (defence rationale)
 * ----------------------------------------------------------------------------
 * The subject lists proximity first and explicitly demands that users in the
 * *same geographical area* be prioritised, so geography gets the largest weight
 * (0.45). Shared interests are the strongest available signal of genuine
 * compatibility — and unlike fame they cannot be farmed — so tags take 0.35.
 * Fame rating is a social-proof tiebreaker: real, but weak evidence of
 * compatibility for *this* viewer, and it grows without bound as views and
 * likes accumulate, so it gets the smallest weight (0.20).
 *
 * The weights sum to exactly 1.00, which keeps `relevance` inside [0, 100] and
 * makes it readable as a percentage-style match score.
 *
 * ----------------------------------------------------------------------------
 * S_geo — PROXIMITY  (weight 0.45)
 * ----------------------------------------------------------------------------
 * Deliberately not a raw distance: kilometres are unbounded and would swamp the
 * other two signals. Instead, a saturating decay in four tiers:
 *
 *   1. same_area           -> 1.00
 *      "Same area" = both have GPS and are within SAME_AREA_RADIUS_KM (5 km,
 *      neighbourhood scale), OR their location_text matches exactly.
 *      This flat 1.00 IS the same-area priority the subject demands: inside one
 *      neighbourhood, geography stops differentiating and the ranking is
 *      decided by shared interests and fame instead.
 *
 *   2. both have GPS       -> GEO_HALF_VALUE_KM / (GEO_HALF_VALUE_KM + d)
 *      Haversine great-circle distance d in km. GEO_HALF_VALUE_KM = 25 is the
 *      single tunable parameter and has a plain-English meaning: *the distance
 *      at which a candidate is worth half as much as a neighbour*.
 *        d =   0 km -> 1.00      d =  25 km -> 0.50
 *        d =   5 km -> 0.83      d = 100 km -> 0.20
 *        d =  10 km -> 0.71      d = 500 km -> 0.05
 *      Smooth, strictly decreasing, bounded in (0, 1], needs no clamping, and
 *      degrades gracefully instead of falling off a cliff at a hard cutoff.
 *
 *   3. text_partial        -> 0.60
 *      No usable GPS pair, but one location_text contains the other (e.g.
 *      "Casablanca" vs "Casablanca, Morocco"): same city, coarser precision.
 *      Below a confirmed same-area match, above a stranger elsewhere.
 *
 *   4. otherwise / unknown -> 0.10
 *      Coordinates missing on either side and no text overlap. Per the spec
 *      these are treated as "distance unknown" and ranked low — but on a small
 *      positive floor rather than 0, so a compatible match who simply declined
 *      GPS stays reachable instead of being permanently buried.
 *
 * ----------------------------------------------------------------------------
 * S_tags — SHARED INTERESTS  (weight 0.35)
 * ----------------------------------------------------------------------------
 *   S_tags = c / (c + TAGS_HALF_VALUE)          c = number of shared tags
 *
 * Same saturating shape as proximity, with TAGS_HALF_VALUE = 5 meaning *5
 * shared tags is worth half the maximum*. This matters: a linear count would
 * let someone hoarding 20 tags out-rank an excellent geographic match purely on
 * tag volume. Saturation rewards overlap while capping its influence:
 *   c = 0 -> 0.00    c = 3 -> 0.375    c = 10 -> 0.667
 *   c = 1 -> 0.167   c = 5 -> 0.500    c = 20 -> 0.800
 *
 * ----------------------------------------------------------------------------
 * S_fame — POPULARITY  (weight 0.20)
 * ----------------------------------------------------------------------------
 *   S_fame = f / (f + FAME_HALF_VALUE)          f = fame_rating
 *
 * fame_rating is unbounded (views ×1 + likes ×3 + 10 for a complete profile), so
 * it is saturated identically with FAME_HALF_VALUE = 50. A viral profile
 * therefore cannot dominate the ranking on fame alone:
 *   f = 0 -> 0.00    f = 50 -> 0.50    f = 500 -> 0.909
 *   f = 10 -> 0.167  f = 100 -> 0.667
 *
 * Using one functional form, x / (x + H), for all three signals is a deliberate
 * choice: the entire model reduces to one sentence — *"each factor saturates at
 * a stated half-value, then the three are combined with fixed weights"* — which
 * is far easier to defend than three unrelated curves.
 * ============================================================================
 */

// --- Weights (must sum to 1.00) -------------------------------------------
export const WEIGHT_GEO = 0.45;
export const WEIGHT_TAGS = 0.35;
export const WEIGHT_FAME = 0.20;

// --- Half-value / scale parameters ----------------------------------------
/** Neighbourhood radius: within this, geography scores a flat 1.00. */
export const SAME_AREA_RADIUS_KM = 5;
/** Distance (km) at which the proximity signal is worth half of a neighbour. */
export const GEO_HALF_VALUE_KM = 25;
/** Shared-tag count at which the interest signal is worth half its maximum. */
export const TAGS_HALF_VALUE = 5;
/** fame_rating at which the popularity signal is worth half its maximum. */
export const FAME_HALF_VALUE = 50;

// --- Fixed tiers for the no-GPS fallbacks ---------------------------------
export const GEO_SCORE_SAME_AREA = 1.0;
export const GEO_SCORE_TEXT_PARTIAL = 0.6;
export const GEO_SCORE_UNKNOWN = 0.1;

/** Mean Earth radius in km, used by the Haversine formula. */
export const EARTH_RADIUS_KM = 6371;

/**
 * Asserts a constant is a finite number before it is bound to the query.
 * These are module constants rather than user input, but the guard means a
 * future edit cannot silently push NaN into the SQL and corrupt the ordering.
 */
const bindable = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`[matchScoring] ${label} must be a finite number, got ${value}`);
  }
  return value;
};

/** x / (x + H) — the saturating normaliser shared by the tag and fame signals. */
const saturate = (value: number, halfValue: number): number =>
  value <= 0 ? 0 : value / (value + halfValue);

export interface MatchScoreInput {
  /** Haversine distance in km, or null when either side lacks GPS. */
  distanceKm: number | null;
  /** True when within SAME_AREA_RADIUS_KM, or location_text matches exactly. */
  sameArea: boolean;
  /** True when one location_text contains the other (same city, coarser). */
  textPartial: boolean;
  /** Number of interest tags shared with the viewer. */
  sharedTagCount: number;
  /** Candidate's fame_rating. */
  fameRating: number;
}

export interface MatchScoreBreakdown extends MatchScoreInput {
  geoScore: number;
  tagsScore: number;
  fameScore: number;
  /** Weighted sum, in [0, 1]. */
  weighted: number;
  /** Final integer score, in [0, 100]. */
  relevance: number;
}

/**
 * Pure TypeScript implementation of the formula documented above.
 *
 * Mirrors `buildRelevanceScoreSql` exactly. It exists so the ranking can be
 * unit-tested and demonstrated at the project defence without a database, and
 * so any divergence between the TS and SQL versions is a visible, testable bug.
 */
export const computeMatchScore = (input: MatchScoreInput): MatchScoreBreakdown => {
  const geoScore = input.sameArea
    ? GEO_SCORE_SAME_AREA
    : input.distanceKm !== null && Number.isFinite(input.distanceKm)
      ? GEO_HALF_VALUE_KM / (GEO_HALF_VALUE_KM + Math.max(0, input.distanceKm))
      : input.textPartial
        ? GEO_SCORE_TEXT_PARTIAL
        : GEO_SCORE_UNKNOWN;

  const tagsScore = saturate(Math.max(0, input.sharedTagCount), TAGS_HALF_VALUE);
  const fameScore = saturate(Math.max(0, input.fameRating), FAME_HALF_VALUE);

  const weighted =
    WEIGHT_GEO * geoScore + WEIGHT_TAGS * tagsScore + WEIGHT_FAME * fameScore;

  // Clamp guards against float drift; round to an int for display and sorting.
  //
  // The intermediate toFixed(6) is deliberate, not cosmetic. float64 cannot
  // represent values like 0.145 exactly, so `weighted * 100` can land on
  // 14.499999999999998 instead of the mathematically correct 14.5 — which then
  // rounds DOWN to 14, while Postgres (computing in exact `numeric`) rounds the
  // true 14.5 UP to 15. Snapping to 6 decimals removes that dust so this
  // function and buildRelevanceScoreSql agree on every input.
  const scaled = Number((Math.min(1, Math.max(0, weighted)) * 100).toFixed(6));
  const relevance = Math.round(scaled);

  return { ...input, geoScore, tagsScore, fameScore, weighted, relevance };
};

export interface GeoSignalSql {
  /** Haversine distance in km, or NULL when either side lacks coordinates. */
  distanceKm: string;
  /** Boolean: location_text matches exactly (case/whitespace-insensitive). */
  textExact: string;
  /** Boolean: one location_text contains the other (same city, coarser). */
  textPartial: string;
  /**
   * Builds the same_area boolean from already-materialised columns, so the
   * Haversine expression is emitted once instead of being duplicated.
   */
  sameArea: (distanceColumn: string, textExactColumn: string) => string;
  /** Parameter values to append, in placeholder order. */
  values: number[];
  /** Next free $n index after this fragment. */
  nextIndex: number;
}

/**
 * Emits the geographic signal expressions as SQL, with every constant bound as
 * a $n parameter. Designed for two CTE levels:
 *   level 1 selects distanceKm / textExact / textPartial as real columns;
 *   level 2 derives same_area from those columns via `sameArea(...)`.
 *
 * Alias contract: `v` = the viewer row, `u` = the candidate row.
 *
 * @param startIndex 1-based index of the first $n placeholder to use.
 */
export const buildGeoSignalsSql = (startIndex: number): GeoSignalSql => {
  let i = startIndex;
  const values: number[] = [];
  const bind = (value: number, label: string): string => {
    values.push(bindable(value, label));
    return `$${i++}`;
  };

  const pRadius = bind(EARTH_RADIUS_KM, 'EARTH_RADIUS_KM');
  const pSameAreaKm = bind(SAME_AREA_RADIUS_KM, 'SAME_AREA_RADIUS_KM');

  // Haversine great-circle distance. The acos() argument is clamped to [-1, 1]
  // because floating-point drift can push it a few ULPs outside the domain and
  // yield NaN, which would silently poison the ordering.
  const distanceKm = `CASE
      WHEN v.latitude IS NOT NULL AND v.longitude IS NOT NULL
       AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL
      THEN ${pRadius} * acos(
             LEAST(1.0, GREATEST(-1.0,
               sin(radians(v.latitude)) * sin(radians(u.latitude))
               + cos(radians(v.latitude)) * cos(radians(u.latitude))
                 * cos(radians(u.longitude - v.longitude))
             ))
           )
      ELSE NULL
    END`;

  // Normalised readable location. NULLIF makes blank strings behave as "unset",
  // so two empty location_text values never count as an exact match.
  const viewerLoc = `NULLIF(LOWER(BTRIM(v.location_text)), '')`;
  const candidateLoc = `NULLIF(LOWER(BTRIM(u.location_text)), '')`;

  // Every boolean is wrapped in COALESCE(..., FALSE). This matters: when either
  // location_text is NULL the comparison yields NULL rather than FALSE, and a
  // NULL same_area would then sort FIRST under `ORDER BY same_area DESC`
  // (Postgres defaults to NULLS FIRST for DESC) — putting location-less
  // candidates ahead of genuine same-area matches.
  const textExact = `COALESCE((${viewerLoc} IS NOT NULL AND ${viewerLoc} = ${candidateLoc}), FALSE)`;

  const textPartial = `COALESCE((${viewerLoc} IS NOT NULL
      AND ${candidateLoc} IS NOT NULL
      AND ${viewerLoc} <> ${candidateLoc}
      AND (position(${viewerLoc} in ${candidateLoc}) > 0
        OR position(${candidateLoc} in ${viewerLoc}) > 0)), FALSE)`;

  const sameArea = (distanceColumn: string, textExactColumn: string): string =>
    `COALESCE(((${distanceColumn} IS NOT NULL AND ${distanceColumn} <= ${pSameAreaKm}) OR ${textExactColumn}), FALSE)`;

  return { distanceKm, textExact, textPartial, sameArea, values, nextIndex: i };
};

export interface RelevanceSql {
  /** The full weighted-score expression, reading columns off alias `c`. */
  relevance: string;
  values: number[];
  nextIndex: number;
}

/**
 * Emits the weighted relevance expression. Reads the pre-computed signal
 * columns (same_area, distance_km, text_partial, shared_tag_count, fame_rating)
 * exposed by the candidates CTE under alias `c`.
 *
 * @param startIndex 1-based index of the first $n placeholder to use.
 */
export const buildRelevanceScoreSql = (startIndex: number): RelevanceSql => {
  let i = startIndex;
  const values: number[] = [];
  const bind = (value: number, label: string): string => {
    values.push(bindable(value, label));
    return `$${i++}`;
  };

  const pWeightGeo = bind(WEIGHT_GEO, 'WEIGHT_GEO');
  const pGeoHalf = bind(GEO_HALF_VALUE_KM, 'GEO_HALF_VALUE_KM');
  const pGeoSameArea = bind(GEO_SCORE_SAME_AREA, 'GEO_SCORE_SAME_AREA');
  const pGeoTextPartial = bind(GEO_SCORE_TEXT_PARTIAL, 'GEO_SCORE_TEXT_PARTIAL');
  const pGeoUnknown = bind(GEO_SCORE_UNKNOWN, 'GEO_SCORE_UNKNOWN');
  const pWeightTags = bind(WEIGHT_TAGS, 'WEIGHT_TAGS');
  const pTagsHalf = bind(TAGS_HALF_VALUE, 'TAGS_HALF_VALUE');
  const pWeightFame = bind(WEIGHT_FAME, 'WEIGHT_FAME');
  const pFameHalf = bind(FAME_HALF_VALUE, 'FAME_HALF_VALUE');

  // Cast to numeric BEFORE rounding. Postgres' round(double precision) uses
  // banker's rounding (62.5 -> 62), whereas round(numeric) rounds half away from
  // zero (62.5 -> 63), which is what JS Math.round does for non-negative values.
  // Without this cast the SQL score and computeMatchScore() disagree on exact
  // .5 boundaries. Scores are clamped to [0,100], so they are never negative.
  const relevance = `ROUND((100 * (
      ${pWeightGeo} * (
        CASE
          WHEN c.same_area         THEN ${pGeoSameArea}
          WHEN c.distance_km IS NOT NULL
                                   THEN ${pGeoHalf} / (${pGeoHalf} + GREATEST(0, c.distance_km))
          WHEN c.text_partial      THEN ${pGeoTextPartial}
          ELSE ${pGeoUnknown}
        END
      )
    + ${pWeightTags} * (c.shared_tag_count::numeric / (c.shared_tag_count::numeric + ${pTagsHalf}))
    + ${pWeightFame} * (c.fame_rating::numeric   / (c.fame_rating::numeric   + ${pFameHalf}))
  ))::numeric)::int`;

  return { relevance, values, nextIndex: i };
};

/**
 * Human-readable dump of the model — useful at the project defence and for
 * sanity-checking that the weights still sum to 1.00 after an edit.
 */
export const describeScoringModel = (): string => {
  const total = WEIGHT_GEO + WEIGHT_TAGS + WEIGHT_FAME;
  return [
    'relevance = round(100 × (0.45×S_geo + 0.35×S_tags + 0.20×S_fame))',
    `weights sum = ${total.toFixed(2)} (must be 1.00)`,
    `S_geo  : same_area→${GEO_SCORE_SAME_AREA} | GPS→${GEO_HALF_VALUE_KM}/(${GEO_HALF_VALUE_KM}+d km) | text_partial→${GEO_SCORE_TEXT_PARTIAL} | unknown→${GEO_SCORE_UNKNOWN}`,
    `S_tags : c/(c+${TAGS_HALF_VALUE}) where c = shared tags`,
    `S_fame : f/(f+${FAME_HALF_VALUE}) where f = fame_rating`,
    `same_area radius = ${SAME_AREA_RADIUS_KM} km`,
  ].join('\n');
};
