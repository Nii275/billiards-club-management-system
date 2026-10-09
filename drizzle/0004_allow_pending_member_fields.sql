PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

CREATE TABLE members_pending_fields (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('男','女','待补充')),
  major TEXT NOT NULL,
  student_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '社员' CHECK (role IN ('负责人','社员')),
  tag TEXT NOT NULL DEFAULT '新手',
  status TEXT NOT NULL DEFAULT '在社' CHECK (status IN ('在社','暂停活动','退社','毕业')),
  points INTEGER NOT NULL DEFAULT 0,
  elo INTEGER NOT NULL DEFAULT 1500,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  school TEXT NOT NULL DEFAULT '厦门理工大学' CHECK (school IN ('厦门理工大学','华夏学院'))
);

INSERT INTO members_pending_fields
SELECT id,name,gender,major,student_id,phone,role,tag,status,points,elo,wins,losses,deleted_at,created_at,updated_at,school
FROM members;

DROP TABLE members;
ALTER TABLE members_pending_fields RENAME TO members;
CREATE UNIQUE INDEX members_student_id_unique ON members(student_id);

COMMIT;

PRAGMA foreign_keys=ON;
