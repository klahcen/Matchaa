import { NextFunction, Response } from 'express';
import { findBlockState, createBlock, removeBlock } from '../db/queries/blockQueries';
import {
  createLike,
  removeLike,
  hasLiked,
  isMutualLike,
  removeLikesBetween,
} from '../db/queries/likeQueries';
import {
  findPublicProfileById,
  findRelationshipState,
  recordProfileView,
  userExists,
  userHasProfilePicture,
  PublicProfile,
  RelationshipState,
} from '../db/queries/profileViewQueries';
import { createReport } from '../db/queries/reportQueries';
import { findUserById } from '../db/queries/userQueries';
import { recalculateFameRating } from '../services/fameRatingService';
import { muteNotificationsFrom, unmuteNotificationsFrom } from '../db/queries/notificationQueries';
import { isUserOnline, notifyUser, stopPresenceBetween } from '../sockets/socketServer';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

/**
 * Profile View controller — GET /api/users/:userId plus the like, block and
 * report actions available from that screen.
 *
 * REAL-TIME NOTE: "like received", "profile viewed", "connected" and "unliked"
 * notifications are stored and pushed over Socket.io through notifyUser, which
 * drops them when the recipient muted the actor (by unliking them), a block
 * exists either way, or the same notification was sent recently. The
 * `pending_notifications` arrays in the responses describe what was triggered.
 */

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MIN_REPORT_REASON_LENGTH = 3;
const MAX_REPORT_REASON_LENGTH = 500;

const parseTargetId = (raw: unknown): number => {
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.badRequest('A valid positive user id is required');
  }
  return parsed;
};

const validateReportReason = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw AppError.badRequest('A report reason is required');
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length < MIN_REPORT_REASON_LENGTH) {
    throw AppError.badRequest(
      `Please give a reason of at least ${MIN_REPORT_REASON_LENGTH} characters so moderators can act on it`
    );
  }
  if (trimmed.length > MAX_REPORT_REASON_LENGTH) {
    throw AppError.badRequest(`Reason must not exceed ${MAX_REPORT_REASON_LENGTH} characters`);
  }
  // Reject placeholder spam such as "..." or "aaa".
  if (!/[a-zA-Z0-9\u00C0-\u024F]/.test(trimmed)) {
    throw AppError.badRequest('Please provide a meaningful reason');
  }
  return trimmed;
};

/** A selected profile picture is required for liking and the viewer-facing flags. */
const canViewerLike = (viewerId: number): Promise<boolean> => userHasProfilePicture(viewerId);

interface ResolvedTarget {
  viewerId: number;
  targetId: number;
  relationship: RelationshipState;
}

/**
 * Shared guard for every interactive endpoint (like / block / report).
 *
 * Order matters for privacy:
 *   1. self-interaction           -> 400 (explicit, no leak involved)
 *   2. target does not exist      -> 404
 *   3. target has blocked viewer  -> 404, NOT 403: revealing "blocked" would
 *                                    confirm the account exists and that it
 *                                    acted against you, so it is
 *                                    indistinguishable from a deleted profile
 *   4. viewer has blocked target  -> 403 (the viewer already knows they blocked)
 */
const resolveInteractionTarget = async (
  req: AuthenticatedRequest
): Promise<ResolvedTarget> => {
  const viewerId = req.user!.id;
  const targetId = parseTargetId(req.params.userId);

  if (targetId === viewerId) {
    throw AppError.badRequest('You cannot perform this action on your own profile');
  }

  if (!(await userExists(targetId))) {
    throw AppError.notFound('This profile does not exist');
  }

  const relationship = await findRelationshipState(viewerId, targetId);

  if (relationship.is_blocked_by) {
    throw AppError.notFound('This profile does not exist');
  }
  if (relationship.has_blocked) {
    throw AppError.forbidden(
      'You have blocked this member. Unblock them from your profile before interacting.'
    );
  }

  return { viewerId, targetId, relationship };
};

/**
 * Builds the public profile payload, including live online status.
 *
 * Online means the user has at least one connected socket right now. The DB
 * column `last_connection` (written on socket connect and on the last socket's
 * disconnect) is exposed as `last_seen`, the name the subject uses, and the raw
 * column is dropped so the response does not carry the same timestamp twice.
 */
