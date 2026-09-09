import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { requireAuth } from '../middleware/authMiddleware';

/**
 * Research (advanced search) routes — mounted at /api/search.
 * Protected by the same `requireAuth` JWT middleware as every other
 * authenticated feature (httpOnly 'token' cookie with Bearer fallback).
 */
const router = Router();

// Advanced search: age/fame ranges, location, tags — sortable + paginated.
router.get('/', requireAuth, SearchController.search);

export const searchRoutes = router;
