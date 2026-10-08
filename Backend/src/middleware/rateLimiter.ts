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

interface FailedAttemptLimiterOptions extends RateLimiterOptions {
  // Bucket a request belongs to (e.g. IP, or IP + username)
  key: (req: Request) => string;
  // Response status that counts as a failed attempt; any other outcome is free
  failureStatus: number;
}

const clientIp = (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown-ip';

/**
 * Creates an in-memory store of rate limit records.
 * Expired records are swept every 5 minutes to prevent memory leaks.
 */
const createStore = (): Map<string, RateLimitRecord> => {
  const store = new Map<string, RateLimitRecord>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return store;
};

/**
 * Returns the live record for a key, starting a fresh window when none exists or it expired.
 */
const currentRecord = (store: Map<string, RateLimitRecord>, key: string, windowMs: number): RateLimitRecord => {
  const now = Date.now();
  let record = store.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    store.set(key, record);
  }
  return record;
};

const rejectTooManyRequests = (res: Response, next: NextFunction, record: RateLimitRecord, message: string): void => {
  const retryAfterSeconds = Math.ceil((record.resetTime - Date.now()) / 1000);
  res.setHeader('Retry-After', retryAfterSeconds);
  next(AppError.tooManyRequests(message));
};

/**
 * Creates an in-memory rate limiter middleware in plain TypeScript.
 * Keyed by client IP; every request counts toward the limit.
 */
export const createRateLimiter = (options: RateLimiterOptions) => {
  const { windowMs, max, message = 'Too many requests from this IP. Please try again later.' } = options;
  const store = createStore();

  return (req: Request, res: Response, next: NextFunction): void => {
    const record = currentRecord(store, clientIp(req), windowMs);

    if (record.count >= max) {
      return rejectTooManyRequests(res, next, record, message);
    }

    record.count += 1;
    next();
  };
};

/**
 * Creates a limiter that only counts FAILED attempts (responses with failureStatus).
 * Each request reserves a slot up front, so a burst of parallel guesses cannot slip past
 * the cap before any of them finishes; the slot is given back when the request did not fail.
 */
export const createFailedAttemptLimiter = (options: FailedAttemptLimiterOptions) => {
  const { windowMs, max, key, failureStatus, message = 'Too many failed attempts. Please try again later.' } = options;
  const store = createStore();

  return (req: Request, res: Response, next: NextFunction): void => {
    const record = currentRecord(store, key(req), windowMs);

    if (record.count >= max) {
      return rejectTooManyRequests(res, next, record, message);
    }

    record.count += 1;
    res.on('finish', () => {
      if (res.statusCode !== failureStatus && record.count > 0) {
        record.count -= 1;
      }
    });
    next();
  };
};

// Rate limiter for user registration (30 requests per 15 minutes per IP)
export const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many registration attempts from this IP. Please try again in 15 minutes.',
});

// Login brute-force protection: only failed logins (401) count, successful ones are free.
// Up to 10 failures per IP + username, and 50 failures per IP across all usernames.
const loginUsernameKey = (req: Request): string => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  return `${clientIp(req)}|${username.slice(0, 64)}`;
};

const loginAccountRateLimiter = createFailedAttemptLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: loginUsernameKey,
  failureStatus: 401,
  message: 'Too many failed login attempts for this account. Please try again in 15 minutes.',
});

const loginIpRateLimiter = createFailedAttemptLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  key: clientIp,
  failureStatus: 401,
  message: 'Too many failed login attempts from this IP. Please try again in 15 minutes.',
});

export const loginRateLimiter = [loginAccountRateLimiter, loginIpRateLimiter];

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
