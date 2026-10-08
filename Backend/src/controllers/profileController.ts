import { NextFunction, Response } from 'express';
import {
  deletePhotoForUser,
  findLikesForUser,
  findPhotoById,
  findProfileById,
  findViewsForUser,
  insertPhotoWithinLimit,
  setProfilePicture,
  updateProfile,
  FullProfile,
  PhotoRow,
  ProfileUpdateData,
} from '../db/queries/profileQueries';
import { findUserByEmail } from '../db/queries/userQueries';
import {
  addTagToUser,
  findOrCreateTag,
  findTagById,
  getUserTags,
  removeTagFromUser,
  searchTags,
} from '../db/queries/tagQueries';
import {
  evaluateProfileCompletion,
  recalculateFameRating,
} from '../services/fameRatingService';
import { geocodeLocation, reverseGeocode } from '../services/geocodingService';
import {
  finalizeUploadedImage,
  MAX_PHOTOS_PER_USER,
  resolveUploadPath,
  safeUnlink,
} from '../services/uploadService';
import { generateSecureToken, validateEmail, validateName } from '../services/authService';
import { sendVerificationEmail } from '../services/emailService';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

/**
 * Allowed values for the profile enums.
 *
 * Gender:      male | female
 * Preference:  male | female (the gender this user wants to see)
 */
export const ALLOWED_GENDERS = ['male', 'female'] as const;
export const ALLOWED_SEXUAL_PREFERENCES = ['male', 'female'] as const;

export const DEFAULT_SEXUAL_PREFERENCE = 'female';

const MAX_BIOGRAPHY_LENGTH = 500;
const MAX_LOCATION_TEXT_LENGTH = 255;
const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 30;

// ---------------------------------------------------------------------------
// Manual validators (no validation libraries)
// ---------------------------------------------------------------------------

const validateGender = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest('Gender is required');
  }
  const normalized = value.trim().toLowerCase();
  if (!ALLOWED_GENDERS.includes(normalized as (typeof ALLOWED_GENDERS)[number])) {
    throw AppError.badRequest(`Gender must be one of: ${ALLOWED_GENDERS.join(', ')}`);
  }
  return normalized;
};

const validateSexualPreference = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest('Sexual preference is required');
  }
  const normalized = value.trim().toLowerCase();
  if (
    !ALLOWED_SEXUAL_PREFERENCES.includes(normalized as (typeof ALLOWED_SEXUAL_PREFERENCES)[number])
  ) {
    throw AppError.badRequest(
      `Sexual preference must be one of: ${ALLOWED_SEXUAL_PREFERENCES.join(', ')}`
    );
  }
  return normalized;
};

const validateBiography = (value: unknown): string => {
  if (value === null) return '';
  if (typeof value !== 'string') {
    throw AppError.badRequest('Biography must be a string');
  }
  if (value.length > MAX_BIOGRAPHY_LENGTH) {
    throw AppError.badRequest(`Biography must not exceed ${MAX_BIOGRAPHY_LENGTH} characters`);
  }
  return value.trim();
};

const validateOptionalBirthdate = (value: unknown): Date | null => {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string') {
    throw AppError.badRequest('Birthdate must be an ISO date string (YYYY-MM-DD)');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw AppError.badRequest('Birthdate must use the format YYYY-MM-DD');
  }
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  if (isNaN(date.getTime())) {
    throw AppError.badRequest('Birthdate is not a valid calendar date');
  }
  const now = Date.now();
  if (date.getTime() > now) {
    throw AppError.badRequest('Birthdate cannot be in the future');
  }
  const ageMs = now - date.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18) {
    throw AppError.badRequest('You must be at least 18 years old to use Matcha');
  }
  if (ageYears > 120) {
    throw AppError.badRequest('Birthdate is not valid');
  }
  return date;
};

/**
 * Tag names are hashtag-style: 2-30 chars, lowercase alphanumeric plus
 * underscore/hyphen, no spaces. A leading "#" is tolerated and stripped,
 * and the name is lowercase-normalized before storage/comparison so
 * "Vegan" and "vegan" resolve to the same shared tag.
 */
