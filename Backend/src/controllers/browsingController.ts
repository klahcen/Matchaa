import { NextFunction, Response } from 'express';
import {
  BrowseFilters,
  BrowsePagination,
  DEFAULT_SORT_ORDER,
  SortField,
  findSuggestions,
  getViewerOrientation,
} from '../db/queries/browsingQueries';
import { clearPasses, createPass } from '../db/queries/passQueries';
import { findUserById } from '../db/queries/userQueries';
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
   *   page (>=1), limit (1..50, default 20),
   *   swipe (true|false): hide profiles the viewer already liked or passed on
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

      // Swipe mode hides profiles the viewer already liked or passed on.
      const swipeRaw = Array.isArray(q.swipe) ? q.swipe[0] : q.swipe;
      if (swipeRaw !== undefined && !['true', 'false', '1', '0'].includes(String(swipeRaw))) {
        throw AppError.badRequest(`swipe must be true or false (got "${String(swipeRaw)}")`);
      }
      const swipe = swipeRaw === 'true' || swipeRaw === '1';

      const filters: BrowseFilters = {
        ...(age.min !== undefined ? { minAge: age.min } : {}),
        ...(age.max !== undefined ? { maxAge: age.max } : {}),
        ...(fame.min !== undefined ? { minFame: fame.min } : {}),
        ...(fame.max !== undefined ? { maxFame: fame.max } : {}),
        ...(location !== undefined ? { location } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(swipe ? { excludeSwipedBy: viewerId } : {}),
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

  /**
   * POST /api/browse/passes/:userId
   *
   * Swipe left: hides that profile from the viewer's swipe deck. Private — it
   * notifies no one and changes nothing for the other user.
   */
  static async pass(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewerId = req.user!.id;
      const targetId = Number.parseInt(String(req.params.userId), 10);
      if (!Number.isFinite(targetId) || targetId <= 0) {
        throw AppError.badRequest('A valid positive user id is required');
      }
      if (targetId === viewerId) {
        throw AppError.badRequest('You cannot pass on yourself');
      }
      if (!(await findUserById(targetId))) {
        throw AppError.notFound('This profile does not exist');
      }

      await createPass(viewerId, targetId);
      res.status(201).json({ success: true, message: 'Passed', data: { user_id: targetId } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/browse/passes
   *
   * "Start over": forgets every pass so those profiles can be dealt again.
   */
  static async resetPasses(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cleared = await clearPasses(req.user!.id);
      res.status(200).json({ success: true, message: 'Passed profiles restored', data: { cleared } });
    } catch (error) {
      next(error);
    }
  }
}
