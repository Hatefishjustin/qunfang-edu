import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { checkLessonConflicts } from '../util/conflict';
import { notifyLessonChange, upsertNotifications } from '../util/notifications';
import { beijingNow, beijingToday } from '../util/time';
import { isValidDate, isValidTime, readInt, readStr } from '../util/validate';

export const scheduleRequestRoutes = new Hono<AppEnv>();
scheduleRequestRoutes.use('*', requireAuth);

type RequestRow = {
  id: number;
  campus_id: number;
  lesson_id: number;
  student_id: number;
  requester_user_id: number;
  request_type: 'reschedule' | 'leave';
  reason: string;
  requested_date: string | null;
  requested_start: string | null;
  requested_end: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by: number | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  lesson_date: string;
  lesson_start: string;
  lesson_end: string;
  lesson_status: string;
  teacher_id: number;
  room_id: number | null;
  student_name: string | null;
  class_name: string | null;
  course_name: string | null;
  requester_name: string | null;
  reviewer_name: string | null;
};

const REQUEST_SELECT = `
  SELECT sr.id, sr.campus_id, sr.lesson_id, sr.student_id, sr.requester_user_id,
    sr.request_type, sr.reason, sr.requested_date, sr.requested_start, sr.requested_end,
    sr.status, sr.reviewed_by, sr.review_note, sr.reviewed_at, sr.created_at,
    l.date AS lesson_date, l.start_time AS lesson_start, l.end_time AS lesson_end,
    l.status AS lesson_status, l.teacher_id, l.room_id,
    s.name AS student_name, cl.name AS class_name, co.name AS course_name,
    requester.name AS requester_name, reviewer.name AS reviewer_name
  FROM schedule_requests sr
  JOIN lessons l ON l.id = sr.lesson_id
  LEFT JOIN students s ON s.id = sr.student_id
  LEFT JOIN classes cl ON cl.id = l.class_id
  LEFT JOIN courses co ON co.id = cl.course_id
  LEFT JOIN users requester ON requester.id = sr.requester_user_id
  LEFT JOIN users reviewer ON reviewer.id = sr.reviewed_by
`;

async function requestAdmins(db: D1Database, campusId: number) {
  const rows = await db.prepare(
    `SELECT id, role, campus_id FROM users
     WHERE status = 'active' AND deleted_at IS NULL
       AND (role = 'super_admin' OR (role = 'campus_admin' AND campus_id = ?))`,
  )
    .bind(campusId)
    .all<{ id: number; role: string; campus_id: number | null }>();
  return rows.results;
}

async function notifyRequester(
  db: D1Database,
  request: RequestRow,
  action: 'approved' | 'rejected',
): Promise<void> {
  const user = await db.prepare(
    'SELECT id, role, campus_id FROM users WHERE id = ? AND status = \'active\' AND deleted_at IS NULL',
  )
    .bind(request.requester_user_id)
    .first<{ id: number; role: string; campus_id: number | null }>();
  if (!user) return;
  const isApproved = action === 'approved';
  const kind = request.request_type === 'leave' ? '请假' : '调课';
  await upsertNotifications(db, [user], {
    campusId: request.campus_id,
    type: isApproved ? 'request_approved' : 'request_rejected',
    title: `${kind}申请${isApproved ? '已批准' : '未通过'}`,
    content: `${request.course_name ?? request.class_name ?? '课程'} · ${request.lesson_date} ${request.lesson_start}-${request.lesson_end}`,
    link: user.role === 'parent' ? '/parent/requests' : '/student/requests',
    relatedLessonId: request.lesson_id,
    relatedRequestId: request.id,
  });
}

scheduleRequestRoutes.get(
  '/',
  requireRole('parent', 'student', 'campus_admin', 'super_admin'),
  async (c) => {
    const me = c.get('user');
    const where: string[] = [];
    const binds: (string | number)[] = [];

    if (me.role === 'parent' || me.role === 'student') {
      where.push('sr.requester_user_id = ?');
      binds.push(me.id);
    } else if (me.role === 'campus_admin') {
      where.push('sr.campus_id = ?');
      binds.push(me.campusId ?? 0);
    } else {
      const campusId = Number(c.req.query('campus_id') ?? 0);
      if (Number.isInteger(campusId) && campusId > 0) {
        where.push('sr.campus_id = ?');
        binds.push(campusId);
      }
    }

    const status = c.req.query('status') ?? '';
    if (status !== '') {
      if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
        return c.json({ error: '状态参数不正确' }, 400);
      }
      where.push('sr.status = ?');
      binds.push(status);
    }

    const rows = await c.env.DB.prepare(
      `${REQUEST_SELECT} ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY CASE sr.status WHEN 'pending' THEN 0 ELSE 1 END, sr.created_at DESC, sr.id DESC`,
    )
      .bind(...binds)
      .all<RequestRow>();
    return c.json(rows.results);
  },
);

