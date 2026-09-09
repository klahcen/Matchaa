import { NextFunction, Response } from 'express';
import { getViewerOrientation } from '../db/queries/candidateQueries';
import {
  DEFAULT_SEARCH_SORT_FIELD,
  SEARCH_SORT_FIELDS,
  SearchFilters,
  SearchPagination,
  SearchSortField,
  findSearchResults,
} from '../db/queries/searchQueries';
import { DEFAULT_SORT_ORDER } from '../db/queries/candidateQueries';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import {
  MAX_AGE,
  MAX_FAME,
  MIN_AGE,
  parseLocationFilter,
  parsePagination,
  parseRangePair,
  parseSortField,
  parseSortOrder,
  parseTagFilters,
  readString,
} from '../utils/queryValidation';

/**
 * Research (advanced search) route handler.
 *
 * Validation is the shared manual set from utils/queryValidation.ts — the same
 * rules and messages Browsing applies (age 18-120, fame >= 0, limit capped at
 * 50, tag/location sanity), so a value rejected by one endpoint is rejected
 * identically by the other.
 *
 * An empty search (no criteria at all) is valid: it returns the paginated list
 * of every eligible profile — eligibility (not self, verified, has a photo,
 * no block in either direction, orientation-compatible) is enforced by the
 * shared candidate pool, never by the caller's filters.
 */

/** Tags default to ANY (OR) matching; ?tagsMatch=all flips to requiring every tag. */
const parseTagsMatch = (raw: unknown): 'any' | 'all' => {
  const text = readString(raw);
  if (text === undefined) return 'any';
  const normalized = text.toLowerCase();
  if (normalized !== 'any' && normalized !== 'all') {
    throw AppError.badRequest(`tagsMatch must be either: any, all (got "${text}")`);
  }
  return normalized;
};

export class SearchController {
  /**
   * GET /api/search
   *
   * Query params (all optional and combinable):
   *   minAge, maxAge, minFame, maxFame, location, tags, tagsMatch (any|all),
   *   sortBy (age|location|fame|commonTags — NO relevance, this is not the
   *   suggestion feed), sortOrder (asc|desc), page (>=1), limit (1..50, default 20)
   *
   * Returns the same profile summary shape as Browsing (minus relevance_score)
   * plus the total match count.
   */
  static async search(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const viewerId = req.user!.id;
      const q = req.query ?? {};

      // --- parse & validate everything up front, before touching the DB ---
      const age = parseRangePair(q.minAge, q.maxAge, 'Age', MIN_AGE, MAX_AGE);
      const fame = parseRangePair(q.minFame, q.maxFame, 'Fame', 0, MAX_FAME);
      const location = parseLocationFilter(q.location);
      const tags = parseTagFilters(q.tags);
      const tagsMatch = parseTagsMatch(q.tagsMatch);

      const sortBy = parseSortField<SearchSortField>(
        q.sortBy,
        SEARCH_SORT_FIELDS,
        DEFAULT_SEARCH_SORT_FIELD
      );
      const sortOrder = parseSortOrder(q.sortOrder, DEFAULT_SORT_ORDER[sortBy]);

      const { page, limit, offset } = parsePagination(q.page, q.limit);

      const filters: SearchFilters = {
        ...(age.min !== undefined ? { minAge: age.min } : {}),
        ...(age.max !== undefined ? { maxAge: age.max } : {}),
        ...(fame.min !== undefined ? { minFame: fame.min } : {}),
        ...(fame.max !== undefined ? { maxFame: fame.max } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(tags !== undefined ? { tags, tagsMatch } : {}),
      };

      const pagination: SearchPagination = { limit, offset };

      // --- orientation context (identical rule to Browsing) ----------------
      const orientation = await getViewerOrientation(viewerId);
      if (!orientation) {
        throw AppError.notFound('Viewer profile not found');
      }

      const orientationPayload = {
        preference: orientation.preference,
        gender: orientation.gender,
        gender_required: orientation.genderRequired,
      };

      // Same short-circuit as Browsing: a gendered preference without the
      // viewer's own gender cannot be evaluated — zero rows plus an explicit
      // flag, never a silent widening to bisexual.
      if (orientation.genderRequired) {
        res.status(200).json({
          success: true,
          data: {
            results: [],
            pagination: {
              page,
              limit,
              total: 0,
              total_pages: 0,
              has_next: false,
              has_prev: false,
            },
            sort: { by: sortBy, order: sortOrder },
            orientation: orientationPayload,
          },
        });
        return;
      }

      const { rows, total } = await findSearchResults(
        viewerId,
        filters,
        sortBy,
        sortOrder,
        pagination
      );

      const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

      res.status(200).json({
        success: true,
        data: {
          results: rows,
          pagination: {
            page,
            limit,
            total,
            total_pages: totalPages,
            has_next: page < totalPages,
            has_prev: page > 1 && totalPages > 0,
          },
          sort: { by: sortBy, order: sortOrder },
          orientation: orientationPayload,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
