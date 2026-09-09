export interface Conversation {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  photo_url: string | null;
  last_message_content: string | null;
  last_message_at: string | null;
  last_message_sender_id: number | null;
  unread_count: number;
}

export interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: string;
  read_at: string | null;
  sender_first_name: string;
  sender_username: string;
}

export interface ChatUnreadCount {
  unread_count: number;
}