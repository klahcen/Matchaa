import dotenv from 'dotenv';
import path from 'path';

// Load .env file from project root or backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const env = {
  PORT: Number(process.env.PORT || process.env.APP_PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database settings
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '132456789',
  DB_NAME: process.env.DB_NAME || 'matcha_db',

  // JWT settings
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_matcha_jwt_key_2026_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Resend API settings
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || 'onboarding@resend.dev',

  // Pexels API — SEED SCRIPT ONLY (scripts/seedFakeProfiles.ts).
  // Never used by the running app; real users upload their own photos.
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',

  // Application public URL for email links
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  // Paths
  DATA_DIR: path.resolve(__dirname, '../../data'),
  UPLOAD_DIR: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(__dirname, '../../uploads'),
} as const;
