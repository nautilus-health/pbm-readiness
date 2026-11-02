-- PBM Rule Readiness Check: D1 schema
-- Leads (emails) live in the Google Sheet. D1 holds only what the Worker needs to run.

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile TEXT,                            -- JSON of intake answers (no names, no plan data)
  ip_hash TEXT,                            -- salted hash, for abuse limits only
  questions INTEGER NOT NULL DEFAULT 0,
  has_email INTEGER NOT NULL DEFAULT 0,    -- 1 once a report was requested (unlocks more questions)
  emails_sent INTEGER NOT NULL DEFAULT 0,
  last_email_at INTEGER,
  transcript TEXT,                         -- JSON [{q, a}], used to build the report
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ip_hash TEXT,
  pack_version TEXT,
  model TEXT,
  question TEXT,                           -- stored only while LOG_QUESTIONS = "true" (eval period)
  ms INTEGER,
  input_tokens INTEGER,
  cache_read_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asks_ip ON asks(ip_hash, created_at);

-- Only used when the Google Sheet can't be reached. Re-send, then delete.
CREATE TABLE IF NOT EXISTS failed_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
