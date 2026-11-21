-- Answer ratings (helpful / not helpful). The Worker also creates this table on first use.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(session_id, turn)
);
