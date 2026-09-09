import { NextFunction, Response } from 'express';
import {
  BrowseFilters,
  BrowsePagination,
  DEFAULT_SORT_ORDER,
  SortField,
  findSuggestions,
  getViewerOrientation,
} from '../db/queries/browsingQueries';
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
} from '../utils/queryValidation';

/**
 * Browsing / suggestions route handler.
 *
 * All validation is hand-written (no validation library) and now shared with
 * the Research feature via utils/queryValidation.ts, so both endpoints reject
 * the same malformed input with the same messages.
 */

const SORT_FIELDS: readonly SortField[] = ['relevance', 'age', 'location', 'fame', 'commonTags'];

export class BrowsingController {
  /**
   * GET /api/browse/suggestions
   *
   * Query params (all optional and combinable):
   *   minAge, maxAge, minFame, maxFame, location, tags,
   *   sortBy (relevance|age|location|fame|commonTags), sortOrder (asc|desc),
   *   page (>=1), limit (1..50, default 20)
   *
   * Returns a paginated list of profile summaries plus the total match count.
   */
  static async getSuggestions(
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

      const sortBy = parseSortField(q.sortBy, SORT_FIELDS, 'relevance' as SortField);
      const sortOrder = parseSortOrder(q.sortOrder, DEFAULT_SORT_ORDER[sortBy]);

      const { page, limit, offset } = parsePagination(q.page, q.limit);

      const filters: BrowseFilters = {
        ...(age.min !== undefined ? { minAge: age.min } : {}),
        ...(age.max !== undefined ? { maxAge: age.max } : {}),
        ...(fame.min !== undefined ? { minFame: fame.min } : {}),
        ...(fame.max !== undefined ? { maxFame: fame.max } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(tags !== undefined ? { tags } : {}),
      };

      const pagination: BrowsePagination = { limit, offset };

      // --- orientation context -------------------------------------------
      const orientation = await getViewerOrientation(viewerId);
      if (!orientation) {
        throw AppError.notFound('Viewer profile not found');
      }

      const orientationPayload = {
        preference: orientation.preference,
        gender: orientation.gender,
        gender_required: orientation.genderRequired,
      };

      // A heterosexual/homosexual viewer who never set their own gender cannot
      // be matched by orientation. Return zero rows with an explicit flag so
      // the UI can prompt them, instead of silently widening the filter to
      // bisexual (which would show genders they asked to exclude).
      if (orientation.genderRequired) {
        res.status(200).json({
          success: true,
          data: {
            suggestions: [],
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

      const { rows, total } = await findSuggestions(
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
          suggestions: rows,
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
