-- Keep the verified address active until the proposed replacement is verified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255) DEFAULT NULL;
