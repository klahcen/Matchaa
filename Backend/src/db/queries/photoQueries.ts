import { query } from '../../config/db';
import { PhotoRow } from './profileQueries';

/**
 * Lists all photos owned by a user, oldest first (stable ordering for the grid UI).
 */
export const getUserPhotos = async (userId: number): Promise<PhotoRow[]> => {
  const sql = `
    SELECT id, user_id, url, is_profile_picture, created_at
    FROM photos
    WHERE user_id = $1
    ORDER BY created_at ASC, id ASC;
  `;
  const result = await query<PhotoRow>(sql, [userId]);
  return result.rows;
};

/**
 * Returns the user's current profile picture, or null if none is set.
 */
export const getProfilePicture = async (userId: number): Promise<PhotoRow | null> => {
  const sql = `
    SELECT id, user_id, url, is_profile_picture, created_at
    FROM photos
    WHERE user_id = $1 AND is_profile_picture = TRUE
    LIMIT 1;
  `;
  const result = await query<PhotoRow>(sql, [userId]);
  return result.rows[0] ?? null;
};

/**
 * Counts photos for a user (used to enforce the max-5 limit before hitting disk).
 */
export const countPhotos = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};