const validateTagName = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest('Tag name is required');
  }
  const normalized = value.trim().replace(/^#/, '').toLowerCase();

  if (normalized.length < MIN_TAG_LENGTH || normalized.length > MAX_TAG_LENGTH) {
    throw AppError.badRequest(
      `Tag name must be between ${MIN_TAG_LENGTH} and ${MAX_TAG_LENGTH} characters`
    );
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    throw AppError.badRequest(
      'Tag name may only contain lowercase letters, numbers, underscores and hyphens (no spaces)'
    );
  }
  return normalized;
};

const validateLatitude = (value: unknown): number => {
  const lat = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw AppError.badRequest('Latitude must be a number between -90 and 90');
  }
  return lat;
};

const validateLongitude = (value: unknown): number => {
  const lng = typeof value === 'string' ? Number.parseFloat(value) : (value as number);
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw AppError.badRequest('Longitude must be a number between -180 and 180');
  }
  return lng;
};

const validateLocationText = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw AppError.badRequest(
      'A location is required. Share your GPS position or enter a city/neighborhood manually.'
    );
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) {
    throw AppError.badRequest('Location must be at least 2 characters');
  }
  if (trimmed.length > MAX_LOCATION_TEXT_LENGTH) {
    throw AppError.badRequest(`Location must not exceed ${MAX_LOCATION_TEXT_LENGTH} characters`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F<>{}[\]|\\`^~]/.test(trimmed)) {
    throw AppError.badRequest('Location contains invalid characters');
  }
  return trimmed;
};

const parsePositiveIntParam = (raw: unknown, label: string): number => {
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw AppError.badRequest(`Invalid ${label}`);
  }
  return parsed;
};

/** Stored location_text is VARCHAR(255); provider names can be longer. */
const fitLocationText = (text: string): string =>
  text.length > MAX_LOCATION_TEXT_LENGTH ? text.slice(0, MAX_LOCATION_TEXT_LENGTH).trim() : text;

/**
 * Normalizes a profile for the owning user: never leaks password_hash or any
 * token column.
 *
 * profile_picture_url is strictly the flagged photo (deleting it auto-promotes
 * the oldest remaining photo, so it is only null when the user has no photos).
 *
 * profile_complete / profile_missing come from the same evaluateProfileCompletion
 * used by the fame bonus and the requireCompleteProfile gate.
 * pending_email is the address awaiting confirmation after an email change.
 */
const toProfileResponse = (profile: FullProfile) => {
  const profilePicture = profile.photos.find((p) => p.is_profile_picture) ?? null;
  const completion = evaluateProfileCompletion({
    biography: profile.biography,
    tagCount: profile.tags.length,
    hasProfilePicture: profilePicture !== null,
    locationText: profile.location_text,
  });
  return {
    ...profile,
    pending_email: profile.pending_email ?? null,
    sexual_preferences: profile.sexual_preferences || DEFAULT_SEXUAL_PREFERENCE,
    profile_picture_url: profilePicture?.url ?? null,
    photo_count: profile.photos.length,
    max_photos: MAX_PHOTOS_PER_USER,
    has_profile_picture: profilePicture !== null,
    profile_complete: completion.complete,
    profile_missing: completion.missing,
  };
};

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class ProfileController {
  /**
   * GET /api/profile/me
   * Full profile of the logged-in user, including tags and photos, plus
   * profile_complete / profile_missing and pending_email.
   */
  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await findProfileById(userId);
      if (!profile) {
        throw AppError.notFound('Profile not found');
      }
      res.status(200).json({ success: true, data: toProfileResponse(profile) });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/profile/me
   * Updates gender, sexual preference, biography, first name, last name,
   * email (re-validated for format + uniqueness) and optionally birthdate.
   */
  static async updateMe(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const body = req.body ?? {};

      if (typeof body !== 'object' || Array.isArray(body)) {
        throw AppError.badRequest('Request body must be a valid JSON object');
      }

      const data: ProfileUpdateData = {};

      if (body.gender !== undefined) data.gender = validateGender(body.gender);
      if (body.sexual_preferences !== undefined) {
        data.sexualPreferences = validateSexualPreference(body.sexual_preferences);
      }
      if (body.biography !== undefined) data.biography = validateBiography(body.biography);
      if (body.first_name !== undefined || body.firstName !== undefined) {
        data.firstName = validateName(body.first_name ?? body.firstName, 'First name');
      }
      if (body.last_name !== undefined || body.lastName !== undefined) {
        data.lastName = validateName(body.last_name ?? body.lastName, 'Last name');
      }
      if (body.birthdate !== undefined) data.birthdate = validateOptionalBirthdate(body.birthdate);

      if (body.email !== undefined) {
        const email = validateEmail(body.email);
        const existing = await findUserByEmail(email);
        if (existing && existing.id !== userId) {
          throw AppError.conflict('An account with this email address already exists');
        }
        if (email.toLowerCase() !== req.user!.email.toLowerCase()) {
          data.pendingEmail = email;
          data.verificationToken = generateSecureToken();
          data.verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
      }

      if (Object.keys(data).length === 0 && body.email === undefined) {
        throw AppError.badRequest('No updatable fields were provided');
      }

      const updated = await updateProfile(userId, data);
      if (!updated) {
        throw AppError.notFound('Profile not found');
      }

      let message = 'Profile updated successfully';
      if (data.pendingEmail && data.verificationToken) {
        try {
          await sendVerificationEmail(data.pendingEmail, updated.username, data.verificationToken);
          message =
            `Profile updated. We sent a confirmation link to ${data.pendingEmail}. ` +
            `Your email stays ${updated.email} until you click it.`;
        } catch (error: any) {
          console.error('[ProfileController] Failed to send email-change verification:', error.message);
          message =
            `Profile updated, but we could not send the confirmation email to ${data.pendingEmail}. ` +
            'Submit the new email again to retry.';
        }
      } else if (updated.pending_email) {
        message = `Profile updated. Your email change to ${updated.pending_email} is still waiting for confirmation.`;
      }

      // Completing the bio (or clearing it) changes the +10 completion bonus.
      const fameRating = await recalculateFameRating(userId);

      const profile = await findProfileById(userId);
      // pending_email is repeated at the top level so the client can show the
      // "confirm your new address" state without digging into the profile.
      res.status(200).json({
        success: true,
        message,
        pending_email: profile?.pending_email ?? updated.pending_email ?? null,
        data: profile ? { ...toProfileResponse(profile), fame_rating: fameRating } : undefined,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/profile/me/location
   *
   * Two mutually exclusive modes:
   *  - { lat, lng }        GPS positioning with explicit consent. Reverse-geocoded
   *                        through Nominatim into location_text; precise coords stored.
   *  - { locationText }    Manual fallback when GPS is declined/unavailable.
   *                        Forward-geocoded to the city/neighbourhood centre, so
   *                        distance, sorting and the map work for manual users too;
   *                        the normalized place name replaces the typed text.
   *
   * Responses: 200 { data: { latitude, longitude, location_text, location_source,
   * fame_rating } }; 400 when the place cannot be found; 503 when the location
   * service is unreachable or rate-limited (nothing is saved in either case).
   * There is no IP-based or other implicit fallback: a location is only ever
   * stored from what the user explicitly shared or typed.
   */
  static async updateLocation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const body = req.body ?? {};

      if (typeof body !== 'object' || Array.isArray(body)) {
        throw AppError.badRequest('Request body must be a valid JSON object');
      }

      const hasCoords = body.lat !== undefined && body.lng !== undefined;
      const hasText = body.locationText !== undefined || body.location_text !== undefined;

      if (!hasCoords && !hasText) {
        throw AppError.badRequest('Provide either { lat, lng } or { locationText }');
      }

      if (hasCoords) {
        const lat = validateLatitude(body.lat);
        const lng = validateLongitude(body.lng);

        let locationText: string;
        try {
          locationText = await reverseGeocode(lat, lng);
        } catch (error: any) {
          // Nominatim is a best-effort external dependency: if it fails, let the
          // user supply the neighborhood text themselves rather than losing the coords.
          const fallback = hasText
            ? validateLocationText(body.locationText ?? body.location_text)
            : null;
          if (!fallback) throw error;
          locationText = fallback;
        }

        locationText = fitLocationText(locationText);
        await updateProfile(userId, { locationLat: lat, locationLng: lng, locationText });
        const fameRating = await recalculateFameRating(userId);

        res.status(200).json({
          success: true,
          message: `Location set to ${locationText}`,
          data: {
            latitude: lat,
            longitude: lng,
            location_text: locationText,
            location_source: 'gps',
            fame_rating: fameRating,
          },
        });
        return;
      }

      // Resolve the typed place BEFORE writing anything: an unknown place (400)
      // or an unavailable provider (503) leaves the stored location untouched.
      const typed = validateLocationText(body.locationText ?? body.location_text);
      const geocoded = await geocodeLocation(typed);
      const locationText = fitLocationText(geocoded.resolvedText);

      await updateProfile(userId, {
        locationLat: geocoded.lat,
        locationLng: geocoded.lng,
        locationText,
      });
      const fameRating = await recalculateFameRating(userId);

      res.status(200).json({
        success: true,
        message: `Location set to ${locationText}`,
        data: {
          latitude: geocoded.lat,
          longitude: geocoded.lng,
          location_text: locationText,
          location_source: 'manual',
          fame_rating: fameRating,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/profile/me/tags
   */
  static async getMyTags(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tags = await getUserTags(req.user!.id);
      res.status(200).json({ success: true, data: tags });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile/me/tags
   * Find-or-create in the shared tags table, then link via user_tags.
   * Re-adding a tag the user already has returns 200 (idempotent), not an error.
   */
  static async addTag(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const name = validateTagName(req.body?.name);

      const tag = await findOrCreateTag(name);
      const created = await addTagToUser(userId, tag.id);

      if (created) {
        // A first tag can flip the profile to "complete" (+10).
        await recalculateFameRating(userId);
      }

      res.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Tag added' : 'Tag already on your profile',
        data: tag,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/profile/me/tags/:tagId
   * Removes only the association. The tag itself stays in the shared table.
   */
  static async removeTag(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const tagId = parsePositiveIntParam(req.params.tagId, 'tag id');

      const tag = await findTagById(tagId);
      if (!tag) {
        throw AppError.notFound('Tag not found');
      }

      const removed = await removeTagFromUser(userId, tagId);
      if (removed > 0) {
        // Losing the last tag can drop the +10 completion bonus.
        await recalculateFameRating(userId);
      }

      res.status(200).json({
        success: true,
        message: removed > 0 ? 'Tag removed from your profile' : 'Tag was not on your profile',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/tags/search?q=...
   * Autocomplete over the shared tag table, for the frontend tag picker.
   */
  static async searchTags(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const raw = typeof req.query.q === 'string' ? req.query.q : '';
      const normalized = raw.trim().replace(/^#/, '').toLowerCase().slice(0, MAX_TAG_LENGTH);

      if (normalized.length === 0) {
        res.status(200).json({ success: true, data: [] });
        return;
      }

      const tags = await searchTags(normalized);
      res.status(200).json({ success: true, data: tags });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/profile/me/photos  (multipart/form-data, field name: "photo")
   *
   * Multer has already run (route-level middleware) and enforced the MIME type,
   * extension and 5 MB size limit. Here we verify the real file bytes, then
   * insert the row under a per-user lock that also enforces the 5-photo cap, so
   * parallel uploads cannot exceed it. A photo uploaded while the user has no
   * profile picture (e.g. their first) becomes the profile picture.
   */
  static async uploadPhoto(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const file = req.file;

      if (!file) {
        throw AppError.badRequest(
          'No photo was uploaded. Send a multipart/form-data request with a "photo" field.'
        );
      }

      // Rejects (and deletes) files whose bytes are not a real JPEG/PNG/WebP.
      const url = finalizeUploadedImage(file);

      let photo: PhotoRow | null;
      try {
        photo = await insertPhotoWithinLimit(userId, url, MAX_PHOTOS_PER_USER);
      } catch (error) {
        safeUnlink(file.path);
        throw error;
      }
      if (!photo) {
        safeUnlink(file.path);
        throw AppError.badRequest(
          `You already have the maximum of ${MAX_PHOTOS_PER_USER} photos. Delete one before uploading another.`
        );
      }

      // A first photo can flip the profile to "complete" (+10).
      const fameRating = await recalculateFameRating(userId);

      res.status(201).json({
        success: true,
        message: photo.is_profile_picture
          ? 'Photo uploaded and set as your profile picture'
          : 'Photo uploaded',
        data: { ...photo, fame_rating: fameRating },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/profile/me/photos/:photoId
   * Removes the row and the file. If the deleted photo was the profile picture,
   * the oldest remaining photo is promoted in the same transaction
   * (promoted_photo_id); with no photos left, no profile picture is set.
   */
  static async deletePhoto(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const photoId = parsePositiveIntParam(req.params.photoId, 'photo id');

      const photo = await findPhotoById(photoId);
      if (!photo) {
        throw AppError.notFound('Photo not found');
      }
      if (photo.user_id !== userId) {
        throw AppError.forbidden('You can only delete your own photos');
      }

      const result = await deletePhotoForUser(photoId, userId);
      if (!result) {
        // Deleted by a concurrent request between the lookup and the lock.
        throw AppError.notFound('Photo not found');
      }

      const filePath = resolveUploadPath(result.deleted.url);
      if (filePath) safeUnlink(filePath);

      // Losing the last photo can drop the +10 completion bonus.
      const fameRating = await recalculateFameRating(userId);

      const wasProfilePicture = result.deleted.is_profile_picture;
      const hasProfilePicture = result.remainingCount > 0;
      let message = 'Photo deleted';
      if (result.promoted) {
        message = 'Photo deleted. Your oldest remaining photo is now your profile picture.';
      } else if (!hasProfilePicture) {
        message = 'Photo deleted. You have no photos left: upload one to set a profile picture.';
      }

      res.status(200).json({
        success: true,
        message,
        data: {
          deleted_id: photoId,
          was_profile_picture: wasProfilePicture,
          has_profile_picture: hasProfilePicture,
          promoted_photo_id: result.promoted?.id ?? null,
          photo_count: result.remainingCount,
          fame_rating: fameRating,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/profile/me/photos/:photoId/set-profile-picture
   */
  static async setProfilePicture(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const photoId = parsePositiveIntParam(req.params.photoId, 'photo id');

      const photo = await findPhotoById(photoId);
      if (!photo) {
        throw AppError.notFound('Photo not found');
      }
      if (photo.user_id !== userId) {
        throw AppError.forbidden('You can only change your own profile picture');
      }

      const updated = await setProfilePicture(photoId, userId);
      if (!updated) {
        // Deleted by a concurrent request between the lookup and the lock.
        throw AppError.notFound('Photo not found');
      }

      res.status(200).json({
        success: true,
        message: 'Profile picture updated',
        data: { ...photo, is_profile_picture: true },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/profile/me/views
   * Users who viewed this profile, most recent first, with only public summary
   * fields (username, name, profile picture, fame rating) — never full data.
   */
  static async getMyViews(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const viewers = await findViewsForUser(req.user!.id);
      res.status(200).json({ success: true, data: viewers, count: viewers.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/profile/me/likes
   * Users who liked this profile, most recent first, same shape as views.
   */
  static async getMyLikes(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const likers = await findLikesForUser(req.user!.id);
      res.status(200).json({ success: true, data: likers, count: likers.length });
    } catch (error) {
      next(error);
    }
  }
}
