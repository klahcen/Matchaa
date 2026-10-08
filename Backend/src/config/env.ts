import dotenv from 'dotenv';
import path from 'path';

// Load Backend/.env, the current directory's .env, then the repository root .env (the one
// Docker Compose reads). dotenv never overrides a variable that is already set, so earlier wins.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Secrets have no fallback: they must come from a local, untracked .env file.
const REQUIRED_VARS = ['JWT_SECRET', 'DB_PASSWORD'] as const;
const missingVars = REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
if (missingVars.length > 0) {
  console.error(
    `[Env] Missing required environment variable(s): ${missingVars.join(', ')}. ` +
    'Set them in your local .env file (see README) and restart the server.'
  );
  process.exit(1);
}

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Parses CORS_ORIGIN (comma-separated) into an explicit allow-list.
 * '*' is rejected: combined with credentials it would let any site use the session cookie.
 */
const parseCorsOrigins = (raw: string | undefined): string[] => {
  const entries = (raw || CLIENT_URL)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const origins = entries.filter((origin) => origin !== '*');
  if (origins.length !== entries.length) {
    console.warn(`[Env] CORS_ORIGIN='*' is not allowed with credentials and was ignored.`);
  }
  if (origins.length === 0) {
    console.warn(`[Env] No usable CORS_ORIGIN configured; falling back to CLIENT_URL (${CLIENT_URL}).`);
    return [CLIENT_URL];
  }
  return origins;
};

export const env = {
  PORT: Number(process.env.PORT || process.env.APP_PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Explicit proxy IPs/CIDRs only. Empty means direct clients cannot supply their own IP.
  TRUSTED_PROXIES: (process.env.TRUSTED_PROXIES || '').split(',').map((ip) => ip.trim()).filter(Boolean),

  // Database settings
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD as string,
  DB_NAME: process.env.DB_NAME || 'matcha_db',

  // JWT settings
  JWT_SECRET: process.env.JWT_SECRET as string,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Resend API settings
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || 'onboarding@resend.dev',

  // Pexels API — SEED SCRIPT ONLY (scripts/seedFakeProfiles.ts).
  // Never used by the running app; real users upload their own photos.
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',

  // Application public URL for email links
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  CLIENT_URL,

  // CORS allowed origins, from CORS_ORIGIN (comma-separated, defaults to CLIENT_URL).
  // Shared by Express and Socket.IO so both accept exactly the same origins.
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGIN),

  // Paths
  DATA_DIR: path.resolve(__dirname, '../../data'),
  UPLOAD_DIR: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(__dirname, '../../uploads'),
} as const;
