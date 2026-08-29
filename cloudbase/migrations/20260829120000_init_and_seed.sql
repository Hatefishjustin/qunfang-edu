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

-- ========== 种子数据 ==========
-- ============================================================
-- PostgreSQL 版种子数据（与 seed/seed.sql 等价，幂等可重放）
-- 方言差异：
--   INSERT OR IGNORE      → INSERT ... ON CONFLICT DO NOTHING
--   date('now','localtime',±N day) → to_char((now() AT TIME ZONE 'Asia/Shanghai') ± interval, 'YYYY-MM-DD')
--   datetime('now')       → to_char(now() AT TIME ZONE 'UTC', ...)（UTC 文本时间戳）
--   strftime('%w', ...)   → extract(dow from ...)（两者周日=0，语义一致）
--   末尾追加 setval 校准 SERIAL 序列（显式插 id 后序列不会自动前进）
-- ============================================================

-- ========== 校区 ==========
INSERT INTO campuses (id, name, address, phone) VALUES
  (901, '阳光广场校区', '阳光广场路 88 号 3 层', '0571-88880001'),
  (902, '滨江校区', '滨江大道 199 号 2 层', '0571-88880002')
ON CONFLICT DO NOTHING;

-- ========== 用户（登录账号） ==========
INSERT INTO users (id, campus_id, name, phone, password_hash, role, status) VALUES
  (1, NULL, '超级管理员', '13800000001', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'super_admin', 'active'),
  (9021, 901, '阳光广场管理员', '13800000002', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'campus_admin', 'active'),
  (9022, 902, '滨江管理员',     '13800000003', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'campus_admin', 'active'),
  (9031, 901, '张雨薇', '13800000011', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9032, 901, '李文轩', '13811100002', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9033, 901, '王建国', '13811100003', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9034, 901, '刘诗琪', '13811100004', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9035, 901, '陈志强', '13811100005', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9036, 901, '杨海燕', '13811100006', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9037, 901, '赵明辉', '13811100007', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9038, 901, '黄雅琴', '13811100008', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9041, 902, '周天宇', '13800000012', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9042, 902, '吴静怡', '13822200002', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9043, 902, '郑海涛', '13822200003', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9044, 902, '冯梦洁', '13822200004', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9045, 902, '蒋文博', '13822200005', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9046, 902, '沈丽娜', '13822200006', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9047, 902, '韩志明', '13822200007', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9048, 902, '唐雪梅', '13822200008', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'teacher', 'active'),
  (9051, 901, '王芳',   '13800000021', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9052, 901, '李强',   '13833300002', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9053, 901, '张敏',   '13833300003', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9054, 901, '刘军',   '13833300004', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9055, 901, '陈静',   '13833300005', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9056, 901, '杨帆',   '13833300006', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9057, 901, '赵丽',   '13833300007', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9058, 901, '黄伟',   '13833300008', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9059, 901, '周涛',   '13833300009', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9060, 901, '吴秀英', '13833300010', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9061, 901, '郑海燕', '13833300011', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9062, 901, '冯刚',   '13833300012', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9063, 901, '蒋丽华', '13833300013', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9064, 901, '沈国栋', '13833300014', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9065, 901, '韩梅',   '13833300015', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9066, 902, '周红',   '13844400001', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9067, 902, '吴勇',   '13844400002', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9068, 902, '郑丽',   '13844400003', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9069, 902, '冯敏',   '13844400004', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9070, 902, '蒋涛',   '13844400005', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9071, 902, '沈静',   '13844400006', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9072, 902, '韩磊',   '13844400007', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9073, 902, '唐娟',   '13844400008', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9074, 902, '曹阳',   '13844400009', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9075, 902, '许敏',   '13844400010', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9076, 902, '邓超',   '13844400011', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9077, 902, '袁莉',   '13844400012', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9078, 902, '于刚',   '13844400013', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9079, 902, '董洁',   '13844400014', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9080, 902, '苏峰',   '13844400015', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'parent', 'active'),
  (9091, 901, '王一诺', '13855500001', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'student', 'active'),
  (9092, 902, '林亦辰', '13800000031', 'pbkdf2$100000$EwsXpGycSHPcqNtnV4vS3w==$5sBNRgYdTjfOHAdNvXLocvxwdzFzvKosqEpNOQ9RBEs=', 'student', 'active')
