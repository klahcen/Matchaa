/**
 * Types for the User Profile feature.
 * Kept separate from types/auth.ts so the working auth feature is untouched.
 */

export interface Tag {
  id: number;
  name: string;
}

export interface Photo {
  id: number;
  user_id: number;
  url: string;
  is_profile_picture: boolean;
  created_at: string;
}

/** Fixed value sets — must stay in sync with the backend validators. */
export const GENDER_OPTIONS = ['male', 'female', 'other'] as const;
export const SEXUAL_PREFERENCE_OPTIONS = ['heterosexual', 'homosexual', 'bisexual'] as const;

export type Gender = (typeof GENDER_OPTIONS)[number];
export type SexualPreference = (typeof SEXUAL_PREFERENCE_OPTIONS)[number];

/** GET /api/profile/me response payload. Never contains password_hash or tokens. */
export interface Profile {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  gender: Gender | null;
  sexual_preferences: SexualPreference;
  biography: string | null;
  fame_rating: number;
  birthdate: string | null;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  last_connection: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  photos: Photo[];
  profile_picture_url: string | null;
  photo_count: number;
  max_photos: number;
  has_profile_picture: boolean;
}

/** PUT /api/profile/me request body (all fields optional). */
export interface ProfileUpdatePayload {
  gender?: string;
  sexual_preferences?: string;
  biography?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  birthdate?: string | null;
}

/**
 * PUT /api/profile/me/location — exactly one of the two shapes:
 * GPS coords (consented) or manual text fallback.
 */
export type LocationPayload =
  | { lat: number; lng: number }
  | { locationText: string };

export interface LocationResult {
  latitude: number | null;
  longitude: number | null;
  location_text: string;
  fame_rating: number;
}

/**
 * Public summary of another user, as returned by the views/likes listings.
 * `event_at` is when they viewed or liked me.
 */
export interface ProfileSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  gender: Gender | null;
  fame_rating: number;
  location_text: string | null;
  profile_picture_url: string | null;
  age: number | null;
  event_at: string;
}

export interface PhotoDeleteResult {
  deleted_id: number;
  was_profile_picture: boolean;
  has_profile_picture: boolean;
  photo_count: number;
  fame_rating: number;
}
