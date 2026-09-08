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
 * Universal JSON fetch helper with credentials: 'include' for httpOnly cookie auth.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    credentials: 'include', // Ensures httpOnly JWT cookies are sent and received
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
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Unable to connect to Matcha server. Please check your internet connection or try again.');
    }
    throw error;
  }
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    request<User>('/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyEmail: (token: string) =>
    request<User>(`/verify/${encodeURIComponent(token)}`, {
      method: 'GET',
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
