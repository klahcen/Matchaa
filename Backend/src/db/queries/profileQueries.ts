import { PoolClient } from 'pg';
import { pool, query } from '../../config/db';
import { User } from '../../types';
import { AppError } from '../../utils/AppError';

/**
 * Row shape of the `photos` table.
 */
export interface PhotoRow {
  id: number;
  user_id: number;
  url: string;
  is_profile_picture: boolean;
  created_at: Date;
}

/**
 * Full profile payload returned to the owning user.
 * Deliberately excludes password_hash and all token columns.
 */
export interface FullProfile {
  id: number;
  email: string;
  pending_email: string | null;
  username: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  gender: string | null;
  sexual_preferences: string | null;
  biography: string | null;
  fame_rating: number;
  birthdate: Date | null;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  last_connection: Date | null;
  created_at: Date;
  updated_at: Date;
  tags: { id: number; name: string }[];
  photos: PhotoRow[];
}

/**
 * Public summary of another user, used by the views/likes listings.
 * Never includes email, coordinates precision beyond what's shared, or secrets.
 */
export interface ProfileSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  fame_rating: number;
  location_text: string | null;
  profile_picture_url: string | null;
  age: number | null;
  event_at: Date;
}

export interface ProfileUpdateData {
  gender?: string | null;
  sexualPreferences?: string | null;
  biography?: string | null;
  firstName?: string;
  lastName?: string;
  pendingEmail?: string;
  verificationToken?: string;
  verificationTokenExpiresAt?: Date;
  birthdate?: Date | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationText?: string | null;
}

/**
 * Returns the logged-in user's full profile, with tags and photos aggregated
 * via json_agg so a single round-trip fetches everything.
 * Sensitive columns (password_hash, tokens) are explicitly not selected.
 */
