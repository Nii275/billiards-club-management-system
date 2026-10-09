CREATE TABLE IF NOT EXISTS undo_snapshots (
  log_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
