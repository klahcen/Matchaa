import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import {
  ForgotPasswordDTO,
  JwtPayload,
  LoginDTO,
  RegisterDTO,
  ResetPasswordDTO,
  SafeUser,
  User,
} from '../types';

const BCRYPT_SALT_ROUNDS = 10;

// Cache of common passwords loaded from wordlist file
let commonPasswordsCache: Set<string> | null = null;

/**
 * Loads the common passwords list into a Set in memory.
 * Reads backend/data/common-passwords.txt.
 */
export const loadCommonPasswords = (): Set<string> => {
  if (commonPasswordsCache) {
    return commonPasswordsCache;
  }

  const wordlistPath = path.resolve(env.DATA_DIR, 'common-passwords.txt');
  try {
    if (fs.existsSync(wordlistPath)) {
      const fileContent = fs.readFileSync(wordlistPath, 'utf-8');
      const lines = fileContent
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0);
      commonPasswordsCache = new Set(lines);
      console.log(`[AuthService] Loaded ${commonPasswordsCache.size} dictionary passwords from ${wordlistPath}`);
    } else {
      console.warn(`[AuthService] Warning: Wordlist file not found at ${wordlistPath}. Using default list.`);
      commonPasswordsCache = new Set(['123456', 'password', '12345678', 'qwerty', '123456789', 'admin', 'welcome']);
    }
  } catch (err: any) {
    console.error('[AuthService] Error reading common-passwords.txt:', err.message);
    commonPasswordsCache = new Set(['123456', 'password', '12345678', 'qwerty', '123456789', 'admin', 'welcome']);
  }

  return commonPasswordsCache;
};

/**
 * Manual Email Validator (Plain TypeScript/Regex, NO external validation library)
 */
export const validateEmail = (email: unknown): string => {
  if (typeof email !== 'string' || !email.trim()) {
    throw AppError.badRequest('Email is required');
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 255) {
    throw AppError.badRequest('Email must not exceed 255 characters');
  }

  // RFC 5322 standard compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    throw AppError.badRequest('Please provide a valid email address');
  }

  return trimmed;
};

/**
 * Manual Username Validator (Plain TypeScript, NO external validation library)
 */
export const validateUsername = (username: unknown): string => {
  if (typeof username !== 'string' || !username.trim()) {
    throw AppError.badRequest('Username is required');
  }

  const trimmed = username.trim();

  if (trimmed.length < 3 || trimmed.length > 30) {
    throw AppError.badRequest('Username must be between 3 and 30 characters');
  }

  // Alphanumeric with underscores and hyphens
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(trimmed)) {
    throw AppError.badRequest('Username can only contain letters, numbers, underscores, and hyphens');
  }

  return trimmed;
};

/**
 * Manual Name Validator (Plain TypeScript, NO external validation library)
 */
export const validateName = (name: unknown, fieldName: 'First name' | 'Last name'): string => {
  if (typeof name !== 'string' || !name.trim()) {
    throw AppError.badRequest(`${fieldName} is required`);
  }

  const trimmed = name.trim();

  if (trimmed.length < 1 || trimmed.length > 50) {
    throw AppError.badRequest(`${fieldName} must be between 1 and 50 characters`);
  }

  // Letters, accents, spaces, and hyphens
  const nameRegex = /^[a-zA-Z\u00C0-\u017F\s'-]+$/;
  if (!nameRegex.test(trimmed)) {
    throw AppError.badRequest(`${fieldName} can only contain letters, spaces, and hyphens`);
  }

  return trimmed;
};

/**
 * Manual Password Strength & Dictionary Wordlist Validator
 * Enforces strong password rules and checks against common-passwords.txt.
 */
export const validatePassword = (password: unknown): string => {
  if (typeof password !== 'string' || !password) {
    throw AppError.badRequest('Password is required');
  }

  if (password.length < 8) {
    throw AppError.badRequest('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    throw AppError.badRequest('Password must not exceed 128 characters');
  }

  const errors: string[] = [];

  if (!/[A-Z]/.test(password)) {
    errors.push('at least one uppercase letter (A-Z)');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('at least one lowercase letter (a-z)');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('at least one digit (0-9)');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('at least one special character (e.g. !@#$%^&*()_+-=[]{};\':"|,.<>/?)');
  }

  if (errors.length > 0) {
    throw AppError.badRequest(`Password must include: ${errors.join(', ')}`);
  }

  // Dictionary check against data/common-passwords.txt
  const commonPasswords = loadCommonPasswords();
  const normalized = password.toLowerCase().trim();

  if (commonPasswords.has(normalized)) {
    throw AppError.badRequest('Password is too common and easily guessable. Please choose a stronger password.');
  }

  return password;
};

/**
 * Manual Registration DTO Validator
 * Supports camelCase (firstName, lastName) and snake_case (first_name, last_name).
 */
export const validateRegistrationDTO = (body: any): RegisterDTO => {
  if (!body || typeof body !== 'object') {
    throw AppError.badRequest('Request body must be a valid JSON object');
  }

  const email = validateEmail(body.email);
  const username = validateUsername(body.username);
  const firstName = validateName(body.firstName ?? body.first_name, 'First name');
  const lastName = validateName(body.lastName ?? body.last_name, 'Last name');
  const password = validatePassword(body.password);

  return { email, username, firstName, lastName, password };
};

/**
 * Manual Login DTO Validator
 */
export const validateLoginDTO = (body: any): LoginDTO => {
  if (!body || typeof body !== 'object') {
    throw AppError.badRequest('Request body must be a valid JSON object');
  }

  if (typeof body.username !== 'string' || !body.username.trim()) {
    throw AppError.badRequest('Username is required');
  }

  if (typeof body.password !== 'string' || !body.password) {
    throw AppError.badRequest('Password is required');
  }

  return {
    username: body.username.trim(),
    password: body.password,
  };
};

/**
 * Manual Forgot Password DTO Validator
 */
export const validateForgotPasswordDTO = (body: any): ForgotPasswordDTO => {
  if (!body || typeof body !== 'object') {
    throw AppError.badRequest('Request body must be a valid JSON object');
  }

  const email = validateEmail(body.email);
  return { email };
};

/**
 * Manual Reset Password DTO Validator
 */
export const validateResetPasswordDTO = (body: any): ResetPasswordDTO => {
  if (!body || typeof body !== 'object') {
    throw AppError.badRequest('Request body must be a valid JSON object');
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    throw AppError.badRequest('Reset token is required');
  }

  const password = validatePassword(body.password ?? body.newPassword);

  return { token, password };
};

/**
 * Hashes a plaintext password using bcrypt.
 * Never stores plaintext passwords.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
};

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Generates a cryptographically secure random token (64 hex characters)
 * for email verification and password resets.
 */
export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generates a signed JWT authentication token for a user.
 */
export const generateAuthToken = (payload: { userId: number; username: string; email: string }): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
};

/**
 * Verifies and decodes a signed JWT authentication token.
 */
export const verifyAuthToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Authentication token has expired. Please log in again.');
    }
    throw AppError.unauthorized('Invalid authentication token.');
  }
};

/**
 * Sanitizes a User model by removing sensitive authentication fields.
 */
export const toSafeUser = (user: User): SafeUser => {
  const {
    password_hash,
    verification_token,
    verification_token_expires_at,
    reset_token,
    reset_token_expires_at,
    ...safe
  } = user;
  return safe;
};
