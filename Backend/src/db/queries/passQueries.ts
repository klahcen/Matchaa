import { query } from '../../config/db';

/**
 * Swipe-mode passes (migration 010). A pass only hides a profile from the
 * passer's own swipe deck; it is never shown or notified to anyone.
 */

/** Records that userId passed on passedUserId. Passing twice is a no-op. */
export const createPass = async (userId: number, passedUserId: number): Promise<void> => {
  await query(
    `INSERT INTO passes (user_id, passed_user_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, passed_user_id) DO NOTHING`,
    [userId, passedUserId]
  );
};

/** Forgets every pass of userId so those profiles can be dealt again. Returns how many were cleared. */
export const clearPasses = async (userId: number): Promise<number> => {
  const result = await query(`DELETE FROM passes WHERE user_id = $1`, [userId]);
  return result.rowCount ?? 0;
};
