-- ============================================================
-- PostgreSQL 版 0002（与 migrations/0002_student_status_followups_lesson_content.sql 等价）
--   AUTOINCREMENT → SERIAL；datetime('now') → to_char(...)
-- 执行方式：通过 exec_sql RPC 通道按语句逐条执行
-- ============================================================

-- ========== 1. 学员状态 ==========
ALTER TABLE students ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- ========== 2. 咨询师跟进记录 ==========
CREATE TABLE followups (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL,
  follower_id  INTEGER NOT NULL,
  contact_time TEXT NOT NULL,
  content      TEXT NOT NULL,
  next_time    TEXT,
  created_at   TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_followups_student ON followups(student_id);

-- ========== 3. 课堂图片 ==========
CREATE TABLE lesson_files (
  id          SERIAL PRIMARY KEY,
  lesson_id   INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        TEXT NOT NULL,
  uploaded_by INTEGER,
  created_at  TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_files_lesson ON lesson_files(lesson_id);

-- ========== 4. 课堂留言 ==========
CREATE TABLE lesson_comments (
  id         SERIAL PRIMARY KEY,
  lesson_id  INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_comments_lesson ON lesson_comments(lesson_id);
