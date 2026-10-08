-- Migration: 010_passes.sql
-- Description: Swipe mode on the Browse page. Swiping left records a "pass"
-- so that profile is not dealt again; swiping right is an ordinary like.
-- Passes are private: they never notify anyone and only affect the swiper's
-- own swipe deck. The user can clear them to start over.
--
-- Idempotent: `make migrate` re-applies every migration on each run.

CREATE TABLE IF NOT EXISTS passes (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    passed_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, passed_user_id),
    CONSTRAINT passes_no_self_pass CHECK (user_id <> passed_user_id)
);