const toPublicPayload = (
  profile: PublicProfile,
  relationship: RelationshipState,
  viewerCanLike: boolean
) => {
  const { last_connection, ...publicProfile } = profile;
  return {
    ...publicProfile,
    is_online: isUserOnline(profile.id),
    last_seen: last_connection,
    relationship,
    viewer: {
      has_profile_picture: viewerCanLike,
      can_like: viewerCanLike,
      like_blocked_reason: viewerCanLike
        ? null
        : 'You need to select a profile picture on your own profile before you can like other members.',
    },
  };
};

export class ProfileViewController {
  /**
   * GET /api/users/:userId
   *
   * Returns every public field (never email, password_hash, tokens, or precise
   * coordinates) plus the relationship flags. Also appends a row to the `views`
   * history log — except when viewing your own profile.
   *
   * When the target has blocked the viewer this returns 404 with no profile
   * data and logs no view, so a blocked user can neither see the profile nor
   * inflate the blocker's view history or fame rating.
   */
  static async getProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const viewerId = req.user!.id;
      const targetId = parseTargetId(req.params.userId);

      const isSelf = targetId === viewerId;

      // Block check happens BEFORE the profile is fetched and BEFORE any view is
      // logged, so being blocked is indistinguishable from "does not exist".
      const relationship = await findRelationshipState(viewerId, targetId);
      if (relationship.is_blocked_by || relationship.has_blocked) {
        throw AppError.notFound('This profile does not exist');
      }

      const profile = await findPublicProfileById(targetId);
      if (!profile) {
        throw AppError.notFound('This profile does not exist');
      }

      let pendingNotifications: object[] = [];

      // Log the visit in the history log. Self-views are never recorded.
      if (!isSelf) {
        const { isFirstView } = await recordProfileView(viewerId, targetId);

        if (isFirstView) {
          // Fame counts DISTINCT viewers, so only a first visit can change it.
          // Skipping the recalculation on repeat visits avoids a pointless write.
          await recalculateFameRating(targetId);

          // Store and push the notification (only on first view to avoid spam).
          await notifyUser(targetId, 'view', viewerId, `${req.user!.first_name} viewed your profile`);

          pendingNotifications = [
            {
              type: 'profile_viewed',
              for_user_id: targetId,
              from_user_id: viewerId,
              delivered: false,
            },
          ];
        }
      }

      const viewerCanLike = await canViewerLike(viewerId);

