PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('男','女','待补充')),
  major TEXT NOT NULL,
  student_id TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  school TEXT NOT NULL DEFAULT '厦门理工大学' CHECK (school IN ('厦门理工大学','华夏学院')),
  role TEXT NOT NULL DEFAULT '社员' CHECK (role IN ('负责人','社员')),
  tag TEXT NOT NULL DEFAULT '新手',
  status TEXT NOT NULL DEFAULT '在社',
  points INTEGER NOT NULL DEFAULT 0,
  elo INTEGER NOT NULL DEFAULT 1500,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('单败','双败')),
  team_mode TEXT NOT NULL CHECK (team_mode IN ('单打','双打')),
  best_of INTEGER NOT NULL CHECK (best_of > 0 AND best_of % 2 = 1),
  round_best_of TEXT NOT NULL DEFAULT '[]',
  handicap TEXT NOT NULL DEFAULT '不让球',
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  school_scope TEXT NOT NULL DEFAULT '厦门理工大学',
  winner_points INTEGER NOT NULL DEFAULT 3,
  loser_points INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT '待签到',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  team_name TEXT,
  seed INTEGER NOT NULL DEFAULT 0,
  checked_in INTEGER NOT NULL DEFAULT 1,
  eliminated INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, member_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  bracket TEXT NOT NULL DEFAULT '胜者组',
  round_no INTEGER NOT NULL,
  match_no INTEGER NOT NULL,
  best_of INTEGER NOT NULL DEFAULT 3,
  player1_id TEXT REFERENCES members(id),
  player2_id TEXT REFERENCES members(id),
  player1_score INTEGER,
  player2_score INTEGER,
  winner_id TEXT REFERENCES members(id),
  referee_id TEXT REFERENCES members(id),
  table_no TEXT,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT '待开始',
  next_match_id TEXT,
  next_slot INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, bracket, round_no, match_no)
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  challenger_id TEXT NOT NULL REFERENCES members(id),
  opponent_id TEXT NOT NULL REFERENCES members(id),
  game TEXT NOT NULL,
  best_of INTEGER NOT NULL,
  handicap TEXT NOT NULL DEFAULT '不让球',
  played_at TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  winner_points INTEGER NOT NULL DEFAULT 3,
  loser_points INTEGER NOT NULL DEFAULT 1,
  challenger_score INTEGER,
  opponent_score INTEGER,
  winner_id TEXT REFERENCES members(id),
  challenger_confirmed INTEGER NOT NULL DEFAULT 0,
  opponent_confirmed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待对手接受',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS score_ledger (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  points_delta INTEGER NOT NULL,
  elo_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '系统',
  reversed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS undo_snapshots (
  log_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_members_active ON members(deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_members_school ON members(school, deleted_at, status);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id, round_no, match_no);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_member ON score_ledger(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_created ON audit_logs(created_at);
