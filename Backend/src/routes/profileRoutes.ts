import { Router } from 'express';
import { ProfileController } from '../controllers/profileController';
import { requireAuth } from '../middleware/authMiddleware';
import { photoUpload } from '../services/uploadService';

/**
 * Profile routes — mounted at /api/profile.
 *
 * Every route is protected by the existing `requireAuth` JWT middleware
 * (httpOnly 'token' cookie, with Authorization: Bearer fallback). No second
 * authentication mechanism is introduced here.
 */
const router = Router();

router.get('/me', requireAuth, ProfileController.getMe);
router.put('/me', requireAuth, ProfileController.updateMe);

// GPS (with consent) or manual location text
router.put('/me/location', requireAuth, ProfileController.updateLocation);

// Interest tags
router.get('/me/tags', requireAuth, ProfileController.getMyTags);
router.post('/me/tags', requireAuth, ProfileController.addTag);
router.delete('/me/tags/:tagId', requireAuth, ProfileController.removeTag);

// Photos (multipart/form-data, field name "photo", max 5 MB, jpeg/png/webp)
router.post('/me/photos', requireAuth, photoUpload.single('photo'), ProfileController.uploadPhoto);
router.delete('/me/photos/:photoId', requireAuth, ProfileController.deletePhoto);
router.put(
  '/me/photos/:photoId/set-profile-picture',
  requireAuth,
  ProfileController.setProfilePicture
);

// Social read-side: who viewed me / who liked me
router.get('/me/views', requireAuth, ProfileController.getMyViews);
router.get('/me/likes', requireAuth, ProfileController.getMyLikes);

export const profileRoutes = router;

/**
 * Tag routes — mounted at /api so the autocomplete endpoint resolves to the
 * exact path GET /api/tags/search?q=...
 */
const tagsRouter = Router();
tagsRouter.get('/tags/search', requireAuth, ProfileController.searchTags);

export const tagRoutes = tagsRouter;
