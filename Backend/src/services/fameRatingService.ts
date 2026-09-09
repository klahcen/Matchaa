import { query } from '../config/db';
import { countReceivedEvents } from '../db/queries/profileQueries';
import { countUserTags } from '../db/queries/tagQueries';

/**
 * Fame rating — a public integer score stored on users.fame_rating.
 *
 * Documented formula (deterministic, recalculated from scratch, never incremental):
 *
 *   fame_rating = (views_received  × 1)
 *               + (likes_received  × 3)
 *               + (profile_complete ? 10 : 0)
 *
 * A profile counts as "complete" when ALL of the following hold:
 *   - biography is present and non-blank
 *   - at least 1 interest tag is linked
 *   - at least 1 photo is uploaded
 *   - location_text is present and non-blank
 *
 * Because the score is recomputed from the underlying tables every time, it can
 * never drift out of sync, and it is safe to call from any event path:
 * profile update, tag add/remove, photo upload/delete/set-profile-picture,
 * location update, view received, like received.
 */

export const FAME_POINTS_PER_VIEW = 1;
export const FAME_POINTS_PER_LIKE = 3;
export const FAME_POINTS_PROFILE_COMPLETE = 10;

export interface FameBreakdown {
  fameRating: number;
  viewCount: number;
  likeCount: number;
  tagCount: number;
  photoCount: number;
  isProfileComplete: boolean;
}

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Computes the fame breakdown for a user WITHOUT writing anything.
 * Useful for tests and for the "why is my score this" debug path.
 */
export const computeFameBreakdown = async (userId: number): Promise<FameBreakdown> => {
  const [userRes, events, tagCount, photoCount] = await Promise.all([
    query<{ biography: string | null; location_text: string | null }>(
      `SELECT biography, location_text FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    ),
    countReceivedEvents(userId),
    countUserTags(userId),
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const user = userRes.rows[0];
  const photoTotal = photoCount.rows[0]?.count ?? 0;

  const isProfileComplete =
    Boolean(user) &&
    hasText(user.biography) &&
    tagCount > 0 &&
    photoTotal > 0 &&
    hasText(user.location_text);

  const fameRating =
    events.viewCount * FAME_POINTS_PER_VIEW +
    events.likeCount * FAME_POINTS_PER_LIKE +
    (isProfileComplete ? FAME_POINTS_PROFILE_COMPLETE : 0);

  return {
    fameRating,
    viewCount: events.viewCount,
    likeCount: events.likeCount,
    tagCount,
    photoCount: photoTotal,
    isProfileComplete,
  };
};

/**
 * Recalculates and persists users.fame_rating.
 * Returns the new score so callers can include it in their response payload.
 *
 * This is the single entry point every feature must use — do not write
 * fame_rating directly anywhere else, or the score will drift.
 */
export const recalculateFameRating = async (userId: number): Promise<number> => {
  const { fameRating } = await computeFameBreakdown(userId);

  await query(
    `UPDATE users
     SET fame_rating = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND fame_rating IS DISTINCT FROM $1`,
    [fameRating, userId]
  );

  return fameRating;
};

/**
 * Convenience wrapper for event-driven callers (view recorded, like recorded)
 * that already know the target user id.
 */
export const bumpFameRatingForUser = recalculateFameRating;
