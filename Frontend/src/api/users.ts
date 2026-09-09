import type {
  BlockResult,
  LikeResult,
  PublicProfileResponse,
  ReportResult,
  UnblockResult,
  UnlikeResult,
} from '../types/users';
import { API_ROOT } from './profile';

/**
 * Profile View API client — GET /api/users/:userId plus the like, block and
 * report actions available from that screen.
 *
 * Reuses API_ROOT from api/profile.ts (single place the backend origin is
 * derived) and follows the same fetch pattern as api/browse.ts: httpOnly auth
 * cookie via credentials:'include', 10s timeout, standard envelope unwrapping.
 *
 * Unlike browse.ts, failures throw UsersApiError which keeps the HTTP status —
 * the page needs it to turn a 404 (missing profile OR blocked-by-target, the
 * backend deliberately makes those indistinguishable) into the clean
 * "Profile not available" state instead of a generic error banner.
 */

const REQUEST_TIMEOUT_MS = 10_000;

export class UsersApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UsersApiError';
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { signal?: AbortSignal } = {}
): Promise<T> {
  const { signal: callerSignal, ...rest } = options;

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

  try {
    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${endpoint}`, {
        ...rest,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(rest.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (error: any) {
      if (callerSignal?.aborted && !timedOut) throw error;
      if (timedOut) {
        throw new UsersApiError(
          `Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`,
          0
        );
      }
      throw new UsersApiError(
        'Unable to connect to Matcha server. Is the backend running on port 3000?',
        0
      );
    }

    let body: ApiEnvelope<T> | null = null;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        body?.message ||
        (Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      throw new UsersApiError(message, response.status);
    }

    return (body?.data ?? (null as T)) as T;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
}

export const usersApi = {
  /**
   * GET /api/users/:userId — full public profile (everything except email and
   * password), photos, tags, fame rating, online/last-seen, and the five
   * relationship flags. The backend also appends this visit to the `views`
   * history log (unless it is my own profile).
   * Throws UsersApiError(404) when the profile does not exist or the target
   * has blocked me — both must render the same "not available" state.
   */
  getProfile: (userId: number, options?: { signal?: AbortSignal }): Promise<PublicProfileResponse> =>
    request<PublicProfileResponse>(`/users/${userId}`, { method: 'GET', signal: options?.signal }),

  /** POST /api/users/:userId/like — 403 if I have no photo, 400 if already liked. */
  like: (userId: number): Promise<LikeResult> =>
    request<LikeResult>(`/users/${userId}/like`, { method: 'POST' }),

  /** DELETE /api/users/:userId/like — breaks any connection (mutual like). */
  unlike: (userId: number): Promise<UnlikeResult> =>
    request<UnlikeResult>(`/users/${userId}/like`, { method: 'DELETE' }),

  /** POST /api/users/:userId/block — also removes likes in both directions. */
  block: (userId: number): Promise<BlockResult> =>
    request<BlockResult>(`/users/${userId}/block`, { method: 'POST' }),

  /** DELETE /api/users/:userId/block — unblock; removed likes are not restored. */
  unblock: (userId: number): Promise<UnblockResult> =>
    request<UnblockResult>(`/users/${userId}/block`, { method: 'DELETE' }),

  /** POST /api/users/:userId/report — body { reason }, 3-500 chars enforced backend-side. */
  report: (userId: number, reason: string): Promise<ReportResult> =>
    request<ReportResult>(`/users/${userId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
