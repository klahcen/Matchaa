import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import {
  getConversation,
  getConversationsList,
  markMessagesAsRead,
  getUnreadMessageCount,
  areUsersConnected,
} from '../db/queries/messageQueries';

export class ChatController {
  static async getMessages(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const userIdParam = req.params.userId;
      const otherUserId = Number.parseInt(Array.isArray(userIdParam) ? userIdParam[0] : (userIdParam ?? ''), 10);

      if (!Number.isFinite(otherUserId) || otherUserId <= 0) {
        throw AppError.badRequest('Invalid user ID');
      }

      if (otherUserId === userId) {
        throw AppError.badRequest('Cannot fetch messages with yourself');
      }

      const connected = await areUsersConnected(userId, otherUserId);
      if (!connected) {
        throw AppError.forbidden('You can only view messages with connected users');
      }

      const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = Math.min(Number.parseInt(limitParam as string) || 50, 100);
      const beforeIdParam = Array.isArray(req.query.beforeId) ? req.query.beforeId[0] : req.query.beforeId;
      const beforeId = beforeIdParam ? Number.parseInt(beforeIdParam as string, 10) : undefined;

      const messages = await getConversation(userId, otherUserId, limit, beforeId);

      await markMessagesAsRead(userId, otherUserId);

      res.status(200).json({
        success: true,
        data: { messages },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getConversations(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const conversations = await getConversationsList(userId);

      res.status(200).json({
        success: true,
        data: { conversations },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const count = await getUnreadMessageCount(userId);

      res.status(200).json({
        success: true,
        data: { unread_count: count },
      });
    } catch (error) {
      next(error);
    }
  }
}