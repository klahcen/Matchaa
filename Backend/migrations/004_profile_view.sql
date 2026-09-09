-- Migration: 004_profile_view.sql
-- Description: Profile View feature.
--   - creates `reports` (did not exist)
--   - converts `views` from "one row per pair" into a true visit history log
--
-- Note on column naming: the users table has `last_connection` (from
-- 001_init.sql), NOT `last_seen`. Profile View reads `last_connection`; no
-- rename is performed here so existing Profile/Browsing code keeps working.

-- ---------------------------------------------------------------------------
-- views -> visit history log
-- ---------------------------------------------------------------------------
-- The UNIQUE (viewer_id, viewed_id) constraint added in 002_profile.sql made
-- "insert a new row on every visit" impossible, so recordView() had to upsert.
-- The subject requires a history log, so the constraint is dropped and replaced
-- with a plain index that still serves the "has this viewer seen this target"
-- lookup used for fame-rating bookkeeping.
ALTER TABLE views DROP CONSTRAINT IF EXISTS views_viewer_id_viewed_id_key;

CREATE INDEX IF NOT EXISTS idx_views_viewer_viewed ON views (viewer_id, viewed_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    reporter_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- One report per reporter/reported pair. Re-reporting is rejected with a
    -- clear message rather than piling up duplicate rows against a user.
    UNIQUE (reporter_id, reported_id),

    -- A user cannot report themselves.
    CONSTRAINT reports_no_self_report CHECK (reporter_id <> reported_id)
);

-- Moderation lookups: everything filed against a given user, newest first.
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports (reporter_id);
