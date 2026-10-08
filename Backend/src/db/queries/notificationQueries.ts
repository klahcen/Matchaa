import { query } from '../../config/db';

export type NotificationType =
  | 'like'
  | 'view'
  | 'message'
  | 'new_connection'
  | 'unlike'
  | 'date_proposed'
  | 'date_response';

export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  related_user_id: number | null;
  content: string;
  is_read: boolean;
  created_at: Date;
}

export interface NotificationWithUser extends NotificationRow {
  related_user_first_name: string | null;
  related_user_username: string | null;
  related_user_photo_url: string | null;
}

/**
 * Relationship-churn types that a like/unlike loop can repeat. One of these per
 * actor/recipient/type within DEDUPE_WINDOW is enough; later ones are dropped.
 */
const DEDUPED_TYPES: ReadonlySet<NotificationType> = new Set(['like', 'unlike', 'new_connection']);
const DEDUPE_WINDOW = '1 hour';

/** Related-user columns shared by the list endpoint and the live socket payload. */
const RELATED_USER_COLUMNS = `
  u.first_name AS related_user_first_name,
  u.username AS related_user_username,
  (
    SELECT p.url FROM photos p
    WHERE p.user_id = u.id
    ORDER BY p.is_profile_picture DESC, p.created_at ASC
    LIMIT 1
  ) AS related_user_photo_url
`;

/** Hides notifications involving a user blocked in either direction ($1 = recipient). */
const NOT_BLOCKED_WITH_RELATED_USER = `
  NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = $1 AND b.blocked_id = n.related_user_id)
       OR (b.blocker_id = n.related_user_id AND b.blocked_id = $1)
  )
`;

/**
 * The single notification-creation path. Insert and suppression rules run in
 * one statement, so nothing is written when:
 *   - the recipient muted the actor (they unliked them), or
 *   - a block exists between them in either direction, or
 *   - a deduped type was already sent by the same actor within DEDUPE_WINDOW.
 *
 * @returns the stored row with related-user info (same shape as the list
 * endpoint), or null when the notification was suppressed.
 */
export const createNotification = async (
  userId: number,
  type: NotificationType,
  relatedUserId: number | null,
  content: string
): Promise<NotificationWithUser | null> => {
  const result = await query<NotificationWithUser>(
    `WITH inserted AS (
       INSERT INTO notifications (user_id, type, related_user_id, content)
       SELECT $1::int, $2::varchar, $3::int, $4::text
       WHERE $3::int IS NULL OR (
         NOT EXISTS (
           SELECT 1 FROM notification_mutes
           WHERE user_id = $1::int AND muted_user_id = $3::int
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocker_id = $1::int AND blocked_id = $3::int)
              OR (blocker_id = $3::int AND blocked_id = $1::int)
         )
         AND NOT (
           $5::boolean AND EXISTS (
             SELECT 1 FROM notifications
             WHERE user_id = $1::int AND related_user_id = $3::int AND type = $2::varchar
               AND created_at > CURRENT_TIMESTAMP - INTERVAL '${DEDUPE_WINDOW}'
           )
         )
       )
       RETURNING id, user_id, type, related_user_id, content, is_read, created_at
     )
     SELECT n.id, n.user_id, n.type, n.related_user_id, n.content, n.is_read, n.created_at,
       ${RELATED_USER_COLUMNS}
     FROM inserted n
     LEFT JOIN users u ON u.id = n.related_user_id`,
    [userId, type, relatedUserId, content, DEDUPED_TYPES.has(type)]
  );
  return result.rows[0] ?? null;
};

export const getNotifications = async (
  userId: number,
  limit = 30,
  offset = 0
): Promise<NotificationWithUser[]> => {
  const sql = `
    SELECT
      n.id, n.user_id, n.type, n.related_user_id, n.content, n.is_read, n.created_at,
      ${RELATED_USER_COLUMNS}
    FROM notifications n
    LEFT JOIN users u ON u.id = n.related_user_id
    WHERE n.user_id = $1 AND ${NOT_BLOCKED_WITH_RELATED_USER}
    ORDER BY n.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await query<NotificationWithUser>(sql, [userId, limit, offset]);
  return result.rows;
};

/** Counts the same rows the list shows, so the badge matches the page. */
export const getUnreadNotificationCount = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications n
     WHERE n.user_id = $1 AND n.is_read = FALSE AND ${NOT_BLOCKED_WITH_RELATED_USER}`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};

export const markNotificationAsRead = async (
  userId: number,
  notificationId: number
): Promise<boolean> => {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const markAllNotificationsAsRead = async (userId: number): Promise<number> => {
  const result = await query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return result.rowCount ?? 0;
};

/** `userId` stops receiving notifications from `mutedUserId` (set on unlike). */
export const muteNotificationsFrom = async (userId: number, mutedUserId: number): Promise<void> => {
  await query(
    `INSERT INTO notification_mutes (user_id, muted_user_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, muted_user_id) DO NOTHING`,
    [userId, mutedUserId]
  );
};

/** Lifts the mute again (set on like). */
export const unmuteNotificationsFrom = async (userId: number, mutedUserId: number): Promise<void> => {
  await query(`DELETE FROM notification_mutes WHERE user_id = $1 AND muted_user_id = $2`, [
    userId,
    mutedUserId,
  ]);
};

export const buildNotificationContent = (
  type: NotificationType,
  fromUserFirstName: string
): string => {
  switch (type) {
    case 'like':
      return `${fromUserFirstName} liked your profile`;
    case 'view':
      return `${fromUserFirstName} viewed your profile`;
    case 'message':
      return `New message from ${fromUserFirstName}`;
    case 'new_connection':
      return `You and ${fromUserFirstName} liked each other — you are now connected!`;
    case 'unlike':
      return `${fromUserFirstName} removed their like`;
    case 'date_proposed':
      return `${fromUserFirstName} proposed a date`;
    case 'date_response':
      return `${fromUserFirstName} responded to your date proposal`;
    default:
      return 'New notification';
  }
};