export const findProfileById = async (userId: number): Promise<FullProfile | null> => {
  const sql = `
    SELECT
      u.id, u.email, u.pending_email, u.username, u.first_name, u.last_name, u.is_verified,
      u.gender, u.sexual_preferences, u.biography, u.fame_rating, u.birthdate,
      u.latitude, u.longitude, u.location_text,
      u.last_connection, u.created_at, u.updated_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
         FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
         WHERE ut.user_id = u.id),
        '[]'::json
      ) AS tags,
      COALESCE(
        (SELECT json_agg(json_build_object(
            'id', p.id,
            'user_id', p.user_id,
            'url', p.url,
            'is_profile_picture', p.is_profile_picture,
            'created_at', p.created_at
         ) ORDER BY p.created_at)
         FROM photos p WHERE p.user_id = u.id),
        '[]'::json
      ) AS photos
    FROM users u
    WHERE u.id = $1
    LIMIT 1;
  `;

  const result = await query<Record<string, any>>(sql, [userId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    pending_email: row.pending_email,
    username: row.username,
    first_name: row.first_name,
    last_name: row.last_name,
    is_verified: row.is_verified,
    gender: row.gender,
    sexual_preferences: row.sexual_preferences,
    biography: row.biography,
    fame_rating: row.fame_rating,
    birthdate: row.birthdate,
    latitude: row.latitude,
    longitude: row.longitude,
    location_text: row.location_text,
    last_connection: row.last_connection,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: row.tags ?? [],
    photos: row.photos ?? [],
  };
};

/**
 * Raw inputs of the "profile complete" rule (evaluated in fameRatingService).
 * One round-trip; null when the user does not exist.
 */
export interface ProfileCompletionFactsRow {
  biography: string | null;
  locationText: string | null;
  tagCount: number;
  photoCount: number;
  hasProfilePicture: boolean;
}

export const findProfileCompletionFacts = async (
  userId: number
): Promise<ProfileCompletionFactsRow | null> => {
  const sql = `
    SELECT
      u.biography,
      u.location_text,
      (SELECT COUNT(*)::int FROM user_tags ut WHERE ut.user_id = u.id) AS tag_count,
      (SELECT COUNT(*)::int FROM photos p WHERE p.user_id = u.id) AS photo_count,
      EXISTS (SELECT 1 FROM photos p
              WHERE p.user_id = u.id AND p.is_profile_picture = TRUE) AS has_profile_picture
    FROM users u
    WHERE u.id = $1
    LIMIT 1;
  `;
  const result = await query<Record<string, any>>(sql, [userId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    biography: row.biography,
    locationText: row.location_text,
    tagCount: row.tag_count ?? 0,
    photoCount: row.photo_count ?? 0,
    hasProfilePicture: Boolean(row.has_profile_picture),
  };
};

/**
 * Dynamically builds an UPDATE statement for only the fields present in `data`.
 * All values are parameterized ($1, $2, ...) — never interpolated into SQL.
 * Returns null when there is nothing to update.
 */
export const updateProfile = async (
  userId: number,
  data: ProfileUpdateData
): Promise<User | null> => {
  const assignments: string[] = [];
  const values: any[] = [];
  let i = 1;

  const add = (column: string, value: any, cast?: string): void => {
    assignments.push(`${column} = $${i++}${cast ? `::${cast}` : ''}`);
    values.push(value);
  };

  if (data.gender !== undefined) add('gender', data.gender, 'user_gender');
  if (data.sexualPreferences !== undefined) add('sexual_preferences', data.sexualPreferences, 'user_sexual_preference');
  if (data.biography !== undefined) add('biography', data.biography);
  if (data.firstName !== undefined) add('first_name', data.firstName);
  if (data.lastName !== undefined) add('last_name', data.lastName);
  if (data.pendingEmail !== undefined) add('pending_email', data.pendingEmail);
  if (data.verificationToken !== undefined) add('verification_token', data.verificationToken);
  if (data.verificationTokenExpiresAt !== undefined) add('verification_token_expires_at', data.verificationTokenExpiresAt);
  if (data.birthdate !== undefined) add('birthdate', data.birthdate);
  if (data.locationLat !== undefined) add('latitude', data.locationLat);
  if (data.locationLng !== undefined) add('longitude', data.locationLng);
  if (data.locationText !== undefined) add('location_text', data.locationText);

  if (assignments.length === 0) {
    const current = await query<User>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return current.rows[0] ?? null;
  }

  assignments.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);

  const sql = `UPDATE users SET ${assignments.join(', ')} WHERE id = $${i} RETURNING *`;
  const result = await query<User>(sql, values);
  return result.rows[0] ?? null;
};

/**
 * Counts how many photos a user already owns. The 5-photo cap itself is
 * enforced atomically by insertPhotoWithinLimit.
 */
export const countUserPhotos = async (userId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.count ?? 0;
};

/** Remaining rows determine the count and selected-picture state after deletion. */
export const getUserPhotos = async (userId: number): Promise<PhotoRow[]> => {
  const result = await query<PhotoRow>('SELECT * FROM photos WHERE user_id = $1', [userId]);
  return result.rows;
};

/**
 * Fetches a single photo row by id (used for ownership checks before delete/promote).
 */
export const findPhotoById = async (photoId: number): Promise<PhotoRow | null> => {
  const result = await query<PhotoRow>(`SELECT * FROM photos WHERE id = $1 LIMIT 1`, [photoId]);
  return result.rows[0] ?? null;
};

/**
 * Inserts a new photo row for a user.
 */
export const insertPhoto = async (
  userId: number,
  url: string,
  isProfilePicture: boolean
): Promise<PhotoRow> => {
  const sql = `
    INSERT INTO photos (user_id, url, is_profile_picture)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const result = await query<PhotoRow>(sql, [userId, url, isProfilePicture]);
  return result.rows[0];
};

/**
 * Deletes a photo row. Returns the number of rows actually removed.
 */
export const deletePhotoRow = async (photoId: number): Promise<number> => {
  const result = await query(`DELETE FROM photos WHERE id = $1`, [photoId]);
  return result.rowCount ?? 0;
};

// ---------------------------------------------------------------------------
// Photo mutations (serialized per user)
// ---------------------------------------------------------------------------

/**
 * Runs `work` in a transaction that first locks the owner's users row, so all
 * photo mutations of ONE user (upload, delete, set-profile-picture) run one at
 * a time. That is what makes the 5-photo cap and the "exactly one profile
 * picture" invariant hold under concurrent requests; a plain count-then-insert
 * would let two parallel uploads both see 4 photos and both insert.
 *
 * FOR NO KEY UPDATE conflicts with itself (so it serializes these transactions)
 * but not with the KEY SHARE locks taken by foreign-key checks, so likes, views
 * or messages referencing this user are never blocked by a photo change.
 */
const withUserPhotoLock = async <T>(
  userId: number,
  work: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [
      userId,
    ]);
    if (locked.rowCount === 0) {
      throw AppError.notFound('Profile not found');
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Atomically enforces the per-user photo cap and inserts the photo.
 * Returns null (and inserts nothing) when the user already has `maxPhotos`.
 * The new photo becomes the profile picture when the user has none yet.
 */
export const insertPhotoWithinLimit = async (
  userId: number,
  url: string,
  maxPhotos: number
): Promise<PhotoRow | null> =>
  withUserPhotoLock(userId, async (client) => {
    const state = await client.query<{ count: number; has_profile_picture: boolean }>(
      `SELECT COUNT(*)::int AS count,
              COALESCE(BOOL_OR(is_profile_picture), FALSE) AS has_profile_picture
       FROM photos WHERE user_id = $1`,
      [userId]
    );
    const { count, has_profile_picture } = state.rows[0];
    if (count >= maxPhotos) return null;

    const inserted = await client.query<PhotoRow>(
      `INSERT INTO photos (user_id, url, is_profile_picture)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, url, !has_profile_picture]
    );
    return inserted.rows[0];
  });