      res.status(200).json({
        success: true,
        data: {
          ...toPublicPayload(profile, relationship, viewerCanLike),
          is_self: isSelf,
          pending_notifications: pendingNotifications,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users/:userId/like
   *
   * 403 when the viewer has no photo of their own (per the subject), 400 when
   * the like already exists. Reports whether this like completed a mutual pair,
   * i.e. whether the two users just became connected.
   */
  static async like(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { viewerId, targetId } = await resolveInteractionTarget(req);

      if (!(await canViewerLike(viewerId))) {
        throw AppError.forbidden(
          'You need to select a profile picture on your own profile before you can like other members.'
        );
      }

      if (await hasLiked(viewerId, targetId)) {
        throw AppError.badRequest('You have already liked this member');
      }

      await createLike(viewerId, targetId);
      // Liking again lifts the mute set when the viewer last unliked the target.
      await unmuteNotificationsFrom(viewerId, targetId);

      // A like is worth +3 to the TARGET's fame rating.
      const targetFame = await recalculateFameRating(targetId);

      const nowConnected = await isMutualLike(viewerId, targetId);

      // Store and push the 'like' notification (deduped against like/unlike loops).
      await notifyUser(targetId, 'like', viewerId, `${req.user!.first_name} liked your profile`);

      let connectionNotifications: any[] = [];

      if (nowConnected) {
        const target = await findUserById(targetId);
        if (!target) throw AppError.notFound('This profile does not exist');
        // Each recipient sees their counterpart in both the stored row and socket payload.
        for (const [recipientId, counterpart] of [[viewerId, target], [targetId, req.user!]] as const) {
          const content = `You and ${counterpart.first_name} liked each other — you are now connected!`;
          await notifyUser(recipientId, 'new_connection', counterpart.id, content);
        }

        connectionNotifications = [
          {
            type: 'new_connection',
            for_user_id: viewerId,
            with_user_id: targetId,
            delivered: false,
          },
          {
            type: 'new_connection',
            for_user_id: targetId,
            with_user_id: viewerId,
            delivered: false,
          },
        ];
      }

      res.status(201).json({
        success: true,
        message: nowConnected
          ? 'You liked this member — it is a match, you are now connected!'
          : 'You liked this member',
        data: {
          has_liked: true,
          has_liked_me: nowConnected,
          is_connected: nowConnected,
          newly_connected: nowConnected,
          target_fame_rating: targetFame,
          pending_notifications: [
            {
              type: 'like_received',
              for_user_id: targetId,
              from_user_id: viewerId,
              delivered: false,
            },
            ...connectionNotifications,
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/:userId/like
   *
   * Removes the viewer's like. Because connection is derived from mutual likes,
   * this immediately breaks any connection and therefore any future chat — no
   * separate connection row exists to clean up. The viewer also mutes the target,
   * so no further notifications from them reach the viewer until they like again.
   */
  static async unlike(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { viewerId, targetId } = await resolveInteractionTarget(req);

      const wasConnected = await isMutualLike(viewerId, targetId);
      const removed = await removeLike(viewerId, targetId);

      if (removed === 0) {
        throw AppError.badRequest('You have not liked this member');
      }

      await muteNotificationsFrom(viewerId, targetId);

      // The target loses the +3 this like contributed.
      const targetFame = await recalculateFameRating(targetId);

      if (wasConnected) {
        // Store and push the 'unlike' notification to the user who got unliked.
        await notifyUser(targetId, 'unlike', viewerId, `${req.user!.first_name} removed their like`);
      }

      res.status(200).json({
        success: true,
        message: wasConnected
          ? 'Like removed — you are no longer connected and chat is no longer possible'
          : 'Like removed',
        data: {
          has_liked: false,
          has_liked_me: wasConnected,
          is_connected: false,
          connection_broken: wasConnected,
          target_fame_rating: targetFame,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users/:userId/block
   *
   * Creates the block AND removes likes in both directions, so no connection or
   * leftover like state survives a block. Recalculates fame for both users
   * because either direction's likes may have been deleted.
   */
  static async block(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { viewerId, targetId, relationship } = await resolveInteractionTarget(req);

      if (relationship.has_blocked) {
        // resolveInteractionTarget already rejects this case with 403; this is a
        // defensive duplicate-Block message should that guard ever be relaxed.
        throw AppError.badRequest('You have already blocked this member');
      }

      const created = await createBlock(viewerId, targetId);
      if (!created) {
        throw AppError.badRequest('You have already blocked this member');
      }

      const wasConnected = relationship.is_connected;
      const likesRemoved = await removeLikesBetween(viewerId, targetId);
      // Live online status must not keep flowing between a blocked pair.
      stopPresenceBetween(viewerId, targetId);

      // Removing likes changes fame on both sides.
      const [viewerFame, targetFame] = await Promise.all([
        recalculateFameRating(viewerId),
        recalculateFameRating(targetId),
      ]);

      res.status(201).json({
        success: true,
        message: 'Member blocked. They will no longer appear in your suggestions or search results.',
        data: {
          has_blocked: true,
          is_connected: false,
          connection_broken: wasConnected,
          likes_removed: likesRemoved,
          viewer_fame_rating: viewerFame,
          target_fame_rating: targetFame,
          // A block deliberately produces NO notification for either party.
          pending_notifications: [],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/:userId/block — unblock.
   * Does not restore any likes that were removed when the block was created.
   */
  static async unblock(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const viewerId = req.user!.id;
      const targetId = parseTargetId(req.params.userId);

      if (targetId === viewerId) {
        throw AppError.badRequest('You cannot perform this action on your own profile');
      }
      if (!(await userExists(targetId))) {
        throw AppError.notFound('This profile does not exist');
      }

      const removed = await removeBlock(viewerId, targetId);
      if (removed === 0) {
        throw AppError.badRequest('You have not blocked this member');
      }

      res.status(200).json({
        success: true,
        message: 'Member unblocked. Likes removed while blocked are not restored.',
        data: { has_blocked: false, is_connected: false },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users/:userId/report
   * Body: { reason: string } — required, 3-500 characters, no placeholder spam.
   */
  static async report(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { viewerId, targetId } = await resolveInteractionTarget(req);
      const reason = validateReportReason(req.body?.reason);

      const report = await createReport(viewerId, targetId, reason);
      if (!report) {
        throw AppError.conflict('You have already reported this member');
      }

      res.status(201).json({
        success: true,
        message: 'Report submitted. Our moderators will review this account.',
        data: {
          report_id: report.id,
          reported_id: report.reported_id,
          reason: report.reason,
          created_at: report.created_at,
          // Reporting is silent by design: the reported user is not told.
          pending_notifications: [],
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
