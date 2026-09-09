-- Migration: 002_profile.sql
-- Description: User Profile feature.
--   - adds users.location_text (GPS consent fallback / readable neighborhood)
--   - creates tags, user_tags, photos, views, likes
-- All statements are idempotent so this can be re-run safely.

-- ---------------------------------------------------------------------------
-- users: location_text
-- ---------------------------------------------------------------------------
-- Precise lat/lng already exist (latitude, longitude) and stay NULL unless the
-- user explicitly consented to GPS. location_text is the always-present,
-- human-readable approximate location (reverse-geocoded or manually entered).
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_text VARCHAR(255) DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- tags + user_tags
-- ---------------------------------------------------------------------------
-- Reusable, shared interest tags. Names are lowercase-normalized by the app
-- layer before insert, so "Vegan" and "vegan" collapse to a single row via
-- the UNIQUE constraint.
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

CREATE TABLE IF NOT EXISTS user_tags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_tag_id ON user_tags (tag_id);

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    is_profile_picture BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos (user_id, created_at);

-- Enforces "exactly one profile picture" at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photos_profile_picture
    ON photos (user_id) WHERE is_profile_picture = TRUE;

-- ---------------------------------------------------------------------------
-- views
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS views (
    id SERIAL PRIMARY KEY,
    viewer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (viewer_id, viewed_id)
);

CREATE INDEX IF NOT EXISTS idx_views_viewed_id ON views (viewed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_viewer_id ON views (viewer_id);

-- ---------------------------------------------------------------------------
-- likes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    liker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (liker_id, liked_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_liked_id ON likes (liked_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_liker_id ON likes (liker_id);
