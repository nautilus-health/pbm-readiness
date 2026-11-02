-- Adds anonymous sessions with a stored transcript and report sends.
ALTER TABLE sessions ADD COLUMN has_email INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN emails_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN last_email_at INTEGER;
ALTER TABLE sessions ADD COLUMN transcript TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_email_at ON sessions(ip_hash, last_email_at);
