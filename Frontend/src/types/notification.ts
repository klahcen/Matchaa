export type NotificationType = 'like' | 'view' | 'message' | 'new_connection' | 'unlike';

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  related_user_id: number | null;
  content: string;
  is_read: boolean;
  created_at: string;
  related_user_first_name: string | null;
  related_user_username: string | null;
  related_user_photo_url: string | null;
}

export interface NotificationUnreadCount {
  unread_count: number;
}