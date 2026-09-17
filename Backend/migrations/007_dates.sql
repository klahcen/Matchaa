-- Bonus: real-life date/event proposals between connected users.
CREATE TABLE IF NOT EXISTS dates (
    id SERIAL PRIMARY KEY,
    proposer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposed_datetime TIMESTAMPTZ NOT NULL,
    location_text VARCHAR(255),
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (proposer_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_dates_proposer_recipient ON dates (proposer_id, recipient_id, proposed_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_dates_recipient_status ON dates (recipient_id, status, proposed_datetime DESC);
