import { NextFunction, Response } from 'express';
import { findUserById } from '../db/queries/userQueries';
import { toSafeUser, verifyAuthToken } from '../services/authService';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

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
    let token: string | undefined = req.cookies?.token;

    // Optional header fallback
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw AppError.unauthorized('Authentication required. Please log in.');
    }

    // Verify token validity and expiration
    const payload = verifyAuthToken(token);

    // Fetch user from database
    const user = await findUserById(payload.userId);
    if (!user) {
      throw AppError.unauthorized('User account belonging to this token no longer exists.');
    }

    // Check email verification status
    if (!user.is_verified) {
      throw AppError.forbidden('Please verify your email address before accessing this resource.');
    }

    // Attach sanitized user to request
    req.user = toSafeUser(user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware for session checking (/me).
 * If a valid cookie/token is present, attaches req.user.
 * If no token is provided or token is invalid, continues cleanly with req.user = null.
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined = req.cookies?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      req.user = undefined;
      return next();
    }

    try {
      const payload = verifyAuthToken(token);
      const user = await findUserById(payload.userId);
      if (user && user.is_verified) {
        req.user = toSafeUser(user);
      } else {
        req.user = undefined;
      }
    } catch {
      req.user = undefined;
    }

    next();
  } catch (error) {
    next(error);
  }
};