ON CONFLICT DO NOTHING;

-- ========== 教师档案 ==========
INSERT INTO teacher_profiles (user_id, campus_id, subject, bio, sort_no) VALUES
  (9031, 901, '少儿美术', '美院毕业，擅长创意美术启蒙', 1),
  (9032, 901, '硬笔书法', '省市书协会员，教学耐心细致', 2),
  (9033, 901, '素描',     '十年素描教学经验', 3),
  (9034, 901, '中国舞',   '北舞考级认证教师', 4),
  (9035, 901, '少儿美术', '水彩与综合材料课程', 5),
  (9036, 901, '少儿美术', '儿童画与线描课程', 6),
  (9037, 901, '硬笔书法', '规范字书写矫正', 7),
  (9038, 901, '中国舞',   '幼儿舞蹈启蒙', 8),
  (9041, 902, '少儿美术', '美院毕业，擅长创意美术启蒙', 1),
  (9042, 902, '硬笔书法', '省市书协会员，教学耐心细致', 2),
  (9043, 902, '素描',     '十年素描教学经验', 3),
  (9044, 902, '中国舞',   '北舞考级认证教师', 4),
  (9045, 902, '少儿美术', '水彩与综合材料课程', 5),
  (9046, 902, '少儿美术', '儿童画与线描课程', 6),
  (9047, 902, '硬笔书法', '规范字书写矫正', 7),
  (9048, 902, '中国舞',   '幼儿舞蹈启蒙', 8)
ON CONFLICT DO NOTHING;

-- ========== 教师可用时间 ==========
INSERT INTO availability_rules (id, teacher_id, weekday, start_time, end_time, kind)
SELECT u.id * 10 + v.column1, u.id, v.column2, v.column3, v.column4, v.column5
FROM (VALUES
  (1, 0, '09:00', '20:30', 'available'),
  (2, 1, '09:00', '20:30', 'available'),
  (3, 2, '09:00', '20:30', 'available'),
  (4, 3, '09:00', '20:30', 'available'),
  (5, 4, '09:00', '20:30', 'available'),
  (6, 5, '12:00', '18:00', 'unavailable'),
  (7, 6, '00:00', '23:59', 'unavailable')
) v, users u
WHERE u.id BETWEEN 9031 AND 9048 AND u.role = 'teacher'
ON CONFLICT DO NOTHING;

-- ========== 教室 ==========
INSERT INTO rooms (id, campus_id, name, capacity) VALUES
  (9101, 901, '美术教室A', 16),
  (9102, 901, '书法教室', 12),
  (9103, 901, '多功能教室', 20),
  (9104, 902, '美术教室B', 16),
  (9105, 902, '书法教室', 12),
  (9106, 902, '舞蹈房', 20)
ON CONFLICT DO NOTHING;

-- ========== 课程科目 ==========
INSERT INTO courses (id, campus_id, name, default_duration_min, color) VALUES
  (9111, 901, '少儿美术', 90, '#7c9a6e'),
  (9112, 901, '硬笔书法', 90, '#b08968'),
  (9113, 901, '素描基础', 90, '#8e7cc3'),
  (9114, 901, '中国舞',   90, '#d4a373'),
  (9115, 902, '少儿美术', 90, '#7c9a6e'),
  (9116, 902, '硬笔书法', 90, '#b08968'),
  (9117, 902, '素描基础', 90, '#8e7cc3'),
  (9118, 902, '中国舞',   90, '#d4a373')
ON CONFLICT DO NOTHING;

