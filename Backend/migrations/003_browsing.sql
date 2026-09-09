-- Migration: 003_browsing.sql
-- Description: Browsing/Suggestions feature.
--   - creates `blocks` (the only structure Browsing needs that did not exist)
--
-- Note on existing columns: `users.birthdate` already existed in 001_init.sql,
-- and the location columns are named `latitude` / `longitude` (not
-- location_lat / location_lng), with the orientation column named
-- `sexual_preferences`. Browsing reuses those as-is; nothing here alters them.

CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- One row per directed block; re-blocking is idempotent via ON CONFLICT.
    UNIQUE (blocker_id, blocked_id),

    -- A user cannot block themselves.
    CONSTRAINT blocks_no_self_block CHECK (blocker_id <> blocked_id)
);

-- Suggestion queries probe both directions:
--   "did this candidate block me?"  -> looked up by (blocked_id, blocker_id)
--   "did I block this candidate?"   -> covered by the UNIQUE index above
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks (blocked_id);
