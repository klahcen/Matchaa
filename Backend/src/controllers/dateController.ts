import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';
import { areUsersConnected } from '../db/queries/messageQueries';
import {
  createDateProposal,
  findPendingDateProposer,
  getDateProposalsBetween,
  respondToDateProposal,
  type DateStatus,
} from '../db/queries/dateQueries';
import { notifyUser } from '../sockets/socketServer';

const parsePositiveId = (value: unknown, label: string): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) throw AppError.badRequest(`Invalid ${label}`);
  return id;
};

// ISO 8601 with an explicit offset ("Z" or "+01:00"). A bare local time would be
// read in the server's timezone (UTC in the container), shifting the date.
const ISO_DATETIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const parseDateTime = (value: unknown): Date => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest('proposed_datetime is required');
  }
  if (!ISO_DATETIME_WITH_ZONE.test(value.trim())) {
    throw AppError.badRequest('proposed_datetime must be an ISO 8601 date/time with a timezone');
  }
  const date = new Date(value.trim());
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
      await notifyUser(recipientId, 'date_proposed', proposerId, `${req.user!.first_name} proposed a date`);

      const io = (global as any).io;
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

      const proposerId = await findPendingDateProposer(dateId, recipientId);
      if (proposerId === null) throw AppError.notFound('Pending date proposal not found');
      // Unliking or blocking after the proposal was sent ends the connection.
      const connected = await areUsersConnected(recipientId, proposerId);
      if (!connected) throw AppError.forbidden('You can only respond to dates from connected users');

      const updated = await respondToDateProposal(dateId, recipientId, status);
      if (!updated) throw AppError.notFound('Pending date proposal not found');

      await notifyUser(updated.proposer_id, 'date_response', recipientId, `${req.user!.first_name} ${status} your date proposal`);

      const io = (global as any).io;
      io?.to(`user:${updated.proposer_id}`).to(`user:${updated.recipient_id}`).emit('date:updated', updated);

      res.status(200).json({ success: true, message: `Date ${status}`, data: { date: updated } });
    } catch (error) {
      next(error);
    }
  }
}
