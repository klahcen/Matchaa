-- Migration: 009_notification_mutes.sql
-- Description: "Remove a previously given like. This will prevent further
-- notifications from that user". When user_id unlikes muted_user_id a row is
-- written here, and liking them again deletes it. Notification creation skips
-- any notification whose recipient has muted its actor.
--
-- Idempotent: `make migrate` re-applies every migration on each run.

CREATE TABLE IF NOT EXISTS notification_mutes (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    muted_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, muted_user_id),
    CONSTRAINT notification_mutes_no_self_mute CHECK (user_id <> muted_user_id)
);

-- Dedupe lookup: "did this actor already send this recipient this type recently".
CREATE INDEX IF NOT EXISTS idx_notifications_dedupe
    ON notifications (user_id, related_user_id, type, created_at DESC);
