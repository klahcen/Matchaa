-- Root schema for Docker initialization (docker-entrypoint-initdb.d)
-- Matches backend/migrations/001_init.sql + backend/migrations/002_profile.sql
-- Safe to re-run: every statement is idempotent.

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

    -- Profile fields
    gender VARCHAR(20) DEFAULT NULL,
    sexual_preferences VARCHAR(20) DEFAULT 'bisexual',
    biography TEXT DEFAULT NULL,
    fame_rating INT NOT NULL DEFAULT 0,
    birthdate DATE DEFAULT NULL,

    -- Location: precise GPS coords (nullable, only set when the user consented
    -- to GPS) plus a required human-readable approximate neighborhood/city.
    latitude DOUBLE PRECISION DEFAULT NULL,
    longitude DOUBLE PRECISION DEFAULT NULL,
    location_text VARCHAR(255) DEFAULT NULL,

    last_connection TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users (verification_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);

-- Reusable interest tags, shared across all users (never duplicated per user).
-- Names are stored lowercase-normalized so "Vegan" and "vegan" are one tag.
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

-- Many-to-many join between users and shared tags.
CREATE TABLE IF NOT EXISTS user_tags (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_tag_id ON user_tags (tag_id);

-- Up to 5 photos per user; exactly one may be flagged as the profile picture.
CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    is_profile_picture BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos (user_id, created_at);

-- Partial unique index: at most one profile picture per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_photos_profile_picture
    ON photos (user_id) WHERE is_profile_picture = TRUE;

-- Profile views: a visit HISTORY log — one row per visit, not per pair.
-- Repeat visits by the same viewer are expected and preserved.
CREATE TABLE IF NOT EXISTS views (
    id SERIAL PRIMARY KEY,
    viewer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_views_viewed_id ON views (viewed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_views_viewer_id ON views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_views_viewer_viewed ON views (viewer_id, viewed_id);

-- Likes: who liked whom.
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    liker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (liker_id, liked_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_liked_id ON likes (liked_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_liker_id ON likes (liker_id);

-- Blocks: directed "I do not want to see / be seen by this user".
-- Suggestions exclude both directions.
CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (blocker_id, blocked_id),
    CONSTRAINT blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks (blocked_id);

-- Reports: "fake account" flags filed by one user against another.
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reporter_id, reported_id),
    CONSTRAINT reports_no_self_report CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports (reporter_id);

-- Messages: real-time chat between connected (mutually liked) users.
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (receiver_id, read_at) WHERE read_at IS NULL;

-- Notifications: real-time alerts for likes, views, messages, connections, unlikes.
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    related_user_id INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, is_read) WHERE is_read = FALSE;
