import { Router } from 'express';
import { ChatController } from '../controllers/chatController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/conversations', requireAuth, ChatController.getConversations);
router.get('/unread-count', requireAuth, ChatController.getUnreadCount);
router.get('/:userId/messages', requireAuth, ChatController.getMessages);

export const chatRoutes = router;