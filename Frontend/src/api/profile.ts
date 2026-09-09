import type {
  LocationPayload,
  LocationResult,
  Photo,
  PhotoDeleteResult,
  Profile,
  ProfileSummary,
  ProfileUpdatePayload,
  Tag,
} from '../types/profile';

/**
 * Profile API client.
 *
 * Lives in its own module (separate from api/auth.ts) so the working auth
 * feature is never touched. The API root is derived defensively: it accepts
 * either "http://localhost:3000/api" or the legacy auth-scoped
 * "http://localhost:3000/api/auth" in VITE_API_BASE_URL and normalizes both.
 */

const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const API_ROOT = (configured.trim() || 'http://localhost:3000/api')
  .replace(/\/auth\/?$/, '')
  .replace(/\/+$/, '');

/** Backend origin, used to turn relative photo URLs into loadable <img> srcs. */
export const API_ORIGIN = API_ROOT.replace(/\/api$/, '');

/**
 * Photo URLs come back from the API as relative paths ("/uploads/photos/x.jpg")
 * served by the Express static handler. The dev server only proxies /api, so
 * these must be resolved against the backend origin to actually load.
 */
export const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:/i.test(url) || url.startsWith('blob:')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
  errors?: string[];
}

/**
 * Hard ceiling on any single API call, matching api/auth.ts. Without it a
 * backend that accepts the connection but never replies leaves fetch pending
 * forever and the UI spins indefinitely.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Shared fetch wrapper. Sends the httpOnly auth cookie, parses the standard
 * { success, message, data } envelope, and converts failures into Errors with
 * the server's own message (never a stack trace).
 *
 * `json` is false for multipart uploads, where the browser must set the
 * Content-Type header itself so the multipart boundary is correct.
 * Every call is bounded by REQUEST_TIMEOUT_MS; a caller-supplied `signal` is
 * honoured too, and whichever fires first wins.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit & { json?: boolean } = {}
): Promise<ApiEnvelope<T>> {
  const { json = true, headers, signal: callerSignal, ...rest } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', forwardCallerAbort, { once: true });
  }

  const config: RequestInit = {
    ...rest,
    credentials: 'include',
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };

  try {
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${endpoint}`, config);
    } catch (error: any) {
      // A deliberate caller cancellation must stay distinguishable from a real
      // failure so components can ignore it silently.
      if (callerSignal?.aborted && !timedOut) throw error;
      if (timedOut) {
        throw new Error(
          `Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please check that the backend is running and try again.`
        );
      }
      throw new Error(
        'Unable to connect to Matcha server. Please check your connection and try again.'
      );
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        body?.message ||
        (Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return (body ?? { success: true }) as ApiEnvelope<T>;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
}

const unwrap = <T>(envelope: ApiEnvelope<T>, fallback: T): T =>
  (envelope.data ?? fallback) as T;

export const profileApi = {
  /** GET /api/profile/me — full profile incl. tags and photos. */
  getMe: async (): Promise<Profile> => unwrap(await request<Profile>('/profile/me'), null as any),

  /** PUT /api/profile/me — basic info, gender, preference, biography, email. */
  updateMe: async (payload: ProfileUpdatePayload): Promise<Profile> =>
    unwrap(
      await request<Profile>('/profile/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
      null as any
    ),

  /**
   * PUT /api/profile/me/location
   * Pass { lat, lng } after explicit GPS consent, or { locationText } for the
   * manual fallback. The backend reverse-geocodes GPS coords via Nominatim.
   */
  updateLocation: async (payload: LocationPayload): Promise<LocationResult> =>
    unwrap(
      await request<LocationResult>('/profile/me/location', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
      null as any
    ),

  /** GET /api/profile/me/tags */
  getTags: async (): Promise<Tag[]> =>
    unwrap(await request<Tag[]>('/profile/me/tags'), []),

  /** POST /api/profile/me/tags — find-or-create, then link. Idempotent. */
  addTag: async (name: string): Promise<Tag> =>
    unwrap(
      await request<Tag>('/profile/me/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
      null as any
    ),

  /** DELETE /api/profile/me/tags/:tagId — unlinks only; tag stays shared. */
  removeTag: async (tagId: number): Promise<void> => {
    await request<null>(`/profile/me/tags/${tagId}`, { method: 'DELETE' });
  },

  /** GET /api/tags/search?q=... — autocomplete over the shared tag table. */
  searchTags: async (q: string): Promise<Tag[]> =>
    unwrap(await request<Tag[]>(`/tags/search?q=${encodeURIComponent(q)}`), []),

  /**
   * POST /api/profile/me/photos — multipart upload, field name "photo".
   * The browser sets the multipart Content-Type; we must not override it.
   */
  uploadPhoto: async (file: File): Promise<Photo & { fame_rating: number }> => {
    const formData = new FormData();
    formData.append('photo', file);
    return unwrap(
      await request<Photo & { fame_rating: number }>('/profile/me/photos', {
        method: 'POST',
        body: formData,
        json: false,
      }),
      null as any
    );
  },

  /** DELETE /api/profile/me/photos/:photoId */
  deletePhoto: async (photoId: number): Promise<PhotoDeleteResult> =>
    unwrap(
      await request<PhotoDeleteResult>(`/profile/me/photos/${photoId}`, { method: 'DELETE' }),
      null as any
    ),

  /** PUT /api/profile/me/photos/:photoId/set-profile-picture */
  setProfilePicture: async (photoId: number): Promise<Photo> =>
    unwrap(
      await request<Photo>(`/profile/me/photos/${photoId}/set-profile-picture`, {
        method: 'PUT',
      }),
      null as any
    ),

  /** GET /api/profile/me/views — who viewed me, most recent first. */
  getViews: async (): Promise<ProfileSummary[]> =>
    unwrap(await request<ProfileSummary[]>('/profile/me/views'), []),

  /** GET /api/profile/me/likes — who liked me, most recent first. */
  getLikes: async (): Promise<ProfileSummary[]> =>
    unwrap(await request<ProfileSummary[]>('/profile/me/likes'), []),
};