-- ========== 班级 ==========
INSERT INTO classes (id, campus_id, course_id, name, head_teacher_id, capacity, status) VALUES
  (9121, 901, 9111, '美术基础A班', 9031, 8, 'active'),
  (9122, 901, 9111, '美术基础B班', 9036, 8, 'active'),
  (9123, 901, 9112, '书法入门A班', 9032, 8, 'active'),
  (9124, 901, 9112, '书法入门B班', 9037, 8, 'active'),
  (9125, 901, 9113, '素描初级班',  9033, 6, 'active'),
  (9126, 901, 9114, '中国舞启蒙班', 9034, 6, 'active'),
  (9131, 902, 9115, '美术基础A班', 9041, 8, 'active'),
  (9132, 902, 9115, '美术基础B班', 9046, 8, 'active'),
  (9133, 902, 9116, '书法入门A班', 9042, 8, 'active'),
  (9134, 902, 9116, '书法入门B班', 9047, 8, 'active'),
  (9135, 902, 9117, '素描初级班',  9043, 6, 'active'),
  (9136, 902, 9118, '中国舞启蒙班', 9044, 6, 'active')
ON CONFLICT DO NOTHING;

-- ========== 学员 ==========
INSERT INTO students (id, campus_id, user_id, name, grade, birth_date) VALUES
  (9201, 901, 9091, '王一诺', '一年级', '2019-03-12'),
  (9202, 901, NULL, '李思远', '二年级', '2018-05-20'),
  (9203, 901, NULL, '张梓萱', '三年级', '2017-09-01'),
  (9204, 901, NULL, '刘一鸣', '一年级', '2019-01-15'),
  (9205, 901, NULL, '陈雨桐', '四年级', '2016-11-08'),
  (9206, 901, NULL, '杨子睿', '二年级', '2018-07-30'),
  (9207, 901, NULL, '赵欣怡', '三年级', '2017-04-18'),
  (9208, 901, NULL, '黄浩然', '五年级', '2015-12-02'),
  (9209, 901, NULL, '周美琳', '二年级', '2018-02-14'),
  (9210, 901, NULL, '吴俊杰', '六年级', '2015-06-25'),
  (9211, 901, NULL, '郑晓彤', '三年级', '2017-08-09'),
  (9212, 901, NULL, '冯天佑', '一年级', '2019-10-06'),
  (9213, 901, NULL, '蒋文静', '四年级', '2016-05-17'),
  (9214, 901, NULL, '沈子涵', '二年级', '2018-09-23'),
  (9215, 901, NULL, '韩雨欣', '三年级', '2017-02-11'),
  (9216, 901, NULL, '唐子墨', '五年级', '2015-08-28'),
  (9217, 901, NULL, '曹诗涵', '四年级', '2016-03-05'),
  (9218, 901, NULL, '许浩宇', '六年级', '2015-04-19'),
  (9219, 901, NULL, '邓紫琪', '二年级', '2018-06-07'),
  (9220, 901, NULL, '袁明轩', '一年级', '2019-07-21'),
  (9231, 902, NULL, '林亦辰', '一年级', '2019-04-16'),
  (9232, 902, NULL, '高语嫣', '二年级', '2018-08-11'),
  (9233, 902, NULL, '罗一菲', '三年级', '2017-07-03'),
  (9234, 902, NULL, '梁俊熙', '一年级', '2019-02-27'),
  (9235, 902, NULL, '宋佳琪', '四年级', '2016-10-14'),
  (9236, 902, NULL, '谢雨泽', '二年级', '2018-01-09'),
  (9237, 902, NULL, '曾静怡', '三年级', '2017-11-22'),
  (9238, 902, NULL, '彭一诺', '五年级', '2015-09-30'),
  (9239, 902, NULL, '潘俊宇', '二年级', '2018-04-05'),
  (9240, 902, NULL, '卢思彤', '六年级', '2015-05-13'),
  (9241, 902, 9092, '谢雨萱', '三年级', '2017-03-26'),
  (9242, 902, NULL, '石佳豪', '一年级', '2019-06-18'),
  (9243, 902, NULL, '姚欣然', '四年级', '2016-12-08'),
  (9244, 902, NULL, '龚子涵', '二年级', '2018-03-02'),
  (9245, 902, NULL, '白诗雨', '三年级', '2017-10-19'),
  (9246, 902, NULL, '段博文', '五年级', '2015-11-27'),
  (9247, 902, NULL, '康梦琪', '四年级', '2016-07-15'),
  (9248, 902, NULL, '贺子涵', '六年级', '2015-03-08'),
  (9249, 902, NULL, '龙雨桐', '二年级', '2018-12-01'),
  (9250, 902, NULL, '贺晓东', '一年级', '2019-08-23')
