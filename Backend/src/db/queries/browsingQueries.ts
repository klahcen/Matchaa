import { query } from '../../config/db';
import { buildRelevanceScoreSql } from '../../services/matchScoringService';
import {
  buildCandidateCte,
  buildFilterWhereClause,
  buildLocationOrderBy,
  mapCandidateRow,
  CANDIDATE_SELECT_COLUMNS,
  type BuiltCandidateQuery,
  type CandidateFilters,
  type CandidatePagination,
  type CandidateRow,
  type SortField,
  type SortOrder,
} from './candidateQueries';

/**
 * Browsing / suggestions data access.
 *
 * The candidate pool (viewer CTE, hard exclusions, geo + tag signals) and the
 * user filter clauses now live in candidateQueries.ts, shared verbatim with
 * Research so the two features can never drift on exclusion rules. This module
 * keeps what is Browsing-specific: the `scored` CTE (relevance formula) and
 * relevance-aware ordering.
 *
 * Shape of the query, in four CTE levels:
 *   viewer     – the requesting user's own gender / preference / coordinates   (shared)
 *   base       – every hard-excluded row removed, geo + tag signals computed  (shared)
 *   candidates – derives same_area from base's columns                        (shared)
 *   scored     – materialises the relevance score as a real column            (browsing-only)
 * The outer SELECT then applies user filters, sorts, paginates.
 */

export type { SortField, SortOrder } from './candidateQueries';
export { DEFAULT_SORT_ORDER, getViewerOrientation } from './candidateQueries';
export type { ViewerOrientation } from './candidateQueries';

export type BrowseFilters = CandidateFilters;
export type BrowsePagination = CandidatePagination;

export interface SuggestionRow extends CandidateRow {
  /** Weighted 0–100 match score (see services/matchScoringService.ts). */
  relevance_score: number;
}

export interface SuggestionsResult {
  rows: SuggestionRow[];
  total: number;
}

/**
 * ORDER BY per field.
 *
 * Every branch ends with `relevance_score DESC, id ASC` so the ordering is a
 * TOTAL order. Without that final tiebreak, LIMIT/OFFSET pagination is not
 * stable: Postgres may return the same row on two pages or skip one entirely.
 */
const buildOrderBy = (field: SortField, order: SortOrder): string => {
  const tiebreak = 'c.relevance_score DESC, c.id ASC';

  switch (field) {
    case 'age':
      // Candidates with no birthdate have an unknown age; keep them last in
      // both directions rather than letting NULLs hijack the top of the list.
      return `c.age ${order.toUpperCase()} NULLS LAST, ${tiebreak}`;

    case 'fame':
      return `c.fame_rating ${order.toUpperCase()}, ${tiebreak}`;

    case 'commonTags':
      return `c.shared_tag_count ${order.toUpperCase()}, ${tiebreak}`;

    case 'location':
      return buildLocationOrderBy(order, tiebreak);

    case 'relevance':
    default:
      return `c.relevance_score DESC, ${tiebreak}`;
  }
};

/**
 * Assembles the full suggestions query (page + total count share one WHERE
 * clause, so the count can never disagree with the rows).
 */
export const buildSuggestionsQuery = (
  viewerId: number,
  filters: BrowseFilters,
  sortField: SortField,
  sortOrder: SortOrder,
  pagination: BrowsePagination
): BuiltCandidateQuery => {
  const candidate = buildCandidateCte(viewerId);
  const values: any[] = [...candidate.values];
  const next = (value: any): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const relevance = buildRelevanceScoreSql(values.length + 1);
  values.push(...relevance.values);

  const filterClause = buildFilterWhereClause(filters, next);

  // Materialising the score as a real column (rather than leaving it as a
  // SELECT-list alias) is what lets ORDER BY, and any future filter, refer to
  // it as c.relevance_score. A qualified alias reference does not resolve in
  // Postgres and would fail with "column c.relevance_score does not exist".
  const cte = `${candidate.sql},
    scored AS (
      SELECT c.*,
             ${relevance.relevance} AS relevance_score
      FROM candidates c
    )`;

  const orderBy = buildOrderBy(sortField, sortOrder);

  // Snapshot the parameter list BEFORE the pagination placeholders are added.
  // The count query shares every filter parameter but has no LIMIT/OFFSET, so
  // binding the full array to it would raise "supplies N parameters, but
  // prepared statement requires N-2".
  const countValues = [...values];

  const pLimit = next(pagination.limit);
  const pOffset = next(pagination.offset);

  const sql = `${cte}
    SELECT
      ${CANDIDATE_SELECT_COLUMNS},
      c.relevance_score
    FROM scored c
    WHERE TRUE
      ${filterClause}
    ORDER BY ${orderBy}
    LIMIT ${pLimit} OFFSET ${pOffset}`;

  // Same CTE chain and same WHERE as the page query, so `total` can never
  // disagree with the rows actually returned.
  const countSql = `${cte}
    SELECT COUNT(*)::int AS total
    FROM scored c
    WHERE TRUE
      ${filterClause}`;

  return { sql, countSql, values, countValues };
};

/**
 * Fetches one page of suggestions plus the total matching count.
 * Runs both statements concurrently — they are independent reads.
 */
export const findSuggestions = async (
  viewerId: number,
  filters: BrowseFilters,
  sortField: SortField,
  sortOrder: SortOrder,
  pagination: BrowsePagination
): Promise<SuggestionsResult> => {
  const built = buildSuggestionsQuery(viewerId, filters, sortField, sortOrder, pagination);

  const [pageRes, countRes] = await Promise.all([
    query<Record<string, any>>(built.sql, built.values),
    query<{ total: number }>(built.countSql, built.countValues),
  ]);

  const rows: SuggestionRow[] = pageRes.rows.map((r) => ({
    ...mapCandidateRow(r),
    relevance_score: Number(r.relevance_score ?? 0),
  }));

  return { rows, total: countRes.rows[0]?.total ?? 0 };
};
