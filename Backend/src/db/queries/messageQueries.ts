import { query } from '../../config/db';

export interface MessageRow {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: Date;
  read_at: Date | null;
}

export interface MessageWithSender extends MessageRow {
  sender_first_name: string;
  sender_username: string;
}

export const createMessage = async (
  senderId: number,
  receiverId: number,
  content: string
): Promise<MessageRow> => {
  const result = await query<MessageRow>(
    `INSERT INTO messages (sender_id, receiver_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, receiver_id, content, created_at, read_at`,
    [senderId, receiverId, content]
  );
  return result.rows[0];
};

export const getConversation = async (
  userId: number,
  otherUserId: number,
  limit = 50,
  beforeId?: number
): Promise<MessageWithSender[]> => {
  let sql = `
    SELECT
      m.id, m.sender_id, m.receiver_id, m.content, m.created_at, m.read_at,
      u.first_name AS sender_first_name, u.username AS sender_username
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE (m.sender_id = $1 AND m.receiver_id = $2)
       OR (m.sender_id = $2 AND m.receiver_id = $1)
  `;
  const params: any[] = [userId, otherUserId];

  if (beforeId) {
    sql += ` AND m.id < $3`;
    params.push(beforeId);
  }

  sql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query<MessageWithSender>(sql, params);
  return result.rows.reverse();
};

export const getConversationsList = async (userId: number): Promise<any[]> => {
  const sql = `
    SELECT DISTINCT ON (other_user.id)
      other_user.id,
      other_user.first_name,
      other_user.last_name,
      other_user.username,
      (
        SELECT url FROM photos p
        WHERE p.user_id = other_user.id
        ORDER BY p.is_profile_picture DESC, p.created_at ASC
        LIMIT 1
      ) AS photo_url,
      last_msg.content AS last_message_content,
      last_msg.created_at AS last_message_at,
      last_msg.sender_id AS last_message_sender_id,
      (
        SELECT COUNT(*)::int FROM messages m
        WHERE m.receiver_id = $1 AND m.sender_id = other_user.id AND m.read_at IS NULL
      ) AS unread_count
    FROM users other_user
    JOIN likes l1 ON l1.liker_id = $1 AND l1.liked_id = other_user.id
    JOIN likes l2 ON l2.liker_id = other_user.id AND l2.liked_id = $1
    LEFT JOIN LATERAL (
      SELECT * FROM messages m
      WHERE (m.sender_id = $1 AND m.receiver_id = other_user.id)
         OR (m.sender_id = other_user.id AND m.receiver_id = $1)
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last_msg ON true
    WHERE other_user.is_verified = TRUE
    ORDER BY other_user.id, last_msg.created_at DESC NULLS LAST
  `;
  const result = await query(sql, [userId]);
  return result.rows;
};

export const markMessagesAsRead = async (userId: number, senderId: number): Promise<number> => {
  const result = await query(
    `UPDATE messages
     SET read_at = CURRENT_TIMESTAMP
     WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [userId, senderId]
  );
  return result.rowCount ?? 0;
};

export const getUnreadMessageCount = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM messages WHERE receiver_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};

export const getUnreadMessageCountFrom = async (userId: number, senderId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM messages WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [userId, senderId]
  );
  return result.rows[0]?.count ?? 0;
};

export const areUsersConnected = async (userA: number, userB: number): Promise<boolean> => {
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