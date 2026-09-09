import { query } from '../../config/db';
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
  type SortOrder,
} from './candidateQueries';

/**
 * Research (advanced search) data access.
 *
 * The candidate pool — self/verified/photo exclusions, blocks in both
 * directions, orientation compatibility, geo + shared-tag signals — and the
 * filter clauses come from candidateQueries.ts, shared verbatim with Browsing.
 *
 * Deliberate difference from Browsing: NO relevance scoring. Research is a
 * explicit-criteria search tool, so there is no `scored` CTE, no relevance
 * formula and no 'relevance' sort field; the outer SELECT reads straight from
 * `candidates` and orders by the field the user chose.
 */

export const SEARCH_SORT_FIELDS = ['age', 'location', 'fame', 'commonTags'] as const;
export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];

/** Research defaults to fame desc — "the most prominent matches first". */
export const DEFAULT_SEARCH_SORT_FIELD: SearchSortField = 'fame';

export type SearchFilters = CandidateFilters;
export type SearchPagination = CandidatePagination;
export type SearchResultRow = CandidateRow;

export interface SearchResultsResult {
  rows: SearchResultRow[];
  total: number;
}

/**
 * ORDER BY per field, mirroring Browsing's semantics (NULL ages last in both
 * directions, shared location ordering) with a plain `id ASC` tiebreak so
 * LIMIT/OFFSET pagination stays stable — no relevance score exists here.
 */
const buildSearchOrderBy = (field: SearchSortField, order: SortOrder): string => {
  const tiebreak = 'c.id ASC';

  switch (field) {
    case 'age':
      return `c.age ${order.toUpperCase()} NULLS LAST, ${tiebreak}`;
    case 'fame':
      return `c.fame_rating ${order.toUpperCase()}, ${tiebreak}`;
    case 'commonTags':
      return `c.shared_tag_count ${order.toUpperCase()}, ${tiebreak}`;
    case 'location':
      return buildLocationOrderBy(order, tiebreak);
    default:
      return tiebreak;
  }
};

/**
 * Assembles the search query. Page and count statements share the identical
 * CTE + WHERE so `total` can never disagree with the returned rows.
 */
export const buildSearchQuery = (
  viewerId: number,
  filters: SearchFilters,
  sortField: SearchSortField,
  sortOrder: SortOrder,
  pagination: SearchPagination
): BuiltCandidateQuery => {
  const candidate = buildCandidateCte(viewerId);
  const values: any[] = [...candidate.values];
  const next = (value: any): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const filterClause = buildFilterWhereClause(filters, next);
  const orderBy = buildSearchOrderBy(sortField, sortOrder);

  // Snapshot BEFORE pagination placeholders — the count query has no
  // LIMIT/OFFSET and binding them would raise a parameter-count error.
  const countValues = [...values];

  const pLimit = next(pagination.limit);
  const pOffset = next(pagination.offset);

  const sql = `${candidate.sql}
    SELECT
      ${CANDIDATE_SELECT_COLUMNS}
    FROM candidates c
    WHERE TRUE
      ${filterClause}
    ORDER BY ${orderBy}
    LIMIT ${pLimit} OFFSET ${pOffset}`;

  const countSql = `${candidate.sql}
    SELECT COUNT(*)::int AS total
    FROM candidates c
    WHERE TRUE
      ${filterClause}`;

  return { sql, countSql, values, countValues };
};

/**
 * Runs one search: a page of results plus the total matching count,
 * concurrently — they are independent reads.
 */
export const findSearchResults = async (
  viewerId: number,
  filters: SearchFilters,
  sortField: SearchSortField,
  sortOrder: SortOrder,
  pagination: SearchPagination
): Promise<SearchResultsResult> => {
  const built = buildSearchQuery(viewerId, filters, sortField, sortOrder, pagination);

  const [pageRes, countRes] = await Promise.all([
    query<Record<string, any>>(built.sql, built.values),
    query<{ total: number }>(built.countSql, built.countValues),
  ]);

  return {
    rows: pageRes.rows.map(mapCandidateRow),
    total: countRes.rows[0]?.total ?? 0,
  };
};
