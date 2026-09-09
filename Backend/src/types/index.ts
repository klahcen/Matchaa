import { Request } from 'express';

export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  is_verified: boolean;
  verification_token: string | null;
  verification_token_expires_at: Date | null;
  reset_token: string | null;
  reset_token_expires_at: Date | null;

  // Placeholder fields for future Matcha features
  gender?: string | null;
  sexual_preferences?: string | null;
  biography?: string | null;
  fame_rating?: number;
  birthdate?: Date | null;
  latitude?: number | null;
  longitude?: number | null;
  location_text?: string | null;

  last_connection: Date;
  created_at: Date;
  updated_at: Date;
}

export type SafeUser = Omit<
  User,
  | 'password_hash'
  | 'verification_token'
  | 'verification_token_expires_at'
  | 'reset_token'
  | 'reset_token_expires_at'
>;

export interface RegisterDTO {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface LoginDTO {
  username: string;
  password: string;
}

export interface ForgotPasswordDTO {
  email: string;
}

export interface ResetPasswordDTO {
  token: string;
  password: string;
}

export interface JwtPayload {
  userId: number;
  username: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
}
