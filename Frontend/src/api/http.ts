/**
 * Shared pieces of the API clients.
 *
 * Every module in src/api keeps its own small fetch wrapper (timeouts, envelope
 * unwrapping), but they all build their failures through `toApiError` so that:
 *  - the HTTP status, machine-readable `code` and `missing` list survive (the
 *    browse/search/map pages need them for the PROFILE_INCOMPLETE gate);
 *  - an authenticated request answered with 401 announces it once, through a
 *    window event that AuthContext listens to (clear session, go to /login).
 */

export const UNAUTHORIZED_EVENT = 'matcha:unauthorized';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly missing?: string[];

  constructor(message: string, status: number, code?: string, missing?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.missing = missing;
  }
}

/** Tells the app the session is gone. AuthContext clears the user and redirects. */
export const notifyUnauthorized = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
};

/** Extracts the server's message from a { success, message, errors } body. */
export const errorMessageFrom = (body: any, status: number): string =>
  (typeof body?.message === 'string' && body.message) ||
  (Array.isArray(body?.errors) && body.errors.length > 0 ? body.errors.join(', ') : null) ||
  `Request failed with status ${status}`;

/**
 * Builds the error for a non-2xx response. Pass `authenticated: false` for the
 * public auth endpoints (login, register, verify, forgot/reset, the /auth/me
 * probe), where a 401 is an expected answer rather than an expired session.
 */
export const toApiError = (
  response: Response,
  body: any,
  options: { authenticated?: boolean } = {}
): ApiError => {
  const { authenticated = true } = options;
  if (authenticated && response.status === 401) notifyUnauthorized();

  return new ApiError(
    errorMessageFrom(body, response.status),
    response.status,
    typeof body?.code === 'string' ? body.code : undefined,
    Array.isArray(body?.missing)
      ? body.missing.filter((item: unknown): item is string => typeof item === 'string')
      : undefined
  );
};

/**
 * Returns the list of missing profile items when `error` is the backend's
 * PROFILE_INCOMPLETE gate (403), or null for any other failure.
 */
export const profileIncompleteMissing = (error: unknown): string[] | null => {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'PROFILE_INCOMPLETE') return null;
  return error.missing ?? [];
};
