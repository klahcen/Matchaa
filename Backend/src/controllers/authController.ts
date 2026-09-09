import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import {
  createUser,
  findConflictingUser,
  findUserByEmail,
  findUserByResetToken,
  findUserByUsername,
  findUserByVerificationToken,
  setResetPasswordToken,
  updateLastConnection,
  updateUserPassword,
  updateVerificationToken,
  verifyUserEmail,
} from '../db/queries/userQueries';
import {
  comparePassword,
  generateAuthToken,
  generateSecureToken,
  hashPassword,
  toSafeUser,
  validateEmail,
  validateForgotPasswordDTO,
  validateLoginDTO,
  validateRegistrationDTO,
  validateResetPasswordDTO,
} from '../services/authService';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/emailService';
import { AuthenticatedRequest } from '../types';
import { AppError } from '../utils/AppError';

const COOKIE_NAME = 'token';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export class AuthController {
  /**
   * POST /api/auth/register
   * Registers a new unverified user and sends an email verification link.
   */
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateRegistrationDTO(req.body);

      // Check for existing email or username conflict
      const { emailTaken, usernameTaken } = await findConflictingUser(dto.email, dto.username);
      if (emailTaken) {
        throw AppError.conflict('An account with this email address already exists');
      }
      if (usernameTaken) {
        throw AppError.conflict('This username is already taken');
      }

      // Hash password using bcrypt
      const passwordHash = await hashPassword(dto.password);

      // Generate verification token (expiring in 24 hours)
      const verificationToken = generateSecureToken();
      const verificationTokenExpiresAt = new Date(Date.now() + ONE_DAY_MS);

      // Save user to database
      const newUser = await createUser({
        email: dto.email,
        username: dto.username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        verificationToken,
        verificationTokenExpiresAt,
      });

      // Send verification email asynchronously without failing registration on delivery error
      try {
        await sendVerificationEmail(newUser.email, newUser.username, verificationToken);
      } catch (emailError: any) {
        console.error(`[AuthController] Failed to send verification email to ${newUser.email}:`, emailError.message || emailError);
      }

      res.status(201).json({
        success: true,
        message: 'Registration successful! Please check your email to verify your account.',
        user: toSafeUser(newUser),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/verify-email
   * GET /api/auth/verify-email/:token
   * Verifies the user's email using the expiring token.
   */
  static async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query.token as string) || (req.params.token as string);

      if (!token || typeof token !== 'string' || !token.trim()) {
        throw AppError.badRequest('Verification token is required');
      }

      // If requested directly in browser (e.g. clicking email link in browser without frontend router), redirect to frontend
      if (req.headers.accept?.includes('text/html') && !req.xhr) {
        res.redirect(`${env.CLIENT_URL}/verify/${encodeURIComponent(token.trim())}`);
        return;
      }

      const user = await findUserByVerificationToken(token.trim());
      if (!user) {
        throw AppError.badRequest('Invalid or expired verification token');
      }

      if (user.is_verified) {
        res.status(200).json({
          success: true,
          message: 'Your email is already verified. You can log in.',
          user: toSafeUser(user),
        });
        return;
      }

      if (user.verification_token_expires_at && new Date() > new Date(user.verification_token_expires_at)) {
        throw AppError.badRequest('Verification token has expired. Please request a new verification email.');
      }

      const verifiedUser = await verifyUserEmail(user.id);

      res.status(200).json({
        success: true,
        message: 'Email verified successfully! You can now log in.',
        user: toSafeUser(verifiedUser),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/resend-verification
   * Resends a verification email for an existing unverified user.
   */
  static async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = validateEmail(req.body?.email);

      const user = await findUserByEmail(email);

      if (user && !user.is_verified) {
        // Generate a fresh 24-hour verification token
        const verificationToken = generateSecureToken();
        const verificationTokenExpiresAt = new Date(Date.now() + ONE_DAY_MS);

        await updateVerificationToken(user.id, verificationToken, verificationTokenExpiresAt);

        try {
          await sendVerificationEmail(user.email, user.username, verificationToken);
        } catch (emailError: any) {
          console.error(`[AuthController] Failed to resend verification email to ${user.email}:`, emailError.message || emailError);
        }
      }

      // Return consistent message to prevent user enumeration
      res.status(200).json({
        success: true,
        message: 'If an unverified account exists with that email, a verification link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates user, checks email verification, and sets httpOnly auth cookie.
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateLoginDTO(req.body);

      // Find user by username
      const user = await findUserByUsername(dto.username);
      if (!user) {
        // Generic error message to prevent username enumeration
        throw AppError.unauthorized('Invalid username or password');
      }

      // Check password with bcrypt
      const isPasswordValid = await comparePassword(dto.password, user.password_hash);
      if (!isPasswordValid) {
        throw AppError.unauthorized('Invalid username or password');
      }

      // Ensure account is verified
      if (!user.is_verified) {
        throw AppError.forbidden('Your account is not verified yet. Please check your email to activate it.');
      }

      // Update last connection timestamp
      await updateLastConnection(user.id);

      // Generate JWT auth token
      const token = generateAuthToken({
        userId: user.id,
        username: user.username,
        email: user.email,
      });

      // Set httpOnly cookie
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: ONE_DAY_MS,
      });

      res.status(200).json({
        success: true,
        message: 'Logged in successfully',
        user: toSafeUser(user),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Sends a password reset link to the email.
   * Never reveals whether the email exists in the system (anti-enumeration).
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateForgotPasswordDTO(req.body);

      const user = await findUserByEmail(dto.email);
      if (user) {
        const resetToken = generateSecureToken();
        const resetTokenExpiresAt = new Date(Date.now() + ONE_HOUR_MS);

        await setResetPasswordToken(user.id, resetToken, resetTokenExpiresAt);

        try {
          await sendPasswordResetEmail(user.email, user.username, resetToken);
        } catch (emailError: any) {
          console.error(`[AuthController] Failed to send password reset email to ${user.email}:`, emailError.message || emailError);
        }
      }

      // Always return identical response to prevent user enumeration
      res.status(200).json({
        success: true,
        message: 'If that email is registered, a password reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/reset-password
   * Validates reset token and sets a new password (re-running dictionary & strength checks).
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = validateResetPasswordDTO({
        token: req.params.token || req.body.token,
        password: req.body.password ?? req.body.newPassword,
      });

      const user = await findUserByResetToken(dto.token);
      if (!user) {
        throw AppError.badRequest('Invalid or expired password reset token');
      }

      if (user.reset_token_expires_at && new Date() > new Date(user.reset_token_expires_at)) {
        throw AppError.badRequest('Password reset token has expired. Please request a new one.');
      }

      const passwordHash = await hashPassword(dto.password);
      await updateUserPassword(user.id, passwordHash);

      res.status(200).json({
        success: true,
        message: 'Password reset successful. You can now log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Clears the authentication httpOnly cookie.
   */
  static async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  /**
   * GET /api/auth/me
   * Returns current authenticated user profile.
   */
  static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  }
}
