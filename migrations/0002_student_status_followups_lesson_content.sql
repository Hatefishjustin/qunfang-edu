-- ============================================================
-- 0002_student_status_followups_lesson_content.sql
-- 需求批次 2（2026-08-29）：
--   1. 学员状态：在读 active / 待开发 prospect
--   2. 咨询师（排课老师）跟进记录
--   3. 课堂内容：图片（lesson_files）+ 师生留言（lesson_comments）
-- ============================================================

-- ========== 1. 学员状态 ==========
ALTER TABLE students ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- ========== 2. 咨询师跟进记录 ==========
CREATE TABLE followups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL,
  follower_id  INTEGER NOT NULL,            -- 跟进人 users.id（campus_admin / super_admin）
  contact_time TEXT NOT NULL,               -- 联系时间 'YYYY-MM-DD HH:MM'
  content      TEXT NOT NULL,               -- 联系内容
  next_time    TEXT,                        -- 下次跟进 'YYYY-MM-DD'（可空）
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_followups_student ON followups(student_id);

-- ========== 3. 课堂图片（base64 存库，MVP 规模适用） ==========
CREATE TABLE lesson_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id   INTEGER NOT NULL,
  mime        TEXT NOT NULL,                -- image/jpeg 等
  size        INTEGER NOT NULL,             -- 原始字节
  data        TEXT NOT NULL,                -- base64（前端已压缩，单张 ≤ 400KB）
  uploaded_by INTEGER,                       -- users.id
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_files_lesson ON lesson_files(lesson_id);

-- ========== 4. 课堂留言（师生交流） ==========
CREATE TABLE lesson_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id  INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  role       TEXT NOT NULL,                 -- teacher / parent / student / campus_admin / super_admin
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_lesson ON lesson_comments(lesson_id);