ON CONFLICT DO NOTHING;

-- ========== 家长 ==========
INSERT INTO parents (id, campus_id, user_id, name, relation) VALUES
  (9301, 901, 9051, '王芳',   '母亲'),
  (9302, 901, 9052, '李强',   '父亲'),
  (9303, 901, 9053, '张敏',   '母亲'),
  (9304, 901, 9054, '刘军',   '父亲'),
  (9305, 901, 9055, '陈静',   '母亲'),
  (9306, 901, 9056, '杨帆',   '父亲'),
  (9307, 901, 9057, '赵丽',   '母亲'),
  (9308, 901, 9058, '黄伟',   '父亲'),
  (9309, 901, 9059, '周涛',   '父亲'),
  (9310, 901, 9060, '吴秀英', '母亲'),
  (9311, 901, 9061, '郑海燕', '母亲'),
  (9312, 901, 9062, '冯刚',   '父亲'),
  (9313, 901, 9063, '蒋丽华', '母亲'),
  (9314, 901, 9064, '沈国栋', '父亲'),
  (9315, 901, 9065, '韩梅',   '母亲'),
  (9321, 902, 9066, '周红',   '母亲'),
  (9322, 902, 9067, '吴勇',   '父亲'),
  (9323, 902, 9068, '郑丽',   '母亲'),
  (9324, 902, 9069, '冯敏',   '母亲'),
  (9325, 902, 9070, '蒋涛',   '父亲'),
  (9326, 902, 9071, '沈静',   '母亲'),
  (9327, 902, 9072, '韩磊',   '父亲'),
  (9328, 902, 9073, '唐娟',   '母亲'),
  (9329, 902, 9074, '曹阳',   '父亲'),
  (9330, 902, 9075, '许敏',   '母亲'),
  (9331, 902, 9076, '邓超',   '父亲'),
  (9332, 902, 9077, '袁莉',   '母亲'),
  (9333, 902, 9078, '于刚',   '父亲'),
  (9334, 902, 9079, '董洁',   '母亲'),
  (9335, 902, 9080, '苏峰',   '父亲')
ON CONFLICT DO NOTHING;

-- ========== 家长-学员关联 ==========
INSERT INTO parent_student (parent_id, student_id) VALUES
  (9301, 9201), (9301, 9210),
  (9302, 9202), (9303, 9203), (9304, 9204), (9305, 9205),
  (9306, 9206), (9306, 9207),
  (9307, 9208), (9308, 9209),
  (9309, 9211), (9309, 9212),
  (9310, 9213), (9311, 9214), (9312, 9215), (9313, 9216),
  (9314, 9217), (9314, 9218),
  (9315, 9219), (9315, 9220),
  (9321, 9231), (9321, 9240),
  (9322, 9232), (9323, 9233), (9324, 9234), (9325, 9235),
  (9326, 9236), (9326, 9237),
  (9327, 9238), (9328, 9239),
  (9329, 9241), (9329, 9242),
  (9330, 9243), (9331, 9244), (9332, 9245), (9333, 9246),
  (9334, 9247), (9334, 9248),
  (9335, 9249), (9335, 9250)
ON CONFLICT DO NOTHING;

