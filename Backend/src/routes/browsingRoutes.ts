import { Router } from 'express';
import { BrowsingController } from '../controllers/browsingController';
import { requireAuth } from '../middleware/authMiddleware';

/**
 * Browsing routes — mounted at /api/browse.
 *
 * Protected by the same `requireAuth` JWT middleware used by the auth and
 * profile routes (httpOnly 'token' cookie, Bearer header fallback). No new
 * authentication mechanism is introduced.
 */
const router = Router();

router.get('/suggestions', requireAuth, BrowsingController.getSuggestions);

export const browsingRoutes = router;
