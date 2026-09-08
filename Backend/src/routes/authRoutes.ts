import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware';
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  resendVerificationRateLimiter,
} from '../middleware/rateLimiter';

const router = Router();

// Registration with rate limiting
router.post('/register', registerRateLimiter, AuthController.register);

// Resend verification email with rate limiting
router.post('/resend-verification', resendVerificationRateLimiter, AuthController.resendVerification);

// Email verification (supports query parameter ?token=..., /verify-email/:token, or /verify/:token)
router.get('/verify-email', AuthController.verifyEmail);
router.get('/verify-email/:token', AuthController.verifyEmail);
router.get('/verify/:token', AuthController.verifyEmail);

// User login with rate limiting
router.post('/login', loginRateLimiter, AuthController.login);

// Forgot password request with rate limiting
router.post('/forgot-password', forgotPasswordRateLimiter, AuthController.forgotPassword);

// Reset password execution (supports token in body or param)
router.post('/reset-password', AuthController.resetPassword);
router.post('/reset-password/:token', AuthController.resetPassword);

// Logout (clears httpOnly cookie)
router.post('/logout', AuthController.logout);

// Check current session (returns user if logged in, null if guest, without 401 console error)
router.get('/me', optionalAuth, AuthController.me);

export const authRoutes = router;
