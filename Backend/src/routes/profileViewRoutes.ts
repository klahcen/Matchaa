import { Router } from 'express';
import { ProfileViewController } from '../controllers/profileViewController';
import { requireAuth } from '../middleware/authMiddleware';

/**
 * Profile View routes — mounted at /api/users.
 *
 * Protected by the same `requireAuth` JWT middleware used by the auth, profile
 * and browsing routes (httpOnly 'token' cookie with Bearer fallback). No new
 * authentication mechanism is introduced.
 */
const router = Router();

// Full public profile + relationship flags; also appends to the views history log.
router.get('/:userId', requireAuth, ProfileViewController.getProfile);

// Like / unlike
router.post('/:userId/like', requireAuth, ProfileViewController.like);
router.delete('/:userId/like', requireAuth, ProfileViewController.unlike);

// Block / unblock
router.post('/:userId/block', requireAuth, ProfileViewController.block);
router.delete('/:userId/block', requireAuth, ProfileViewController.unblock);

// Report as a fake account
router.post('/:userId/report', requireAuth, ProfileViewController.report);

export const profileViewRoutes = router;
