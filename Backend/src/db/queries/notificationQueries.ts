import { query } from '../../config/db';

export type NotificationType =
  | 'like'
  | 'view'
  | 'message'
  | 'new_connection'
  | 'unlike';

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

export const createNotification = async (
  userId: number,
  type: NotificationType,
  relatedUserId: number | null,
  content: string
): Promise<NotificationRow | null> => {
  const result = await query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, related_user_id, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, type, related_user_id, content, is_read, created_at`,
    [userId, type, relatedUserId, content]
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
      u.first_name AS related_user_first_name,
      u.username AS related_user_username,
      (
        SELECT p.url FROM photos p
        WHERE p.user_id = u.id
        ORDER BY p.is_profile_picture DESC, p.created_at ASC
        LIMIT 1
      ) AS related_user_photo_url
    FROM notifications n
    LEFT JOIN users u ON u.id = n.related_user_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await query<NotificationWithUser>(sql, [userId, limit, offset]);
  return result.rows;
};

export const getUnreadNotificationCount = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
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
    default:
      return 'New notification';
  }
};