import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import { parseBoundedInt } from '../utils/queryValidation';
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

      const limit = req.query.limit === undefined ? 50 : parseBoundedInt(req.query.limit, 'limit', 1, 100);
      const beforeId = req.query.beforeId === undefined
        ? undefined : parseBoundedInt(req.query.beforeId, 'beforeId', 1, Number.MAX_SAFE_INTEGER);

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
