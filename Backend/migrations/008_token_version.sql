-- JWT revocation: every auth token carries the user's token_version ("tv" claim).
-- Logout and password reset increment it, which invalidates all previously issued tokens.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
