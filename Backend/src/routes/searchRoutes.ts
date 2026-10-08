import { Router } from 'express';
import { SearchController } from '../controllers/searchController';
import { requireAuth } from '../middleware/authMiddleware';
import { requireCompleteProfile } from '../middleware/requireCompleteProfile';

/**
 * Research (advanced search) routes — mounted at /api/search.
 * Protected by the same `requireAuth` JWT middleware as every other
 * authenticated feature (httpOnly 'token' cookie with Bearer fallback).
 * Like Browsing (and the map, which reads from search), it requires a complete
 * profile: requireCompleteProfile answers 403 PROFILE_INCOMPLETE otherwise.
 */
const router = Router();

// Advanced search: age/fame ranges, location, tags — sortable + paginated.
router.get('/', requireAuth, requireCompleteProfile, SearchController.search);

export const searchRoutes = router;
