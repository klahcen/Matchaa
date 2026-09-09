import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/', requireAuth, NotificationController.getNotifications);
router.get('/unread-count', requireAuth, NotificationController.getUnreadCount);
router.put('/:id/read', requireAuth, NotificationController.markAsRead);
router.put('/read-all', requireAuth, NotificationController.markAllAsRead);

export const notificationRoutes = router;