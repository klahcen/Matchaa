/**
 * Types for the Profile View feature (GET /api/users/:userId + actions).
 * Mirrors the backend PublicProfile / RelationshipState payloads from
 * db/queries/profileViewQueries.ts — never email, password_hash or tokens.
 */

export interface PublicPhoto {
  id: number;
  url: string;
  is_profile_picture: boolean;
  created_at: string;
}

export interface PublicTag {
  id: number;
  name: string;
}

/** Directional relationship state between me (the viewer) and the target. */
export interface RelationshipState {
  has_liked: boolean;
  has_liked_me: boolean;
  is_connected: boolean;
  has_blocked: boolean;
  is_blocked_by: boolean;
}

/** What the backend tells me about my OWN ability to act (photo rule). */
export interface ViewerState {
  has_profile_picture: boolean;
  can_like: boolean;
  like_blocked_reason: string | null;
}

export interface PublicProfileResponse {
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
  member_since: string;
  photos: PublicPhoto[];
  tags: PublicTag[];
  is_online: boolean;
  last_seen: string | null;
  online_window_minutes: number;
  relationship: RelationshipState;
  viewer: ViewerState;
  is_self: boolean;
  pending_notifications: PendingNotification[];
}

/**
 * Notifications this action SHOULD trigger. The DB side is written now; actual
 * real-time push delivery (<10s) arrives with the dedicated Notifications
 * feature (Socket.io/websockets are not set up yet).
 */
export interface PendingNotification {
  type: string;
  for_user_id?: number;
  from_user_id?: number;
  with_user_id?: number;
  delivered: boolean;
}

export interface LikeResult {
  has_liked: boolean;
  has_liked_me: boolean;
  is_connected: boolean;
  newly_connected: boolean;
  target_fame_rating: number;
  pending_notifications: PendingNotification[];
}

export interface UnlikeResult {
  has_liked: boolean;
  has_liked_me: boolean;
  is_connected: boolean;
  connection_broken: boolean;
  target_fame_rating: number;
}

export interface BlockResult {
  has_blocked: boolean;
  is_connected: boolean;
  connection_broken: boolean;
  likes_removed: number;
  viewer_fame_rating: number;
  target_fame_rating: number;
  pending_notifications: PendingNotification[];
}

export interface UnblockResult {
  has_blocked: boolean;
  is_connected: boolean;
}

export interface ReportResult {
  report_id: number;
  reported_id: number;
  reason: string;
  created_at: string;
  pending_notifications: PendingNotification[];
}
