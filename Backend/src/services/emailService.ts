import { Resend } from 'resend';
import { env } from '../config/env';

// Lazy Resend client initialization
let resendClient: Resend | null = null;

const getResendClient = (): Resend => {
  const apiKey = process.env.RESEND_API_KEY || env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured. Please set RESEND_API_KEY in your .env file.');
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
};

const getSenderAddress = (): string => {
  return process.env.MAIL_FROM || env.MAIL_FROM || 'onboarding@resend.dev';
};

/**
 * Sends an email verification link to a newly registered user.
 * Supports both sendVerificationEmail(to, token) and sendVerificationEmail(to, username, token).
 */
export const sendVerificationEmail = async (
  to: string,
  usernameOrToken: string,
  token?: string
): Promise<void> => {
  const username = token !== undefined ? usernameOrToken : 'there';
  const actualToken = token !== undefined ? token : usernameOrToken;
  const verificationUrl = `${env.CLIENT_URL}/verify/${actualToken}`;
  const from = getSenderAddress();

  const text = `Hello ${username},\n\nWelcome to Matcha! Please verify your email address by visiting the link below (valid for 24 hours):\n\n${verificationUrl}\n\nIf you did not register for Matcha, you can safely ignore this email.\n\nBest regards,\nThe Matcha Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #e11d48; text-align: center;">Welcome to Matcha!</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>Thank you for signing up. Please verify your email address to activate your account:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #e11d48; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify My Email</a>
      </div>
      <p style="color: #64748b; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 13px; color: #3b82f6;">${verificationUrl}</p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
        This link will expire in 24 hours. If you did not create an account, please ignore this email.
      </p>
    </div>
  `;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: 'Matcha - Verify your email address',
      text,
      html,
    });

    if (error) {
      console.error(`[EmailService] Resend API error sending verification email to ${to}:`, error);
      if (env.NODE_ENV === 'development') {
        console.log(`[EmailService DEV LINK] Verification link for ${to}: ${verificationUrl}`);
      }
      throw new Error(`Failed to send verification email via Resend: ${error.message}`);
    }

    console.log(`[EmailService] Verification email successfully sent to ${to} (ID: ${data?.id})`);
  } catch (err: any) {
    if (env.NODE_ENV === 'development') {
      console.log(`[EmailService DEV LINK] Verification link for ${to}: ${verificationUrl}`);
    }
    console.error(`[EmailService] Error in sendVerificationEmail for ${to}:`, err);
    throw err;
  }
};

/**
 * Sends a password reset link with a unique expiring token.
 * Supports both sendResetPasswordEmail(to, token) and sendResetPasswordEmail(to, username, token).
 */
export const sendResetPasswordEmail = async (
  to: string,
  usernameOrToken: string,
  token?: string
): Promise<void> => {
  const username = token !== undefined ? usernameOrToken : 'there';
  const actualToken = token !== undefined ? token : usernameOrToken;
  const resetUrl = `${env.CLIENT_URL}/reset-password/${actualToken}`;
  const from = getSenderAddress();

  const text = `Hello ${username},\n\nWe received a request to reset your Matcha password. Use the link below to set a new password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nThe Matcha Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #e11d48; text-align: center;">Reset Your Matcha Password</h2>
      <p>Hello <strong>${username}</strong>,</p>
      <p>You recently requested to reset your password for your Matcha account. Click the button below to reset it:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #e11d48; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #64748b; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 13px; color: #3b82f6;">${resetUrl}</p>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
        This link will expire in 1 hour. If you did not request a password reset, no further action is required.
      </p>
    </div>
  `;

  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: 'Matcha - Password Reset Request',
      text,
      html,
    });

    if (error) {
      console.error(`[EmailService] Resend API error sending password reset email to ${to}:`, error);
      if (env.NODE_ENV === 'development') {
        console.log(`[EmailService DEV LINK] Password reset link for ${to}: ${resetUrl}`);
      }
      throw new Error(`Failed to send password reset email via Resend: ${error.message}`);
    }

    console.log(`[EmailService] Password reset email successfully sent to ${to} (ID: ${data?.id})`);
  } catch (err: any) {
    if (env.NODE_ENV === 'development') {
      console.log(`[EmailService DEV LINK] Password reset link for ${to}: ${resetUrl}`);
    }
    console.error(`[EmailService] Error in sendResetPasswordEmail for ${to}:`, err);
    throw err;
  }
};

// Backward-compatible alias for existing imports in authController
export const sendPasswordResetEmail = sendResetPasswordEmail;
