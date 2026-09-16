-- Migration: 001_init.sql
-- Description: Create users table with authentication, verification, reset tokens, and profile placeholders

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_gender') THEN
    CREATE TYPE user_gender AS ENUM ('male', 'female');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_sexual_preference') THEN
    CREATE TYPE user_sexual_preference AS ENUM ('male', 'female');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(255) DEFAULT NULL,
    verification_token_expires_at TIMESTAMPTZ DEFAULT NULL,
    reset_token VARCHAR(255) DEFAULT NULL,
    reset_token_expires_at TIMESTAMPTZ DEFAULT NULL,
    
    -- Basic profile fields as placeholders for upcoming Matcha features
    gender user_gender NOT NULL DEFAULT 'male',
    sexual_preferences user_sexual_preference NOT NULL DEFAULT 'female',
    biography TEXT DEFAULT NULL,
    fame_rating INT NOT NULL DEFAULT 0,
    birthdate DATE DEFAULT NULL,
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    
    last_connection TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);
