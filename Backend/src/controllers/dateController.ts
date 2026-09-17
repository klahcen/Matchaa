import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import { areUsersConnected } from '../db/queries/messageQueries';
import {
  createDateProposal,
  getDateProposalsBetween,
  respondToDateProposal,
  type DateStatus,
} from '../db/queries/dateQueries';
import { createNotification } from '../db/queries/notificationQueries';

const parsePositiveId = (value: unknown, label: string): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) throw AppError.badRequest(`Invalid ${label}`);
  return id;
};

const parseDateTime = (value: unknown): Date => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest('proposed_datetime is required');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw AppError.badRequest('proposed_datetime must be a valid date/time');
  if (date.getTime() <= Date.now()) throw AppError.badRequest('Proposed date/time must be in the future');
  return date;
};

const optionalText = (value: unknown, label: string, max: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw AppError.badRequest(`${label} must be text`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw AppError.badRequest(`${label} must not exceed ${max} characters`);
  return trimmed;
};

export class DateController {
  static async getConversationDates(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const otherUserId = parsePositiveId(req.params.userId, 'user ID');
      if (otherUserId === userId) throw AppError.badRequest('Cannot list dates with yourself');

      const connected = await areUsersConnected(userId, otherUserId);
      if (!connected) throw AppError.forbidden('You can only organize dates with connected users');

      const dates = await getDateProposalsBetween(userId, otherUserId);
      res.status(200).json({ success: true, data: { dates } });
    } catch (error) {
      next(error);
    }
  }

  static async propose(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const proposerId = req.user!.id;
      const body = req.body ?? {};
      const recipientId = parsePositiveId(body.recipient_id, 'recipient ID');
      if (recipientId === proposerId) throw AppError.badRequest('Cannot propose a date with yourself');

      const connected = await areUsersConnected(proposerId, recipientId);
      if (!connected) throw AppError.forbidden('You can only propose dates to connected users');

      const proposedDatetime = parseDateTime(body.proposed_datetime);
      const locationText = optionalText(body.location_text, 'Location', 255);
      const note = optionalText(body.note, 'Note', 1000);

      const proposal = await createDateProposal({ proposerId, recipientId, proposedDatetime, locationText, note });
      const content = `${req.user!.first_name} proposed a date`;
      await createNotification(recipientId, 'date_proposed', proposerId, content);

      const io = (global as any).io;
      io?.to(`user:${recipientId}`).emit('notification:new', {
        type: 'date_proposed',
        from_user: { id: req.user!.id, first_name: req.user!.first_name, username: req.user!.username },
        content,
        created_at: new Date().toISOString(),
      });
      io?.to(`user:${recipientId}`).to(`user:${proposerId}`).emit('date:new', proposal);

      res.status(201).json({ success: true, message: 'Date proposed', data: { date: proposal } });
    } catch (error) {
      next(error);
    }
  }

  static async respond(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const recipientId = req.user!.id;
      const dateId = parsePositiveId(req.params.id, 'date ID');
      const status = String(req.body?.status ?? '') as DateStatus;
      if (status !== 'accepted' && status !== 'declined') {
        throw AppError.badRequest('status must be accepted or declined');
      }

      const updated = await respondToDateProposal(dateId, recipientId, status);
      if (!updated) throw AppError.notFound('Pending date proposal not found');

      const content = `${req.user!.first_name} ${status} your date proposal`;
      await createNotification(updated.proposer_id, 'date_response', recipientId, content);

      const io = (global as any).io;
      io?.to(`user:${updated.proposer_id}`).emit('notification:new', {
        type: 'date_response',
        from_user: { id: req.user!.id, first_name: req.user!.first_name, username: req.user!.username },
        content,
        created_at: new Date().toISOString(),
      });
      io?.to(`user:${updated.proposer_id}`).to(`user:${updated.recipient_id}`).emit('date:updated', updated);

      res.status(200).json({ success: true, message: `Date ${status}`, data: { date: updated } });
    } catch (error) {
      next(error);
    }
  }
}
