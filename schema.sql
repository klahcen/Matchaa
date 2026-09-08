-- Root schema for Docker initialization
-- Matches backend/migrations/001_init.sql

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
    gender VARCHAR(20) DEFAULT NULL,
    sexual_preferences VARCHAR(20) DEFAULT 'bisexual',
    biography TEXT DEFAULT NULL,
    fame_rating INT NOT NULL DEFAULT 0,
    birthdate DATE DEFAULT NULL,
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    
    last_connection TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);
