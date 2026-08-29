-- ============================================================
-- PostgreSQL 版建表（与 migrations/0001_init.sql 等价）
-- 差异说明：
--   INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
--   datetime('now') 默认值 → to_char(now() AT TIME ZONE 'UTC', ...)（同为 UTC 文本时间戳）
--   列类型保持 TEXT/INTEGER（业务代码按文本读取，两侧行为一致）
-- ============================================================

-- ========== 校区 ==========
CREATE TABLE campuses (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  phone      TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  deleted_at TEXT                       -- 软删除
);

-- ========== 用户（所有登录账号） ==========
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  campus_id     INTEGER,                 -- super_admin 为 NULL（跨校区）
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,    -- 登录账号
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('super_admin','campus_admin','teacher','parent','student')),
  status        TEXT NOT NULL DEFAULT 'active',   -- active | disabled
  created_at    TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  deleted_at    TEXT
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_campus ON users(campus_id);

-- ========== 教师档案 ==========
CREATE TABLE teacher_profiles (
  user_id   INTEGER PRIMARY KEY,         -- 指向 users.id
  campus_id INTEGER NOT NULL,            -- 冗余存储，便于过滤
  subject   TEXT,                        -- 主教学科
  bio       TEXT,
  sort_no   INTEGER NOT NULL DEFAULT 0   -- 总览页排序
);
CREATE INDEX idx_teacher_campus ON teacher_profiles(campus_id);

-- ========== 教师可用时间（按周几循环规则） ==========
CREATE TABLE availability_rules (
  id         SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL,           -- 指向 users.id
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=周一 … 6=周日
  start_time TEXT NOT NULL,              -- 'HH:MM'
  end_time   TEXT NOT NULL,              -- 'HH:MM'
  kind       TEXT NOT NULL DEFAULT 'available'  -- available 可上课 | unavailable 不可上课（如休息日）
);
CREATE INDEX idx_avail_teacher ON availability_rules(teacher_id, weekday);

-- ========== 教室 ==========
CREATE TABLE rooms (
  id         SERIAL PRIMARY KEY,
  campus_id INTEGER NOT NULL,
  name       TEXT NOT NULL,              -- 如 '美术教室A'
  capacity   INTEGER
);
CREATE INDEX idx_rooms_campus ON rooms(campus_id);

-- ========== 课程科目 ==========
CREATE TABLE courses (
  id                   SERIAL PRIMARY KEY,
  campus_id            INTEGER,           -- NULL = 全校区通用
  name                 TEXT NOT NULL,     -- 如 少儿美术
  default_duration_min INTEGER NOT NULL DEFAULT 90,
  color                TEXT               -- 日历色块颜色 '#7c9a6e' 等
);

-- ========== 班级 ==========
CREATE TABLE classes (
  id              SERIAL PRIMARY KEY,
  campus_id       INTEGER NOT NULL,
  course_id       INTEGER NOT NULL,
  name            TEXT NOT NULL,          -- 如 周六美术基础A班
  head_teacher_id INTEGER,                -- 主班老师（可空，课以 lesson 为准）
  capacity        INTEGER NOT NULL DEFAULT 12,
  status          TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at      TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_classes_campus ON classes(campus_id);
CREATE INDEX idx_classes_course ON classes(course_id);

-- ========== 学员 ==========
CREATE TABLE students (
  id         SERIAL PRIMARY KEY,
  campus_id  INTEGER NOT NULL,
  user_id    INTEGER,                     -- 有登录账号时指向 users.id（可空）
  name       TEXT NOT NULL,
  grade      TEXT,                        -- 如 三年级
  birth_date TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  deleted_at TEXT
);
CREATE INDEX idx_students_campus ON students(campus_id);

-- ========== 家长 ==========
CREATE TABLE parents (
  id         SERIAL PRIMARY KEY,
  campus_id INTEGER NOT NULL,
  user_id    INTEGER,                     -- 登录账号（可空）
  name       TEXT NOT NULL,
  relation   TEXT,                         -- 父亲/母亲/其他
  deleted_at TEXT
);

-- ========== 家长-学员关联（多对多） ==========
CREATE TABLE parent_student (
  parent_id  INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY (parent_id, student_id)
);
CREATE INDEX idx_ps_student ON parent_student(student_id);

-- ========== 报班 ==========
CREATE TABLE enrollments (
  id          SERIAL PRIMARY KEY,
  class_id    INTEGER NOT NULL,
  student_id  INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',   -- active | paused | ended
  enrolled_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (class_id, student_id)
);
CREATE INDEX idx_enr_student ON enrollments(student_id);

-- ========== 课时卡（总量-已用-台账 模型核心表） ==========
CREATE TABLE hour_cards (
  id            SERIAL PRIMARY KEY,
  campus_id     INTEGER NOT NULL,
  student_id    INTEGER NOT NULL,
  course_id     INTEGER NOT NULL,        -- 该卡限定的科目（用于扣课匹配）
  title         TEXT,                    -- 如 '90分钟课 x 20节'
  total_lessons INTEGER NOT NULL,        -- 总课时（按节计）
  used_lessons  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | exhausted | refunded | expired
  valid_until   TEXT,                    -- 过期日期（可空）
  created_at    TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_cards_student ON hour_cards(student_id, status);

-- ========== 课时台账（每笔变动必有记录，账实一致的生命线） ==========
CREATE TABLE hour_ledger (
  id            SERIAL PRIMARY KEY,
  card_id       INTEGER NOT NULL,
  student_id    INTEGER NOT NULL,
  change        INTEGER NOT NULL,         -- +N 购课/回退，-N 扣课
  balance_after INTEGER NOT NULL,         -- 剩余课时 = total - 已扣累计
  reason        TEXT NOT NULL,           -- purchase | attendance | cancel_refund | adjust
  ref_lesson_id INTEGER,                  -- attendance/cancel_refund 关联 lessons.id
  operator_id   INTEGER,                  -- 操作人 users.id
  created_at    TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_ledger_card ON hour_ledger(card_id);

-- ========== 课（排课核心表：一节具体的课） ==========
CREATE TABLE lessons (
  id         SERIAL PRIMARY KEY,
  campus_id  INTEGER NOT NULL,
  class_id   INTEGER NOT NULL,           -- 一对一课程 = 单学员班级（统一走班级）
  teacher_id INTEGER NOT NULL,           -- 指向 users.id
  room_id    INTEGER,                     -- 可空 = 不指定教室
  date       TEXT NOT NULL,              -- 'YYYY-MM-DD'
  start_time TEXT NOT NULL,              -- 'HH:MM'
  end_time   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | done | cancelled
  note       TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE INDEX idx_lessons_date ON lessons(campus_id, date);
CREATE INDEX idx_lessons_teacher ON lessons(teacher_id, date);
CREATE INDEX idx_lessons_class ON lessons(class_id);

-- ========== 点名记录 ==========
CREATE TABLE lesson_attendance (
  id           SERIAL PRIMARY KEY,
  lesson_id    INTEGER NOT NULL,
  student_id   INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | present | absent | leave
  hour_card_id INTEGER,                          -- 扣的卡
  deducted     INTEGER NOT NULL DEFAULT 0,       -- 1=已扣课
  checked_at   TEXT,
  UNIQUE (lesson_id, student_id)
);
CREATE INDEX idx_att_student ON lesson_attendance(student_id);
