import { query } from '../../config/db';

/**
 * Like data access.
 *
 * `likes` keeps UNIQUE(liker_id, liked_id), so a like is one row per directed
 * pair. "Connection" is NOT stored anywhere — it is derived on read from the
 * presence of both directions, which means unliking automatically breaks the
 * connection with no extra cleanup step.
 */

/**
 * Creates a like. Idempotent at the SQL level via ON CONFLICT DO NOTHING.
 * @returns true when a new row was inserted, false when the like already existed.
 */
export const createLike = async (likerId: number, likedId: number): Promise<boolean> => {
  const result = await query(
    `INSERT INTO likes (liker_id, liked_id)
     VALUES ($1, $2)
     ON CONFLICT (liker_id, liked_id) DO NOTHING`,
    [likerId, likedId]
  );
  return (result.rowCount ?? 0) > 0;
};

/**
 * Removes a like.
 * @returns the number of rows deleted (0 when there was nothing to remove).
 */
export const removeLike = async (likerId: number, likedId: number): Promise<number> => {
  const result = await query(`DELETE FROM likes WHERE liker_id = $1 AND liked_id = $2`, [
    likerId,
    likedId,
  ]);
  return result.rowCount ?? 0;
};

/** Whether `likerId` currently likes `likedId`. */
export const hasLiked = async (likerId: number, likedId: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM likes WHERE liker_id = $1 AND liked_id = $2) AS exists`,
    [likerId, likedId]
  );
  return Boolean(result.rows[0]?.exists);
};

/** Whether both users like each other — i.e. they are connected. */
export const isMutualLike = async (userA: number, userB: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM likes ab JOIN likes ba
         ON ba.liker_id = ab.liked_id AND ba.liked_id = ab.liker_id
       WHERE ab.liker_id = $1 AND ab.liked_id = $2
     ) AS exists`,
    [userA, userB]
  );
  return Boolean(result.rows[0]?.exists);
};

/**
 * Deletes likes in BOTH directions between two users.
 * Used when a block is created: a blocked relationship must not keep leftover
 * like state, so the connection cannot survive the block.
 * @returns total number of like rows removed.
 */
export const removeLikesBetween = async (userA: number, userB: number): Promise<number> => {
  const result = await query(
    `DELETE FROM likes
     WHERE (liker_id = $1 AND liked_id = $2)
        OR (liker_id = $2 AND liked_id = $1)`,
    [userA, userB]
  );
  return result.rowCount ?? 0;
};
