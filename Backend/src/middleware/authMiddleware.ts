import { NextFunction, Response } from 'express';
import { findUserById } from '../db/queries/userQueries';
import { AuthTokenPayload, toSafeUser, verifyAuthToken } from '../services/authService';
import { AuthenticatedRequest, SafeUser } from '../types';
import { AppError } from '../utils/AppError';

/**
 * Full JWT session check, shared by the HTTP middlewares and the Socket.IO handshake.
 * Verifies signature and expiry, loads the user, requires a verified account and a
 * token_version matching the user's current one (logout and password reset bump it).
 * Returns the sanitized user, or null when the token is not valid. Database errors propagate.
 */
export const authenticateToken = async (token: string): Promise<SafeUser | null> => {
  let payload: AuthTokenPayload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return null;
  }

  // Tokens issued before token_version existed carry no "tv" claim and are rejected.
  if (typeof payload.userId !== 'number' || typeof payload.tv !== 'number') {
    return null;
  }

  const user = await findUserById(payload.userId);
  if (!user || !user.is_verified) {
    return null;
  }

  const currentVersion = user.token_version ?? 0;
  if (payload.tv !== currentVersion) {
    return null;
  }

  return toSafeUser(user);
};

/**
 * Reads the JWT from the httpOnly cookie ('token'), falling back to 'Authorization: Bearer <token>'.
 */
const extractToken = (req: AuthenticatedRequest): string | undefined => {
  const cookieToken = req.cookies?.token;
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken;
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || undefined;
  }

  return undefined;
};

/**
 * Authentication middleware for protected endpoints (for current /me and future features).
 * Inspects httpOnly cookie ('token') and fallback 'Authorization: Bearer <token>' header.
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw AppError.unauthorized('Authentication required. Please log in.');
    }

    const user = await authenticateToken(token);
    if (!user) {
      throw AppError.unauthorized('Your session has expired or is no longer valid. Please log in again.');
    }

    // Attach sanitized user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware for session checking (/me, /logout).
 * If a valid cookie/token is present, attaches req.user.
 * If no token is provided or token is invalid, continues cleanly with req.user = undefined.
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    req.user = token ? (await authenticateToken(token)) ?? undefined : undefined;
    next();
  } catch (error) {
    next(error);
  }
};
