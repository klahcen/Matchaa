import { query } from '../../config/db';
import { computeAge } from './profileQueries';

/**
 * Profile View data access — reading another user's public profile, logging the
 * visit, and resolving the relationship state between two users.
 *
 * All SQL is raw and parameterized. Two privacy rules are enforced here at the
 * query level rather than in the controller, so they cannot be bypassed:
 *   - email, password_hash and every token column are never selected
 *   - precise latitude/longitude are never selected; only location_text is
 *     exposed, matching the rule established by the Profile feature
 */

/*
 * Online status is NOT derived from here: a user is online iff they have at
 * least one connected socket (see isUserOnline in sockets/socketServer.ts).
 * `last_connection` is written by the socket server on connect and when the
 * user's last socket disconnects, so it is the real "last seen" time.
 */

export interface PublicPhoto {
  id: number;
  url: string;
  is_profile_picture: boolean;
  created_at: Date;
}

export interface PublicTag {
  id: number;
  name: string;
}

/** Everything about a user that another user is allowed to see. */
export interface PublicProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  age: number | null;
  gender: string | null;
  sexual_preferences: string | null;
  biography: string | null;
  fame_rating: number;
  location_text: string | null;
  last_connection: Date | null;
  member_since: Date;
  photos: PublicPhoto[];
  tags: PublicTag[];
}

/** Directional relationship state between the viewer and the target. */
export interface RelationshipState {
  /** I liked them. */
  has_liked: boolean;
  /** They liked me. */
  has_liked_me: boolean;
  /** Mutual like — the two users are connected. */
  is_connected: boolean;
  /** I blocked them. */
  has_blocked: boolean;
  /** They blocked me. When true the profile is not viewable at all. */
  is_blocked_by: boolean;
}

/**
 * Fetches a user's public profile.
 * Returns null when the user does not exist.
 */
export const findPublicProfileById = async (userId: number): Promise<PublicProfile | null> => {
  const sql = `
    SELECT
      u.id, u.username, u.first_name, u.last_name,
      u.birthdate, u.gender, u.sexual_preferences, u.biography,
      u.fame_rating, u.location_text, u.last_connection, u.created_at
    FROM users u
    WHERE u.id = $1
    LIMIT 1;
  `;
  const result = await query<Record<string, any>>(sql, [userId]);
  const row = result.rows[0];
  if (!row) return null;

  const [photosRes, tagsRes] = await Promise.all([
    query<PublicPhoto>(
      `SELECT id, url, is_profile_picture, created_at
       FROM photos WHERE user_id = $1
       ORDER BY is_profile_picture DESC, created_at ASC, id ASC`,
      [userId]
    ),
    query<PublicTag>(
      `SELECT t.id, t.name
       FROM tags t JOIN user_tags ut ON ut.tag_id = t.id
       WHERE ut.user_id = $1 ORDER BY t.name ASC`,
      [userId]
    ),
  ]);

  return {
    id: row.id,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    age: computeAge(row.birthdate),
    gender: row.gender,
    sexual_preferences: row.sexual_preferences,
    biography: row.biography,
    fame_rating: row.fame_rating ?? 0,
    location_text: row.location_text,
    last_connection: row.last_connection,
    member_since: row.created_at,
    photos: photosRes.rows,
    tags: tagsRes.rows,
  };
};

/**
 * Resolves all five directional relationship flags in a single round-trip.
 */
export const findRelationshipState = async (
  viewerId: number,
  targetId: number
): Promise<RelationshipState> => {
  const sql = `
    SELECT
      EXISTS(SELECT 1 FROM likes  WHERE liker_id   = $1 AND liked_id   = $2) AS has_liked,
      EXISTS(SELECT 1 FROM likes  WHERE liker_id   = $2 AND liked_id   = $1) AS has_liked_me,
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS has_blocked,
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $2 AND blocked_id = $1) AS is_blocked_by;
  `;
  const result = await query<Record<string, boolean>>(sql, [viewerId, targetId]);
  const row = result.rows[0] ?? {};

  const has_liked = Boolean(row.has_liked);
  const has_liked_me = Boolean(row.has_liked_me);

  return {
    has_liked,
    has_liked_me,
    // Connection is derived purely from mutual likes, so removing either like
    // immediately breaks it — there is no separate connection row to clean up.
    is_connected: has_liked && has_liked_me,
    has_blocked: Boolean(row.has_blocked),
    is_blocked_by: Boolean(row.is_blocked_by),
  };
};

/**
 * Appends a row to the visit history log.
 *
 * Since migration 004 `views` has no unique constraint on (viewer_id,
 * viewed_id), so every visit inserts a new row. Returns whether this was the
 * viewer's FIRST ever visit, which is the only case that changes the target's
 * fame rating (fame counts distinct viewers), letting the caller skip a
 * pointless recalculation on repeat visits.
 */
export const recordProfileView = async (
  viewerId: number,
  viewedId: number
): Promise<{ isFirstView: boolean }> => {
  const existing = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM views WHERE viewer_id = $1 AND viewed_id = $2`,
    [viewerId, viewedId]
  );
  const isFirstView = (existing.rows[0]?.count ?? 0) === 0;

  await query(`INSERT INTO views (viewer_id, viewed_id) VALUES ($1, $2)`, [viewerId, viewedId]);

  return { isFirstView };
};

/** Total number of history rows for a viewer/target pair. */
export const countViewsBetween = async (viewerId: number, viewedId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM views WHERE viewer_id = $1 AND viewed_id = $2`,
    [viewerId, viewedId]
  );
  return result.rows[0]?.count ?? 0;
};

/** True when the user has a selected profile picture (required before liking). */
export const userHasProfilePicture = async (userId: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM photos WHERE user_id = $1 AND is_profile_picture = TRUE) AS exists`,
    [userId]
  );
  return Boolean(result.rows[0]?.exists);
};

/** True when the user exists at all. */
export const userExists = async (userId: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) AS exists`,
    [userId]
  );
  return Boolean(result.rows[0]?.exists);
};

/**
 * Stamps `last_connection`. Called by the socket server on connect and when a
 * user's last socket disconnects (which also covers logout). GREATEST keeps a
 * slow, older write from overwriting a newer one.
 */
export const touchLastConnection = async (userId: number, at: Date = new Date()): Promise<void> => {
  await query(
    `UPDATE users SET last_connection = GREATEST(last_connection, $2::timestamptz) WHERE id = $1`,
    [userId, at]
  );
};

/**
 * A user's last connection time.
 * @returns undefined when the user does not exist, null when never recorded.
 */
export const findLastConnection = async (userId: number): Promise<Date | null | undefined> => {
  const result = await query<{ last_connection: Date | null }>(
    `SELECT last_connection FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows.length === 0 ? undefined : result.rows[0].last_connection;
};
