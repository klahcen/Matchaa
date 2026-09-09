import type {
  ApiResponse,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  User,
} from '../types/auth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/auth';

/**
 * Hard ceiling on any single API call. Without this, a backend that accepts the
 * TCP connection but never replies (hung DB query, half-dead dev server) leaves
 * fetch pending forever and the UI spins indefinitely.
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Universal JSON fetch helper with credentials: 'include' for httpOnly cookie auth.
 *
 * Every call is bounded by REQUEST_TIMEOUT_MS. A caller-supplied `signal` is
 * honoured too (used by VerifyEmailPage to cancel in-flight work on cleanup);
 * the two are combined so whichever fires first wins.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const { signal: callerSignal, ...restOptions } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', forwardCallerAbort, { once: true });
    }
  }

  const config: RequestInit = {
    ...restOptions,
    credentials: 'include', // Ensures httpOnly JWT cookies are sent and received
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    let data: any;

    try {
      data = await response.json();
    } catch {
      data = {
        success: response.ok,
        message: response.ok
          ? 'Operation successful'
          : `Server returned ${response.status}: ${response.statusText}`,
      };
    }

    if (!response.ok) {
      const errorMessage =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.join(', ') : null) ||
        `Request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  } catch (error: any) {
    // A deliberate caller-initiated cancellation (component unmounted, StrictMode
    // cleanup, token change). Re-throw untouched so callers can ignore it
    // instead of flashing a bogus error at the user.
    if (callerSignal?.aborted && !timedOut) {
      throw error;
    }

    if (timedOut) {
      throw new Error(
        `Matcha server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please check that the backend is running and try again.`
      );
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Unable to connect to Matcha server. Please check your internet connection or try again.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<User>('/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /**
   * Accepts an optional AbortSignal so the caller can cancel an in-flight
   * verification (StrictMode remount, navigation away, token change).
   */
  verifyEmail: (token: string, options?: { signal?: AbortSignal }) =>
    request<User>(`/verify/${encodeURIComponent(token)}`, {
      method: 'GET',
      signal: options?.signal,
    }),

  resendVerification: (email: string) =>
    request('/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  login: (payload: LoginPayload) =>
    request<User>('/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request('/logout', {
      method: 'POST',
    }),

  forgotPassword: (payload: ForgotPasswordPayload) =>
    request('/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetPassword: (token: string, payload: ResetPasswordPayload) =>
    request(`/reset-password/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () =>
    request<User>('/me', {
      method: 'GET',
    }),
};
