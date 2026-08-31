-- R8: schedule change / leave requests and user notifications.

CREATE TABLE schedule_requests (
  id                SERIAL PRIMARY KEY,
  campus_id         INTEGER NOT NULL,
  lesson_id         INTEGER NOT NULL,
  student_id        INTEGER NOT NULL,
  requester_user_id INTEGER NOT NULL,
  request_type      TEXT NOT NULL CHECK (request_type IN ('reschedule', 'leave')),
  reason            TEXT NOT NULL,
  requested_date    TEXT,
  requested_start   TEXT,
  requested_end     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by       INTEGER,
  review_note       TEXT,
  reviewed_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX idx_schedule_requests_campus_status
  ON schedule_requests(campus_id, status, created_at);

CREATE INDEX idx_schedule_requests_requester
  ON schedule_requests(requester_user_id, created_at);

CREATE INDEX idx_schedule_requests_lesson_student
  ON schedule_requests(lesson_id, student_id);

CREATE TABLE notifications (
  id                 SERIAL PRIMARY KEY,
  campus_id          INTEGER,
  user_id            INTEGER NOT NULL,
  type               TEXT NOT NULL,
  title              TEXT NOT NULL,
  content            TEXT NOT NULL,
  link               TEXT,
  related_lesson_id  INTEGER,
  related_request_id INTEGER,
  read_at            TEXT,
  created_at         TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE INDEX idx_notifications_user_created
  ON notifications(user_id, created_at);

CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, read_at);
