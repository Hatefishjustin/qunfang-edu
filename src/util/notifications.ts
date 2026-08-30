import { addDays, beijingNow, beijingToday } from './time';

export type NotificationUser = {
  id: number;
  role: string;
  campus_id: number | null;
};

type NotificationPayload = {
  campusId: number | null;
  type: string;
  title: string;
  content: string;
  link: string | null;
  relatedLessonId?: number | null;
  relatedRequestId?: number | null;
};

type LessonSummary = {
  id: number;
  campus_id: number;
  date: string;
  start_time: string;
  end_time: string;
  class_name: string | null;
  course_name: string | null;
  teacher_name: string | null;
};

function roleLessonLink(role: string, lessonId: number): string {
  if (role === 'teacher') return `/checkin/${lessonId}`;
  if (role === 'parent') return '/parent';
  if (role === 'student') return '/student';
  return '/schedule/calendar';
}

async function loadLessonSummary(db: D1Database, lessonId: number): Promise<LessonSummary | null> {
  return db.prepare(
    `SELECT l.id, l.campus_id, l.date, l.start_time, l.end_time,
       cl.name AS class_name, co.name AS course_name, u.name AS teacher_name
     FROM lessons l
     LEFT JOIN classes cl ON cl.id = l.class_id
     LEFT JOIN courses co ON co.id = cl.course_id
     LEFT JOIN users u ON u.id = l.teacher_id
     WHERE l.id = ?`,
  )
    .bind(lessonId)
    .first<LessonSummary>();
}

/** 该课的直接用户：老师、在册学生账号和关联家长账号。 */
export async function lessonAudience(db: D1Database, lessonId: number): Promise<NotificationUser[]> {
  const rows = await db.prepare(
    `SELECT DISTINCT u.id, u.role, u.campus_id
     FROM users u
     WHERE u.status = 'active' AND u.deleted_at IS NULL AND (
       u.id = (SELECT teacher_id FROM lessons WHERE id = ?)
       OR (
         u.role = 'student' AND EXISTS (
           SELECT 1 FROM students s
           JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
           JOIN lessons l ON l.class_id = e.class_id
           WHERE l.id = ? AND s.user_id = u.id AND s.deleted_at IS NULL
         )
       )
       OR (
         u.role = 'parent' AND EXISTS (
           SELECT 1 FROM parents p
           JOIN parent_student ps ON ps.parent_id = p.id
           JOIN enrollments e ON e.student_id = ps.student_id AND e.status = 'active'
           JOIN lessons l ON l.class_id = e.class_id
           WHERE l.id = ? AND p.user_id = u.id AND p.deleted_at IS NULL
         )
       )
     )`,
  )
    .bind(lessonId, lessonId, lessonId)
    .all<NotificationUser>();
  return rows.results;
}

/**
 * 同一用户、类型和关联对象只保留一条活动通知；事件再次发生时刷新为未读。
 * 课程提醒使用 refreshExisting=false，避免轮询把已读提醒重新变成未读。
 */
export async function upsertNotifications(
  db: D1Database,
  users: NotificationUser[],
  payload: NotificationPayload,
  options: { excludeUserId?: number; refreshExisting?: boolean } = {},
): Promise<void> {
  const refreshExisting = options.refreshExisting ?? true;
  const statements: D1PreparedStatement[] = [];
  const relatedLessonId = payload.relatedLessonId ?? null;
  const relatedRequestId = payload.relatedRequestId ?? null;

  for (const user of users) {
    if (user.id === options.excludeUserId) continue;
    const existing = await db.prepare(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = ?
         AND COALESCE(related_lesson_id, 0) = ?
         AND COALESCE(related_request_id, 0) = ?
       ORDER BY id DESC LIMIT 1`,
    )
      .bind(user.id, payload.type, relatedLessonId ?? 0, relatedRequestId ?? 0)
      .first<{ id: number }>();

    if (existing) {
      if (refreshExisting) {
        statements.push(
          db.prepare(
            `UPDATE notifications
             SET title = ?, content = ?, link = ?, read_at = NULL, created_at = ?
             WHERE id = ?`,
          ).bind(payload.title, payload.content, payload.link, beijingNow(), existing.id),
        );
      }
      continue;
    }

    statements.push(
      db.prepare(
        `INSERT INTO notifications
          (campus_id, user_id, type, title, content, link, related_lesson_id, related_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        payload.campusId,
        user.id,
        payload.type,
        payload.title,
        payload.content,
        payload.link,
        relatedLessonId,
        relatedRequestId,
      ),
    );
  }

  if (statements.length > 0) await db.batch(statements);
}

