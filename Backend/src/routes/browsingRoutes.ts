import { Router } from 'express';
import { BrowsingController } from '../controllers/browsingController';
import { requireAuth } from '../middleware/authMiddleware';
import { requireCompleteProfile } from '../middleware/requireCompleteProfile';

/**
 * Browsing routes — mounted at /api/browse.
 *
 * Protected by the same `requireAuth` JWT middleware used by the auth and
 * profile routes (httpOnly 'token' cookie, Bearer header fallback). No new
 * authentication mechanism is introduced.
 *
 * Suggestions also require a complete profile (bio, tag, profile picture,
 * location); otherwise requireCompleteProfile answers 403 PROFILE_INCOMPLETE.
 */
const router = Router();

router.get('/suggestions', requireAuth, requireCompleteProfile, BrowsingController.getSuggestions);

// Swipe mode: swipe left records a private pass; "Start over" clears them.
router.post('/passes/:userId', requireAuth, requireCompleteProfile, BrowsingController.pass);
router.delete('/passes', requireAuth, BrowsingController.resetPasses);

export const browsingRoutes = router;