scheduleRequestRoutes.post('/', requireRole('parent', 'student'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const lessonId = readInt(b.lesson_id);
  const studentId = readInt(b.student_id);
  const requestType = readStr(b.request_type);
  const reason = readStr(b.reason);
  if (lessonId === null || studentId === null) return c.json({ error: '课程或学员参数不正确' }, 400);
  if (requestType !== 'reschedule' && requestType !== 'leave') {
    return c.json({ error: '申请类型不正确' }, 400);
  }
  if (!reason) return c.json({ error: '请填写申请原因' }, 400);
  if (reason.length > 500) return c.json({ error: '申请原因最多 500 字' }, 400);

  const lesson = await c.env.DB.prepare(
    `SELECT l.id, l.campus_id, l.class_id, l.date, l.start_time, l.end_time, l.status,
       cl.name AS class_name, co.name AS course_name
     FROM lessons l
     LEFT JOIN classes cl ON cl.id = l.class_id
     LEFT JOIN courses co ON co.id = cl.course_id
     WHERE l.id = ?`,
  )
    .bind(lessonId)
    .first<{
      id: number;
      campus_id: number;
      class_id: number;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      class_name: string | null;
      course_name: string | null;
    }>();
  if (!lesson) return c.json({ error: '课程不存在' }, 404);
  if (lesson.status !== 'scheduled' || lesson.date < beijingToday()) {
    return c.json({ error: '只能申请未开始的课程' }, 400);
  }

  const enrolled = await c.env.DB.prepare(
    `SELECT s.id, s.campus_id, s.user_id
     FROM students s JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
     WHERE s.id = ? AND e.class_id = ? AND s.deleted_at IS NULL`,
  )
    .bind(studentId, lesson.class_id)
    .first<{ id: number; campus_id: number; user_id: number | null }>();
  if (!enrolled || enrolled.campus_id !== lesson.campus_id) return c.json({ error: '学员不在该课程班级中' }, 403);

  if (me.role === 'student' && enrolled.user_id !== me.id) return c.json({ error: '没有权限' }, 403);
  if (me.role === 'parent') {
    const relation = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM parent_student ps JOIN parents p ON p.id = ps.parent_id
       WHERE ps.student_id = ? AND p.user_id = ? AND p.deleted_at IS NULL`,
    )
      .bind(studentId, me.id)
      .first<{ ok: number }>();
    if (!relation) return c.json({ error: '没有权限' }, 403);
  }

  let requestedDate: string | null = null;
  let requestedStart: string | null = null;
  let requestedEnd: string | null = null;
  if (requestType === 'reschedule') {
    requestedDate = readStr(b.requested_date) || null;
    requestedStart = readStr(b.requested_start) || null;
    requestedEnd = readStr(b.requested_end) || null;
    if (!requestedDate || !isValidDate(requestedDate) || requestedDate < beijingToday()) {
      return c.json({ error: '期望日期不正确' }, 400);
    }
    if (!requestedStart || !requestedEnd || !isValidTime(requestedStart) || !isValidTime(requestedEnd) || requestedStart >= requestedEnd) {
      return c.json({ error: '期望时间段不正确' }, 400);
    }
  }

  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM schedule_requests
     WHERE lesson_id = ? AND student_id = ? AND requester_user_id = ?
       AND request_type = ? AND status = 'pending' LIMIT 1`,
  )
    .bind(lessonId, studentId, me.id, requestType)
    .first<{ id: number }>();
  if (duplicate) return c.json({ error: '已有同类型待审批申请，请勿重复提交' }, 409);

  const result = await c.env.DB.prepare(
    `INSERT INTO schedule_requests
      (campus_id, lesson_id, student_id, requester_user_id, request_type, reason,
       requested_date, requested_start, requested_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      lesson.campus_id,
      lessonId,
      studentId,
      me.id,
      requestType,
      reason,
      requestedDate,
      requestedStart,
      requestedEnd,
    )
    .run();
  const id = Number(result.meta.last_row_id);
  const admins = await requestAdmins(c.env.DB, lesson.campus_id);
  await upsertNotifications(c.env.DB, admins, {
    campusId: lesson.campus_id,
    type: 'request_submitted',
    title: `新的${requestType === 'leave' ? '请假' : '调课'}申请`,
    content: `${lesson.course_name ?? lesson.class_name ?? '课程'} · ${lesson.date} ${lesson.start_time}-${lesson.end_time}`,
    link: '/schedule/requests',
    relatedLessonId: lessonId,
    relatedRequestId: id,
  });
  return c.json({ id }, 201);
});

scheduleRequestRoutes.patch(
  '/:id/review',
  requireRole('campus_admin', 'super_admin'),
  async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
    const me = c.get('user');
    const request = await c.env.DB.prepare(`${REQUEST_SELECT} WHERE sr.id = ?`)
      .bind(id)
      .first<RequestRow>();
    if (!request) return c.json({ error: '申请不存在' }, 404);
    if (me.role === 'campus_admin' && request.campus_id !== me.campusId) return c.json({ error: '申请不存在' }, 404);
    if (request.status !== 'pending') return c.json({ error: '该申请已处理' }, 400);

    const body = await c.req.json().catch(() => null);
    const b = (body ?? {}) as Record<string, unknown>;
    const action = readStr(b.action);
    const reviewNote = readStr(b.review_note) || null;
    if (action !== 'approve' && action !== 'reject') return c.json({ error: '审批动作不正确' }, 400);
    if (reviewNote && reviewNote.length > 500) return c.json({ error: '审批备注最多 500 字' }, 400);

    if (action === 'approve') {
      if (request.lesson_status !== 'scheduled') return c.json({ error: '课程状态已变化，不能批准' }, 400);
      if (request.request_type === 'reschedule') {
        if (!request.requested_date || !request.requested_start || !request.requested_end) {
          return c.json({ error: '申请缺少期望时间' }, 400);
        }
        const report = await checkLessonConflicts(c.env.DB, {
          teacherId: request.teacher_id,
          roomId: request.room_id,
          date: request.requested_date,
          startTime: request.requested_start,
          endTime: request.requested_end,
          excludeLessonId: request.lesson_id,
        });
        const conflict = report.teacher ?? report.room ?? report.unavailable;
        if (conflict) return c.json({ error: conflict, code: 'SCHEDULE_CONFLICT' }, 409);

        await c.env.DB.batch([
          c.env.DB.prepare(
            'UPDATE lessons SET date = ?, start_time = ?, end_time = ? WHERE id = ? AND status = \'scheduled\'',
          ).bind(request.requested_date, request.requested_start, request.requested_end, request.lesson_id),
          c.env.DB.prepare(
            `UPDATE schedule_requests SET status = 'approved', reviewed_by = ?, review_note = ?, reviewed_at = ?
             WHERE id = ? AND status = 'pending'`,
          ).bind(me.id, reviewNote, beijingNow(), id),
        ]);
        await notifyLessonChange(c.env.DB, request.lesson_id, me.id, 'rescheduled');
      } else {
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT INTO lesson_attendance (lesson_id, student_id, status, deducted, checked_at)
             VALUES (?, ?, 'leave', 0, ?)
             ON CONFLICT(lesson_id, student_id) DO UPDATE
             SET status = 'leave', hour_card_id = NULL, deducted = 0, checked_at = excluded.checked_at`,
          ).bind(request.lesson_id, request.student_id, beijingNow()),
          c.env.DB.prepare(
            `UPDATE schedule_requests SET status = 'approved', reviewed_by = ?, review_note = ?, reviewed_at = ?
             WHERE id = ? AND status = 'pending'`,
          ).bind(me.id, reviewNote, beijingNow(), id),
        ]);
      }
      await notifyRequester(c.env.DB, request, 'approved');
      return c.json({ ok: true, status: 'approved' });
    }

    await c.env.DB.prepare(
      `UPDATE schedule_requests SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(me.id, reviewNote, beijingNow(), id)
      .run();
    await notifyRequester(c.env.DB, request, 'rejected');
    return c.json({ ok: true, status: 'rejected' });
  },
);

scheduleRequestRoutes.patch('/:id/cancel', requireRole('parent', 'student'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');
  const request = await c.env.DB.prepare(`${REQUEST_SELECT} WHERE sr.id = ? AND sr.requester_user_id = ?`)
    .bind(id, me.id)
    .first<RequestRow>();
  if (!request) return c.json({ error: '申请不存在' }, 404);
  if (request.status !== 'pending') return c.json({ error: '该申请已处理，不能取消' }, 400);
  await c.env.DB.prepare("UPDATE schedule_requests SET status = 'cancelled' WHERE id = ? AND status = 'pending'")
    .bind(id)
    .run();
  const admins = await requestAdmins(c.env.DB, request.campus_id);
  await upsertNotifications(c.env.DB, admins, {
    campusId: request.campus_id,
    type: 'request_cancelled',
    title: '申请人已取消申请',
    content: `${request.course_name ?? request.class_name ?? '课程'} · ${request.lesson_date} ${request.lesson_start}-${request.lesson_end}`,
    link: '/schedule/requests',
    relatedLessonId: request.lesson_id,
    relatedRequestId: request.id,
  });
  return c.json({ ok: true });
});