export async function notifyLessonChange(
  db: D1Database,
  lessonId: number,
  actorUserId: number,
  kind: 'created' | 'rescheduled' | 'cancelled',
): Promise<void> {
  const lesson = await loadLessonSummary(db, lessonId);
  if (!lesson) return;
  const audience = await lessonAudience(db, lessonId);
  const course = lesson.course_name ?? lesson.class_name ?? '课程';
  const labels = {
    created: { type: 'lesson_created', title: '新增课程安排' },
    rescheduled: { type: 'lesson_rescheduled', title: '课时安排已更改' },
    cancelled: { type: 'lesson_cancelled', title: '课程已取消' },
  } as const;
  const label = labels[kind];

  for (const user of audience) {
    await upsertNotifications(
      db,
      [user],
      {
        campusId: lesson.campus_id,
        type: label.type,
        title: label.title,
        content: `${course} · ${lesson.date} ${lesson.start_time}-${lesson.end_time}`,
        link: roleLessonLink(user.role, lesson.id),
        relatedLessonId: lesson.id,
      },
      { excludeUserId: actorUserId },
    );
  }
}

export async function notifyClassroomFeedback(
  db: D1Database,
  lessonId: number,
  actorUserId: number,
): Promise<void> {
  const lesson = await loadLessonSummary(db, lessonId);
  if (!lesson) return;
  const audience = (await lessonAudience(db, lessonId)).filter(
    (user) => user.role === 'parent' || user.role === 'student',
  );
  const course = lesson.course_name ?? lesson.class_name ?? '课程';
  for (const user of audience) {
    await upsertNotifications(
      db,
      [user],
      {
        campusId: lesson.campus_id,
        type: 'classroom_feedback',
        title: '老师更新了课堂反馈',
        content: `${course} · ${lesson.date} ${lesson.start_time}-${lesson.end_time}`,
        link: roleLessonLink(user.role, lesson.id),
        relatedLessonId: lesson.id,
      },
      { excludeUserId: actorUserId },
    );
  }
}

/** 打开通知中心时补齐今天和明天的课程提醒，不依赖定时任务。 */
export async function materializeLessonReminders(db: D1Database, me: NotificationUser): Promise<void> {
  if (me.role !== 'teacher' && me.role !== 'parent' && me.role !== 'student') return;
  const today = beijingToday();
  const tomorrow = addDays(today, 1);
  let sql = '';
  const binds: (string | number)[] = [];

  if (me.role === 'teacher') {
    sql = `SELECT DISTINCT l.id FROM lessons l
           WHERE l.teacher_id = ? AND l.status = 'scheduled' AND l.date BETWEEN ? AND ?`;
    binds.push(me.id, today, tomorrow);
  } else if (me.role === 'student') {
    sql = `SELECT DISTINCT l.id FROM lessons l
           JOIN enrollments e ON e.class_id = l.class_id AND e.status = 'active'
           JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
           WHERE s.user_id = ? AND l.status = 'scheduled' AND l.date BETWEEN ? AND ?`;
    binds.push(me.id, today, tomorrow);
  } else {
    sql = `SELECT DISTINCT l.id FROM lessons l
           JOIN enrollments e ON e.class_id = l.class_id AND e.status = 'active'
           JOIN parent_student ps ON ps.student_id = e.student_id
           JOIN parents p ON p.id = ps.parent_id AND p.deleted_at IS NULL
           WHERE p.user_id = ? AND l.status = 'scheduled' AND l.date BETWEEN ? AND ?`;
    binds.push(me.id, today, tomorrow);
  }

  const rows = await db.prepare(sql).bind(...binds).all<{ id: number }>();
  for (const row of rows.results) {
    const lesson = await loadLessonSummary(db, row.id);
    if (!lesson) continue;
    const course = lesson.course_name ?? lesson.class_name ?? '课程';
    await upsertNotifications(
      db,
      [me],
      {
        campusId: lesson.campus_id,
        type: 'lesson_reminder',
        title: lesson.date === today ? '今天有课' : '明天有课',
        content: `${course} · ${lesson.start_time}-${lesson.end_time}${lesson.teacher_name ? ` · ${lesson.teacher_name}` : ''}`,
        link: roleLessonLink(me.role, lesson.id),
        relatedLessonId: lesson.id,
      },
      { refreshExisting: false },
    );
  }
}
