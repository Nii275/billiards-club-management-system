ALTER TABLE members ADD COLUMN school TEXT NOT NULL DEFAULT '厦门理工大学';
ALTER TABLE tournaments ADD COLUMN school_scope TEXT NOT NULL DEFAULT '厦门理工大学';
ALTER TABLE tournaments ADD COLUMN winner_points INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tournaments ADD COLUMN loser_points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE challenges ADD COLUMN winner_points INTEGER NOT NULL DEFAULT 3;
ALTER TABLE challenges ADD COLUMN loser_points INTEGER NOT NULL DEFAULT 1;
ALTER TABLE score_ledger ADD COLUMN operator_name TEXT NOT NULL DEFAULT '系统';

UPDATE members SET school='厦门理工大学' WHERE school IS NULL OR school='';
INSERT OR IGNORE INTO app_settings(key,value,updated_at)
VALUES('school_mode','厦门理工大学模式',CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_members_school ON members(school,deleted_at,status);
