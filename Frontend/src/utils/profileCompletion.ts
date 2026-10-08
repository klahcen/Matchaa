import type { Profile, ProfileRequirement } from '../types/profile';

/**
 * Profile completion gate, frontend side.
 *
 * The backend refuses browse/search/like with 403 PROFILE_INCOMPLETE and a
 * `missing` list until the profile has a biography, at least one tag, a
 * profile picture and a location. These helpers turn those keys into plain
 * words and work out the same list locally, so the profile page checklist
 * updates the moment a photo/tag/location is saved (and still works against
 * a backend that does not send `profile_missing` yet).
 */

const REQUIREMENT_LABELS: Record<ProfileRequirement, string> = {
  biography: 'Write a short biography',
  tags: 'Add at least one interest tag',
  profile_picture: 'Upload a profile picture',
  location: 'Set your location',
};

/** Plain-words label for a missing item; unknown keys are humanized. */
export const describeRequirement = (key: string): string =>
  REQUIREMENT_LABELS[key as ProfileRequirement] ??
  `Complete your ${key.replace(/_/g, ' ')}`;

const hasText = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

/** Computes the missing items from the profile as currently held in state. */
export const computeProfileMissing = (profile: Profile): ProfileRequirement[] => {
  const missing: ProfileRequirement[] = [];
  if (!hasText(profile.biography)) missing.push('biography');
  if (!profile.tags || profile.tags.length === 0) missing.push('tags');
  const hasPicture =
    profile.has_profile_picture ||
    (Array.isArray(profile.photos) && profile.photos.some((photo) => photo.is_profile_picture));
  if (!hasPicture) missing.push('profile_picture');
  if (!hasText(profile.location_text)) missing.push('location');
  return missing;
};

/**
 * Whether the profile passes the gate. Trusts the server's `profile_complete`
 * flag when present, otherwise falls back to the local computation.
 */
export const isProfileComplete = (profile: Profile): boolean =>
  typeof profile.profile_complete === 'boolean'
    ? profile.profile_complete
    : computeProfileMissing(profile).length === 0;