-- ========== 报班 ==========
INSERT INTO enrollments (class_id, student_id) VALUES
  (9121, 9201), (9121, 9202), (9121, 9203), (9121, 9204), (9121, 9205),
  (9122, 9206), (9122, 9207), (9122, 9208), (9122, 9209),
  (9123, 9210), (9123, 9211), (9123, 9212), (9123, 9213),
  (9124, 9214), (9124, 9215), (9124, 9216),
  (9125, 9217), (9125, 9218),
  (9126, 9219), (9126, 9220),
  (9131, 9231), (9131, 9232), (9131, 9233), (9131, 9234), (9131, 9235),
  (9132, 9236), (9132, 9237), (9132, 9238), (9132, 9239),
  (9133, 9240), (9133, 9241), (9133, 9242), (9133, 9243),
  (9134, 9244), (9134, 9245), (9134, 9246),
  (9135, 9247), (9135, 9248),
  (9136, 9249), (9136, 9250)
ON CONFLICT DO NOTHING;

-- ========== 课时卡（每人 1 张 20 节，卡 id = 学员 id + 1000） ==========
INSERT INTO hour_cards (id, campus_id, student_id, course_id, title, total_lessons, used_lessons, status, valid_until)
SELECT s.id + 1000, s.campus_id, s.id, cl.course_id, '20 节课时包', 20, 0, 'active',
  to_char((now() AT TIME ZONE 'Asia/Shanghai') + interval '180 day', 'YYYY-MM-DD')
FROM students s
JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
JOIN classes cl ON cl.id = e.class_id
WHERE s.id BETWEEN 9201 AND 9250
ON CONFLICT DO NOTHING;

-- ========== 购课流水（每卡一条：+20 / 余额 20） ==========
INSERT INTO hour_ledger (id, card_id, student_id, change, balance_after, reason, operator_id, created_at)
SELECT h.id * 10, h.id, h.student_id, h.total_lessons, h.total_lessons, 'purchase', 1,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
FROM hour_cards h
WHERE h.id BETWEEN 10201 AND 10350
ON CONFLICT DO NOTHING;

-- ========== 已上完并点过名的课（过去 6 天内，status=done） ==========
INSERT INTO lessons (id, campus_id, class_id, teacher_id, room_id, date, start_time, end_time, status, created_by) VALUES
  (912001, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '1 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912002, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912003, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '3 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912004, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '4 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912005, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '5 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912006, 901, 9121, 9031, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '6 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (912007, 901, 9122, 9036, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (912008, 901, 9122, 9036, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '4 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (912009, 901, 9122, 9036, 9101, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '6 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (912010, 901, 9123, 9032, 9102, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '1 day', 'YYYY-MM-DD'), '14:00', '15:30', 'done', 1),
  (912011, 901, 9123, 9032, 9102, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '3 day', 'YYYY-MM-DD'), '14:00', '15:30', 'done', 1),
  (912012, 901, 9124, 9037, 9102, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '15:40', '17:10', 'done', 1),
  (912013, 901, 9125, 9033, 9103, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '5 day', 'YYYY-MM-DD'), '17:20', '18:50', 'done', 1)
ON CONFLICT DO NOTHING;

INSERT INTO lessons (id, campus_id, class_id, teacher_id, room_id, date, start_time, end_time, status, created_by) VALUES
  (913001, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '1 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913002, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913003, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '3 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913004, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '4 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913005, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '5 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913006, 902, 9131, 9041, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '6 day', 'YYYY-MM-DD'), '09:00', '10:30', 'done', 1),
  (913007, 902, 9132, 9046, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (913008, 902, 9132, 9046, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '4 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (913009, 902, 9132, 9046, 9104, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '6 day', 'YYYY-MM-DD'), '10:40', '12:10', 'done', 1),
  (913010, 902, 9133, 9042, 9105, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '1 day', 'YYYY-MM-DD'), '14:00', '15:30', 'done', 1),
  (913011, 902, 9133, 9042, 9105, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '3 day', 'YYYY-MM-DD'), '14:00', '15:30', 'done', 1),
  (913012, 902, 9134, 9047, 9105, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '2 day', 'YYYY-MM-DD'), '15:40', '17:10', 'done', 1),
  (913013, 902, 9135, 9043, 9106, to_char((now() AT TIME ZONE 'Asia/Shanghai') - interval '5 day', 'YYYY-MM-DD'), '17:20', '18:50', 'done', 1)
