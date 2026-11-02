-- PBM Rule Readiness Check: D1 schema
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,      -- 1 = opted in to results email and Nautilus updates
  profile TEXT,                            -- JSON of intake answers (no names, no plan data)
  source TEXT,                             -- origin of the page (github.io, nautilushealth.org, contractxray.com)
  embed TEXT,                              -- parent page URL when embedded, if known
  ip_hash TEXT,                            -- salted hash, for abuse limits only
  pack_version TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_ip ON leads(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  profile TEXT,
  questions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

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
