import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * Creates an in-memory rate limiter middleware in plain TypeScript.
 * Keyed by client IP, automatically cleans up expired keys to prevent memory leaks.
 */
export const createRateLimiter = (options: RateLimiterOptions) => {
  const { windowMs, max, message = 'Too many requests from this IP. Please try again later.' } = options;
  const store = new Map<string, RateLimitRecord>();

  // Periodically sweep expired records every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(ip);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    const record = store.get(ip);

    if (!record || now > record.resetTime) {
      // First request or window expired
      store.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(AppError.tooManyRequests(message));
    }

    record.count += 1;
    next();
  };
};

// Rate limiter for user registration (10 requests per 15 minutes)
export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts from this IP. Please try again in 15 minutes.',
});

// Rate limiter for user login (10 requests per 15 minutes)
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes to prevent brute force.',
});

// Rate limiter for forgot password requests (5 requests per 15 minutes)
export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
});

// Rate limiter for resend verification email requests (5 requests per 15 minutes)
export const resendVerificationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many verification email requests. Please wait 15 minutes before trying again.',
});
