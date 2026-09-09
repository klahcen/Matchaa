import { query } from '../../config/db';

/**
 * Block data access.
 *
 * `blocks` is directional: (blocker_id, blocked_id) with UNIQUE on the pair and
 * a CHECK preventing self-blocks. Browsing already excludes both directions from
 * suggestions, so a block created here takes effect there with no extra wiring.
 */

/**
 * Creates a block. Idempotent via ON CONFLICT DO NOTHING.
 * @returns true when a new block row was inserted, false when already blocked.
 */
export const createBlock = async (blockerId: number, blockedId: number): Promise<boolean> => {
  const result = await query(
    `INSERT INTO blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId]
  );
  return (result.rowCount ?? 0) > 0;
};

/**
 * Removes a block (unblock).
 * @returns rows deleted (0 when no such block existed).
 */
export const removeBlock = async (blockerId: number, blockedId: number): Promise<number> => {
  const result = await query(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    blockerId,
    blockedId,
  ]);
  return result.rowCount ?? 0;
};

/** Whether `blockerId` has blocked `blockedId` (one direction only). */
export const hasBlocked = async (blockerId: number, blockedId: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS exists`,
    [blockerId, blockedId]
  );
  return Boolean(result.rows[0]?.exists);
};

/**
 * Both directions at once — the check every interactive endpoint needs before
 * acting, so a blocked pair can never like, report or re-block each other.
 */
export const findBlockState = async (
  userA: number,
  userB: number
): Promise<{ aBlockedB: boolean; bBlockedA: boolean; anyBlock: boolean }> => {
  const result = await query<Record<string, boolean>>(
    `SELECT
       EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2) AS a_blocked_b,
       EXISTS(SELECT 1 FROM blocks WHERE blocker_id = $2 AND blocked_id = $1) AS b_blocked_a`,
    [userA, userB]
  );
  const row = result.rows[0] ?? {};
  const aBlockedB = Boolean(row.a_blocked_b);
  const bBlockedA = Boolean(row.b_blocked_a);
  return { aBlockedB, bBlockedA, anyBlock: aBlockedB || bBlockedA };
};