ON CONFLICT DO NOTHING;

-- ========== 点名记录（先全部记为到课） ==========
INSERT INTO lesson_attendance (lesson_id, student_id, status, hour_card_id, deducted, checked_at)
SELECT l.id, e.student_id, 'present', h.id, 1, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
FROM lessons l
JOIN enrollments e ON e.class_id = l.class_id AND e.status = 'active'
JOIN hour_cards h ON h.student_id = e.student_id
  AND h.course_id = (SELECT c.course_id FROM classes c WHERE c.id = l.class_id)
WHERE (l.id BETWEEN 912001 AND 912013) OR (l.id BETWEEN 913001 AND 913013)
ON CONFLICT DO NOTHING;

-- ========== 少量缺勤/请假（制造 0~6 的已用差异） ==========
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 912003 AND student_id = 9202;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 912003 AND student_id = 9203;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 912005 AND student_id = 9203;
UPDATE lesson_attendance SET status = 'leave',  hour_card_id = NULL, deducted = 0 WHERE lesson_id = 912008 AND student_id = 9207;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 912011 AND student_id = 9211;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913003 AND student_id = 9232;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913005 AND student_id = 9232;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913003 AND student_id = 9233;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913004 AND student_id = 9233;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913006 AND student_id = 9233;
UPDATE lesson_attendance SET status = 'leave',  hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913004 AND student_id = 9235;
UPDATE lesson_attendance SET status = 'leave',  hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913008 AND student_id = 9237;
UPDATE lesson_attendance SET status = 'absent', hour_card_id = NULL, deducted = 0 WHERE lesson_id = 913011 AND student_id = 9241;

-- ========== 扣课流水（每条到课 -1，余额按时间顺序递减） ==========
INSERT INTO hour_ledger (id, card_id, student_id, change, balance_after, reason, ref_lesson_id, operator_id, created_at)
SELECT h.id * 10 + ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY l.date, l.id),
       h.id, h.student_id, -1,
       h.total_lessons - ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY l.date, l.id),
       'attendance', l.id, l.teacher_id, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
FROM lesson_attendance a
JOIN hour_cards h ON h.id = a.hour_card_id
JOIN lessons l ON l.id = a.lesson_id
WHERE a.deducted = 1
  AND ((a.lesson_id BETWEEN 912001 AND 912013) OR (a.lesson_id BETWEEN 913001 AND 913013))
ON CONFLICT DO NOTHING;

-- ========== 回填卡的已用课时（与点名记录保持一致） ==========
UPDATE hour_cards
SET used_lessons = (SELECT COUNT(*) FROM lesson_attendance a WHERE a.hour_card_id = hour_cards.id AND a.deducted = 1)
WHERE id BETWEEN 10201 AND 10350;

-- ========== 未来两周课表（跳过周末；SQLite 的 strftime('%w') 周日=0 与 PG 的 dow 一致） ==========
WITH RECURSIVE cnt(d) AS (SELECT 0 UNION ALL SELECT d + 1 FROM cnt WHERE d < 13)
INSERT INTO lessons (id, campus_id, class_id, teacher_id, room_id, date, start_time, end_time, created_by)
SELECT 912100 + (v.column1 - 9121) * 100 + cnt.d, 901, v.column1, cl.head_teacher_id, v.column2,
  to_char((now() AT TIME ZONE 'Asia/Shanghai') + make_interval(days => cnt.d), 'YYYY-MM-DD'), v.column3, v.column4, 1
