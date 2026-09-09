import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../db/queries/notificationQueries';

export class NotificationController {
  static async getNotifications(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = Math.min(Number.parseInt(limitParam as string) || 30, 100);
      const offsetParam = Array.isArray(req.query.offset) ? req.query.offset[0] : req.query.offset;
      const offset = Math.max(Number.parseInt(offsetParam as string) || 0, 0);

      const notifications = await getNotifications(userId, limit, offset);

      res.status(200).json({
        success: true,
        data: { notifications },
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
      const count = await getUnreadNotificationCount(userId);

      res.status(200).json({
        success: true,
        data: { unread_count: count },
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const idParam = req.params.id;
      const notificationId = Number.parseInt(Array.isArray(idParam) ? idParam[0] : (idParam ?? ''), 10);

      if (!Number.isFinite(notificationId) || notificationId <= 0) {
        throw AppError.badRequest('Invalid notification ID');
      }

      const updated = await markNotificationAsRead(userId, notificationId);
      if (!updated) {
        throw AppError.notFound('Notification not found');
      }

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const count = await markAllNotificationsAsRead(userId);

      res.status(200).json({
        success: true,
        message: `${count} notifications marked as read`,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  }
}