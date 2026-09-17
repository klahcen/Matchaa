import { Router } from 'express';
import { DateController } from '../controllers/dateController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.get('/with/:userId', requireAuth, DateController.getConversationDates);
router.post('/', requireAuth, DateController.propose);
router.put('/:id/respond', requireAuth, DateController.respond);

export const dateRoutes = router;