FROM (VALUES
  (9121, 9101, '09:00', '10:30'),
  (9122, 9101, '10:40', '12:10'),
  (9123, 9102, '14:00', '15:30'),
  (9124, 9102, '15:40', '17:10'),
  (9125, 9103, '17:20', '18:50'),
  (9126, 9103, '19:00', '20:30')
) v
JOIN classes cl ON cl.id = v.column1
JOIN cnt ON extract(dow from (now() AT TIME ZONE 'Asia/Shanghai') + make_interval(days => cnt.d))::int NOT IN (0, 6)
ON CONFLICT DO NOTHING;

WITH RECURSIVE cnt(d) AS (SELECT 0 UNION ALL SELECT d + 1 FROM cnt WHERE d < 13)
INSERT INTO lessons (id, campus_id, class_id, teacher_id, room_id, date, start_time, end_time, created_by)
SELECT 913100 + (v.column1 - 9131) * 100 + cnt.d, 902, v.column1, cl.head_teacher_id, v.column2,
  to_char((now() AT TIME ZONE 'Asia/Shanghai') + make_interval(days => cnt.d), 'YYYY-MM-DD'), v.column3, v.column4, 1
FROM (VALUES
  (9131, 9104, '09:00', '10:30'),
  (9132, 9104, '10:40', '12:10'),
  (9133, 9105, '14:00', '15:30'),
  (9134, 9105, '15:40', '17:10'),
  (9135, 9106, '17:20', '18:50'),
  (9136, 9106, '19:00', '20:30')
) v
JOIN classes cl ON cl.id = v.column1
JOIN cnt ON extract(dow from (now() AT TIME ZONE 'Asia/Shanghai') + make_interval(days => cnt.d))::int NOT IN (0, 6)
ON CONFLICT DO NOTHING;

-- ========== 校准 SERIAL 序列（显式插入 id 后序列需手动对齐到 max(id)） ==========
SELECT setval(pg_get_serial_sequence('campuses', 'id'),           GREATEST((SELECT COALESCE(MAX(id), 0) FROM campuses), 1));
SELECT setval(pg_get_serial_sequence('users', 'id'),               GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1));
SELECT setval(pg_get_serial_sequence('availability_rules', 'id'),  GREATEST((SELECT COALESCE(MAX(id), 0) FROM availability_rules), 1));
SELECT setval(pg_get_serial_sequence('rooms', 'id'),               GREATEST((SELECT COALESCE(MAX(id), 0) FROM rooms), 1));
SELECT setval(pg_get_serial_sequence('courses', 'id'),             GREATEST((SELECT COALESCE(MAX(id), 0) FROM courses), 1));
SELECT setval(pg_get_serial_sequence('classes', 'id'),             GREATEST((SELECT COALESCE(MAX(id), 0) FROM classes), 1));
SELECT setval(pg_get_serial_sequence('students', 'id'),            GREATEST((SELECT COALESCE(MAX(id), 0) FROM students), 1));
SELECT setval(pg_get_serial_sequence('parents', 'id'),             GREATEST((SELECT COALESCE(MAX(id), 0) FROM parents), 1));
SELECT setval(pg_get_serial_sequence('enrollments', 'id'),          GREATEST((SELECT COALESCE(MAX(id), 0) FROM enrollments), 1));
SELECT setval(pg_get_serial_sequence('hour_cards', 'id'),          GREATEST((SELECT COALESCE(MAX(id), 0) FROM hour_cards), 1));
SELECT setval(pg_get_serial_sequence('hour_ledger', 'id'),          GREATEST((SELECT COALESCE(MAX(id), 0) FROM hour_ledger), 1));
SELECT setval(pg_get_serial_sequence('lessons', 'id'),              GREATEST((SELECT COALESCE(MAX(id), 0) FROM lessons), 1));
SELECT setval(pg_get_serial_sequence('lesson_attendance', 'id'),    GREATEST((SELECT COALESCE(MAX(id), 0) FROM lesson_attendance), 1));
