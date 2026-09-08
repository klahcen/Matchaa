export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_verified?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  user?: User;
  data?: T;
  errors?: string[];
}

export interface RegisterPayload {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  password: string;
}