export interface PhotoDeletion {
  deleted: PhotoRow;
  /** Photo promoted to profile picture because none was left, or null. */
  promoted: PhotoRow | null;
  remainingCount: number;
}

/**
 * Deletes one of the user's photos. If that leaves photos but no profile
 * picture (the deleted one was it), the OLDEST remaining photo is promoted in
 * the same transaction, so the user never ends up without one while they still
 * have photos. Returns null when the photo does not exist or is not theirs.
 */
export const deletePhotoForUser = async (
  photoId: number,
  userId: number
): Promise<PhotoDeletion | null> =>
  withUserPhotoLock(userId, async (client) => {
    const removed = await client.query<PhotoRow>(
      `DELETE FROM photos WHERE id = $1 AND user_id = $2 RETURNING *`,
      [photoId, userId]
    );
    const deleted = removed.rows[0];
    if (!deleted) return null;

    const promotedRes = await client.query<PhotoRow>(
      `UPDATE photos SET is_profile_picture = TRUE
       WHERE id = (SELECT id FROM photos WHERE user_id = $1
                   ORDER BY created_at ASC, id ASC LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM photos
                         WHERE user_id = $1 AND is_profile_picture = TRUE)
       RETURNING *`,
      [userId]
    );

    const remaining = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM photos WHERE user_id = $1`,
      [userId]
    );

    return {
      deleted,
      promoted: promotedRes.rows[0] ?? null,
      remainingCount: remaining.rows[0]?.count ?? 0,
    };
  });

/**
 * Promotes a photo to profile picture, unsetting any previous one for that user.
 *
 * Scoped by user_id, so a user can never touch another user's photos. Runs under
 * the per-user photo lock and re-checks the photo still exists, so a concurrent
 * delete can't leave the user with no profile picture. The old flag is cleared
 * BEFORE the new one is set: the partial unique index is checked row by row, so
 * a single "SET is_profile_picture = (id = $1)" could briefly see two TRUE rows.
 * Returns false when the photo is gone or not owned by the user.
 */
export const setProfilePicture = async (photoId: number, userId: number): Promise<boolean> =>
  withUserPhotoLock(userId, async (client) => {
    const target = await client.query(`SELECT 1 FROM photos WHERE id = $1 AND user_id = $2`, [
      photoId,
      userId,
    ]);
    if (target.rowCount === 0) return false;

    await client.query(
      `UPDATE photos SET is_profile_picture = FALSE
       WHERE user_id = $1 AND is_profile_picture = TRUE AND id <> $2`,
      [userId, photoId]
    );
    await client.query(`UPDATE photos SET is_profile_picture = TRUE WHERE id = $1`, [photoId]);
    return true;
  });

/**
 * Excludes anyone with a block between them and the listing owner ($1), in
 * either direction, mirroring the candidate pool's rule.
 */
const NOT_BLOCKED_EITHER_WAY = `
      NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = $1 AND b.blocked_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = u.id AND b.blocked_id = $1)`;

/**
 * Lists users who viewed this profile, most recent first.
 * If a viewer has been seen multiple times, only their most recent view is shown.
 * Users blocked in either direction are left out.
 */
export const findViewsForUser = async (userId: number): Promise<ProfileSummary[]> => {
  const sql = `
    SELECT
      u.id, u.username, u.first_name, u.last_name, u.gender,
      u.fame_rating, u.location_text, u.birthdate,
      (SELECT p.url FROM photos p
       WHERE p.user_id = u.id AND p.is_profile_picture = TRUE LIMIT 1) AS profile_picture_url,
      v.latest_view AS event_at
    FROM (
      SELECT viewer_id, MAX(created_at) AS latest_view
      FROM views
      WHERE viewed_id = $1
      GROUP BY viewer_id
    ) v
    JOIN users u ON u.id = v.viewer_id
    WHERE ${NOT_BLOCKED_EITHER_WAY}
    ORDER BY v.latest_view DESC;
  `;
  const result = await query<Record<string, any>>(sql, [userId]);
  return result.rows.map(mapProfileSummary);
};

/**
 * Lists users who liked this profile, most recent first.
 * Users blocked in either direction are left out.
 */
export const findLikesForUser = async (userId: number): Promise<ProfileSummary[]> => {
  const sql = `
    SELECT
      u.id, u.username, u.first_name, u.last_name, u.gender,
      u.fame_rating, u.location_text, u.birthdate,
      (SELECT p.url FROM photos p
       WHERE p.user_id = u.id AND p.is_profile_picture = TRUE LIMIT 1) AS profile_picture_url,
      l.created_at AS event_at
    FROM likes l
    JOIN users u ON u.id = l.liker_id
    WHERE l.liked_id = $1
      AND ${NOT_BLOCKED_EITHER_WAY}
    ORDER BY l.created_at DESC;
  `;
  const result = await query<Record<string, any>>(sql, [userId]);
  return result.rows.map(mapProfileSummary);
};

const mapProfileSummary = (row: Record<string, any>): ProfileSummary => ({
  id: row.id,
  username: row.username,
  first_name: row.first_name,
  last_name: row.last_name,
  gender: row.gender,
  fame_rating: row.fame_rating,
  location_text: row.location_text,
  profile_picture_url: row.profile_picture_url,
  age: computeAge(row.birthdate),
  event_at: row.event_at,
});

/**
 * Derives an integer age from a birthdate column, or null when unset.
 */
export const computeAge = (birthdate: Date | string | null): number | null => {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  if (isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
};

/**
 * Counts views and likes received by a user — used by the fame rating service.
 *
 * Views are counted as DISTINCT viewers, not rows. Since migration 004 turned
 * `views` into a visit history log (one row per visit), a plain COUNT(*) would
 * let anyone farm a target's fame rating just by reloading their profile.
 * Counting unique people keeps the documented "+1 per profile view received"
 * meaning intact: +1 per person who viewed you, however often they visited.
 *
 * Likes keep COUNT(*) because `likes` still has UNIQUE(liker_id, liked_id), so
 * one row per pair is already guaranteed.
 */
export const countReceivedEvents = async (
  userId: number
): Promise<{ viewCount: number; likeCount: number }> => {
  const viewRes = await query<{ count: number }>(
    `SELECT COUNT(DISTINCT viewer_id)::int AS count FROM views WHERE viewed_id = $1`,
    [userId]
  );
  const likeRes = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM likes WHERE liked_id = $1`,
    [userId]
  );
  return {
    viewCount: viewRes.rows[0]?.count ?? 0,
    likeCount: likeRes.rows[0]?.count ?? 0,
  };
};
