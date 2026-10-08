import { query } from '../config/db';
import { countReceivedEvents, findProfileCompletionFacts } from '../db/queries/profileQueries';

/**
 * Fame rating — a public integer score stored on users.fame_rating.
 *
 * Documented formula (deterministic, recalculated from scratch, never incremental):
 *
 *   fame_rating = (views_received  × 1)
 *               + (likes_received  × 3)
 *               + (profile_complete ? 10 : 0)
 *
 * "profile_complete" is the single definition exported below
 * (evaluateProfileCompletion). The same function drives the +10 bonus, the
 * requireCompleteProfile gate on browse / search / like, and the
 * profile_complete / profile_missing fields of GET /api/profile/me, so the
 * three can never disagree.
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

// ---------------------------------------------------------------------------
// Profile completeness (single source of truth)
// ---------------------------------------------------------------------------

/**
 * What a profile needs before the matching features unlock, in display order.
 * These exact strings are part of the API contract (`missing` / `profile_missing`).
 */
export const PROFILE_REQUIREMENTS = ['biography', 'tags', 'profile_picture', 'location'] as const;
export type ProfileRequirement = (typeof PROFILE_REQUIREMENTS)[number];

/** Human wording for each requirement, used in the gate's error message. */
export const PROFILE_REQUIREMENT_LABELS: Record<ProfileRequirement, string> = {
  biography: 'a biography',
  tags: 'at least one interest tag',
  profile_picture: 'a profile picture',
  location: 'your location',
};

export interface ProfileCompletionFacts {
  biography: string | null;
  tagCount: number;
  hasProfilePicture: boolean;
  locationText: string | null;
}

export interface ProfileCompletion {
  complete: boolean;
  missing: ProfileRequirement[];
}

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * A profile is complete when ALL of the following hold:
 *   - biography is present and non-blank
 *   - at least 1 interest tag is linked
 *   - a profile picture is set (a photo flagged is_profile_picture)
 *   - location_text is present and non-blank
 *
 * Pure function, so callers that already hold the data (GET /api/profile/me)
 * evaluate it without another query.
 */
export const evaluateProfileCompletion = (facts: ProfileCompletionFacts): ProfileCompletion => {
  const missing: ProfileRequirement[] = [];
  if (!hasText(facts.biography)) missing.push('biography');
  if (facts.tagCount < 1) missing.push('tags');
  if (!facts.hasProfilePicture) missing.push('profile_picture');
  if (!hasText(facts.locationText)) missing.push('location');
  return { complete: missing.length === 0, missing };
};

/** Loads the facts for one user and evaluates them. A missing user is incomplete. */
export const getProfileCompletion = async (userId: number): Promise<ProfileCompletion> => {
  const facts = await findProfileCompletionFacts(userId);
  if (!facts) return { complete: false, missing: [...PROFILE_REQUIREMENTS] };
  return evaluateProfileCompletion(facts);
};

// ---------------------------------------------------------------------------
// Fame rating
// ---------------------------------------------------------------------------

/**
 * Computes the fame breakdown for a user WITHOUT writing anything.
 * Useful for tests and for the "why is my score this" debug path.
 */
export const computeFameBreakdown = async (userId: number): Promise<FameBreakdown> => {
  const [facts, events] = await Promise.all([
    findProfileCompletionFacts(userId),
    countReceivedEvents(userId),
  ]);

  const isProfileComplete = facts !== null && evaluateProfileCompletion(facts).complete;

  const fameRating =
    events.viewCount * FAME_POINTS_PER_VIEW +
    events.likeCount * FAME_POINTS_PER_LIKE +
    (isProfileComplete ? FAME_POINTS_PROFILE_COMPLETE : 0);

  return {
    fameRating,
    viewCount: events.viewCount,
    likeCount: events.likeCount,
    tagCount: facts?.tagCount ?? 0,
    photoCount: facts?.photoCount ?? 0,
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
