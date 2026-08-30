// 排课核心：课的统一查询 / 单次与按周批量创建（冲突检测）/ 调课 / 取消
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { checkLessonConflicts } from '../util/conflict';
import { prepareDeduct, buildRefund } from '../util/hours';
import { isValidDate, isValidTime, readStr, readInt } from '../util/validate';
import { addDays, beijingToday, weekdayOf } from '../util/time';
import { notifyLessonChange, upsertNotifications } from '../util/notifications';

export const lessonRoutes = new Hono<AppEnv>();
lessonRoutes.use('*', requireAuth);

/** 对外返回的课（含关联名称，前端周历渲染用） */
type LessonRow = {
  id: number;
  campus_id: number;
  class_id: number;
  teacher_id: number;
  room_id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  note: string | null;
  class_name: string | null;
  course_name: string | null;
  course_color: string | null;
  teacher_name: string | null;
  room_name: string | null;
};

const LESSON_SELECT = `
  SELECT l.id, l.campus_id, l.class_id, l.teacher_id, l.room_id, l.date, l.start_time, l.end_time, l.status, l.note,
    c.name AS class_name, co.name AS course_name, co.color AS course_color,
    u.name AS teacher_name, r.name AS room_name
  FROM lessons l
  LEFT JOIN classes c ON c.id = l.class_id
  LEFT JOIN courses co ON co.id = c.course_id
  LEFT JOIN users u ON u.id = l.teacher_id
  LEFT JOIN rooms r ON r.id = l.room_id
`;

// ---------- 统一课表查询（角色决定可查范围） ----------
lessonRoutes.get('/', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const me = c.get('user');
  const q = c.req.query();

  const where: string[] = [`l.status != 'cancelled'`];
  const binds: (string | number)[] = [];

  if (q.from) {
    if (!isValidDate(q.from)) return c.json({ error: 'from 日期格式不正确' }, 400);
    where.push('l.date >= ?');
    binds.push(q.from);
  }
  if (q.to) {
    if (!isValidDate(q.to)) return c.json({ error: 'to 日期格式不正确' }, 400);
    where.push('l.date <= ?');
    binds.push(q.to);
  }

  // 数据范围：teacher 只看自己的课；campus_admin 强制本校区；super_admin 可选校区筛选
  if (me.role === 'teacher') {
    where.push('l.teacher_id = ?');
    binds.push(me.id);
  } else if (me.role === 'campus_admin') {
    where.push('l.campus_id = ?');
    binds.push(me.campusId ?? 0);
  } else {
    const campusId = q.campus_id !== undefined && q.campus_id !== '' ? Number(q.campus_id) : null;
    if (campusId !== null && Number.isInteger(campusId) && campusId > 0) {
      where.push('l.campus_id = ?');
      binds.push(campusId);
    }
  }

  if (q.teacher_id !== undefined && q.teacher_id !== '' && me.role !== 'teacher') {
    const teacherId = Number(q.teacher_id);
    if (Number.isInteger(teacherId) && teacherId > 0) {
      where.push('l.teacher_id = ?');
      binds.push(teacherId);
    }
  }
  if (q.class_id !== undefined && q.class_id !== '') {
    const classId = Number(q.class_id);
    if (Number.isInteger(classId) && classId > 0) {
      where.push('l.class_id = ?');
      binds.push(classId);
    }
  }
  if (q.room_id !== undefined && q.room_id !== '') {
    const roomId = Number(q.room_id);
    if (Number.isInteger(roomId) && roomId > 0) {
      where.push('l.room_id = ?');
      binds.push(roomId);
    }
  }

  const rows = await c.env.DB.prepare(`${LESSON_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.date, l.start_time`)
    .bind(...binds)
    .all<LessonRow>();
  return c.json(rows.results);
});

// ---------- 建课上下文校验：班级 / 老师 / 教室 合法且同校区 ----------
type CreateContext = {
  classId: number;
  teacherId: number;
  roomId: number | null;
  campusId: number;
};

/**
 * 校验班级存在且未归档、老师存在且属于班级所在校区、教室存在且属于该校区。
 * campus_admin 只能操作本校区班级。返回 null = 校验失败（错误已放入 err）。
 */
async function resolveContext(
  c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } },
  classId: number,
  teacherId: number,
  roomId: number | null,
): Promise<{ ctx: CreateContext; err: null } | { ctx: null; err: string }> {
  const me = c.get('user');

  const cls = await c.env.DB.prepare(
    "SELECT id, campus_id, status FROM classes WHERE id = ? AND status = 'active'",
  )
    .bind(classId)
    .first<{ id: number; campus_id: number; status: string }>();
  if (!cls) return { ctx: null, err: '班级不存在或已归档' };
  if (me.role === 'campus_admin' && cls.campus_id !== me.campusId) {
    return { ctx: null, err: '班级不存在或已归档' };
  }

  const teacher = await c.env.DB.prepare(
    "SELECT id, campus_id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL AND status = 'active'",
  )
    .bind(teacherId)
    .first<{ id: number; campus_id: number | null }>();
  if (!teacher) return { ctx: null, err: '老师不存在或已停用' };
  if (teacher.campus_id !== cls.campus_id) return { ctx: null, err: '老师不属于该班级所在校区' };

  if (roomId !== null) {
    const room = await c.env.DB.prepare('SELECT id, campus_id FROM rooms WHERE id = ?')
      .bind(roomId)
      .first<{ id: number; campus_id: number }>();
    if (!room) return { ctx: null, err: '教室不存在' };
    if (room.campus_id !== cls.campus_id) return { ctx: null, err: '教室不属于该班级所在校区' };
  }

  return {
    ctx: { classId, teacherId, roomId, campusId: cls.campus_id },
    err: null,
  };
}

/** 冲突 → 409（teacher/room 硬冲突必拒；unavailable 需 force 才放行） */
function conflictResponse(
  report: { teacher: string | null; room: string | null; unavailable: string | null },
  force: boolean,
): { error: string; code: string } | null {
  if (report.teacher) return { error: report.teacher, code: 'conflict' };
  if (report.room) return { error: report.room, code: 'conflict' };
  if (report.unavailable !== null && !force) {
    return { error: `${report.unavailable}，如仍需排课请勾选「强制排课」`, code: 'conflict' };
  }
  return null;
}

// ---------- 单次建课 ----------
lessonRoutes.post('/', requireRole('super_admin', 'campus_admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const classId = readInt(b.class_id);
  const teacherId = readInt(b.teacher_id);
  const roomId =
    b.room_id === null || b.room_id === undefined || b.room_id === '' ? null : readInt(b.room_id);
  const date = readStr(b.date);
  const start = readStr(b.start_time);
  const end = readStr(b.end_time);
  const force = b.force === true;
  const note = readStr(b.note) || null;

  if (classId === null) return c.json({ error: '请选择班级' }, 400);
  if (teacherId === null) return c.json({ error: '请选择老师' }, 400);
  if (roomId === null && b.room_id != null && b.room_id !== '') return c.json({ error: '教室参数不正确' }, 400);
  if (!isValidDate(date)) return c.json({ error: '日期格式不正确' }, 400);
  if (!isValidTime(start) || !isValidTime(end) || start >= end) {
    return c.json({ error: '时间段不正确（需 HH:MM 且开始早于结束）' }, 400);
  }

  const { ctx, err } = await resolveContext(c, classId, teacherId, roomId);
  if (!ctx) return c.json({ error: err }, 400);

  const report = await checkLessonConflicts(c.env.DB, {
    teacherId,
    roomId,
    date,
    startTime: start,
    endTime: end,
  });
  // force 只能跳过 unavailable，跳不过老师/教室硬冲突
  if (report.teacher) return c.json({ error: report.teacher, code: 'conflict' }, 409);
  if (report.room) return c.json({ error: report.room, code: 'conflict' }, 409);
  if (report.unavailable !== null && !force) {
    return c.json(
      { error: `${report.unavailable}，如仍需排课请勾选「强制排课」`, code: 'conflict' },
      409,
    );
  }

  // force 跳过了 unavailable → 记入 note
  const finalNote =
    force && report.unavailable ? (note ? `${note}；` : '') + '强制排课（避开老师不可用时段）' : note;

  const r = await c.env.DB.prepare(
    'INSERT INTO lessons (campus_id, class_id, teacher_id, room_id, date, start_time, end_time, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(ctx.campusId, classId, teacherId, roomId, date, start, end, finalNote, c.get('user').id)
    .run();
  const id = Number(r.meta.last_row_id);
  await notifyLessonChange(c.env.DB, id, c.get('user').id, 'created');
  return c.json({ id }, 201);
});

// ---------- 按周批量建课（冲突整体回滚，不允许部分成功） ----------
lessonRoutes.post('/batch', requireRole('super_admin', 'campus_admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const classId = readInt(b.class_id);
  const teacherId = readInt(b.teacher_id);
  const roomId =
    b.room_id === null || b.room_id === undefined || b.room_id === '' ? null : readInt(b.room_id);
  const weekday = Number(b.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return c.json({ error: '星期不合法' }, 400);
  }
  const start = readStr(b.start_time);
  const end = readStr(b.end_time);
  const startDate = readStr(b.start_date);
  const weeks = readInt(b.weeks) ?? 16;
  const force = b.force === true;
  const note = readStr(b.note) || null;

  if (classId === null) return c.json({ error: '请选择班级' }, 400);
  if (teacherId === null) return c.json({ error: '请选择老师' }, 400);
  if (roomId === null && b.room_id != null && b.room_id !== '') return c.json({ error: '教室参数不正确' }, 400);
  if (weekday === null || weekday > 6) return c.json({ error: '星期不合法' }, 400);
  if (!isValidTime(start) || !isValidTime(end) || start >= end) {
    return c.json({ error: '时间段不正确（需 HH:MM 且开始早于结束）' }, 400);
  }
  if (!isValidDate(startDate)) return c.json({ error: '起始日期格式不正确' }, 400);
  if (weeks < 1 || weeks > 52) return c.json({ error: '周数需在 1～52 之间' }, 400);

  const { ctx, err } = await resolveContext(c, classId, teacherId, roomId);
  if (!ctx) return c.json({ error: err }, 400);

  // 计算每周的上课日期：从起始日期起第一个匹配星期几的日子，之后每 7 天一节
  const offset = (weekday - weekdayOf(startDate) + 7) % 7;
  const first = addDays(startDate, offset);
  const dates: string[] = [];
  for (let i = 0; i < weeks; i++) dates.push(addDays(first, i * 7));

  // 逐周校验冲突：任何一周冲突则整体拒绝（未插入任何数据 = 整体回滚）
  let forcedNote = false;
  for (let i = 0; i < dates.length; i++) {
    const report = await checkLessonConflicts(c.env.DB, {
      teacherId,
      roomId,
      date: dates[i],
      startTime: start,
      endTime: end,
    });
    const conflict = conflictResponse(report, force);
    if (conflict) {
      return c.json({ error: `第 ${i + 1} 周（${dates[i]}）：${conflict.error}`, code: 'conflict' }, 409);
    }
    if (report.unavailable !== null) forcedNote = true; // force 放行的不可用时段
  }

  const finalNote =
    forcedNote && force ? (note ? `${note}；` : '') + '强制排课（避开老师不可用时段）' : note;

  const stmts = dates.map((d) =>
    c.env.DB.prepare(
      'INSERT INTO lessons (campus_id, class_id, teacher_id, room_id, date, start_time, end_time, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(ctx.campusId, classId, teacherId, roomId, d, start, end, finalNote, c.get('user').id),
  );
  const created = await c.env.DB.batch(stmts);
  const firstId = Number(created[0]?.meta.last_row_id ?? 0);
  if (firstId > 0) await notifyLessonChange(c.env.DB, firstId, c.get('user').id, 'created');
  return c.json({ created: dates.length, first_date: dates[0], last_date: dates[dates.length - 1] }, 201);
});

// ---------- 调课（改日期/时间/老师/教室，同一套冲突校验） ----------
lessonRoutes.patch('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');

  const lesson = await c.env.DB.prepare('SELECT * FROM lessons WHERE id = ?')
    .bind(id)
    .first<{
      id: number;
      campus_id: number;
      teacher_id: number;
      room_id: number | null;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      note: string | null;
    }>();
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  if (me.role === 'campus_admin' && lesson.campus_id !== me.campusId) {
    return c.json({ error: '课不存在' }, 404);
  }
  if (lesson.status !== 'scheduled') {
    return c.json({ error: lesson.status === 'cancelled' ? '该课已取消' : '该课已完成，不能调课' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  // 新旧值合并（未传的字段沿用原值）
  let teacherId = lesson.teacher_id;
  if (b.teacher_id !== undefined && b.teacher_id !== '') {
    const t = readInt(b.teacher_id);
    if (t === null) return c.json({ error: '老师参数不正确' }, 400);
    teacherId = t;
  }
  let roomId = lesson.room_id;
  if ('room_id' in b) {
    roomId = b.room_id === null || b.room_id === '' ? null : readInt(b.room_id);
    if (roomId === null && b.room_id !== null && b.room_id !== '') {
      return c.json({ error: '教室参数不正确' }, 400);
    }
  }
  const date = b.date !== undefined ? readStr(b.date) : lesson.date;
  const start = b.start_time !== undefined ? readStr(b.start_time) : lesson.start_time;
  const end = b.end_time !== undefined ? readStr(b.end_time) : lesson.end_time;
  const note = 'note' in b ? readStr(b.note) || null : lesson.note;
  const scheduleChanged =
    teacherId !== lesson.teacher_id ||
    roomId !== lesson.room_id ||
    date !== lesson.date ||
    start !== lesson.start_time ||
    end !== lesson.end_time;

  if (!isValidDate(date)) return c.json({ error: '日期格式不正确' }, 400);
  if (!isValidTime(start) || !isValidTime(end) || start >= end) {
    return c.json({ error: '时间段不正确（需 HH:MM 且开始早于结束）' }, 400);
  }

  // 老师换人时校验身份与校区；教室变更时校验校区
  if (teacherId !== lesson.teacher_id) {
    const teacher = await c.env.DB.prepare(
      "SELECT id, campus_id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL AND status = 'active'",
    )
      .bind(teacherId)
      .first<{ id: number; campus_id: number | null }>();
    if (!teacher) return c.json({ error: '老师不存在或已停用' }, 400);
    if (teacher.campus_id !== lesson.campus_id) return c.json({ error: '老师不属于该课所在校区' }, 400);
  }
  if (roomId !== null && roomId !== lesson.room_id) {
    const room = await c.env.DB.prepare('SELECT campus_id FROM rooms WHERE id = ?')
      .bind(roomId)
      .first<{ campus_id: number }>();
    if (!room) return c.json({ error: '教室不存在' }, 400);
    if (room.campus_id !== lesson.campus_id) return c.json({ error: '教室不属于该课所在校区' }, 400);
  }

  const report = await checkLessonConflicts(c.env.DB, {
    teacherId,
    roomId,
    date,
    startTime: start,
    endTime: end,
    excludeLessonId: id,
  });
  const conflict = conflictResponse(report, false);
  if (conflict) return c.json(conflict, 409);

  if (teacherId !== lesson.teacher_id) {
    const oldTeacher = await c.env.DB.prepare(
      "SELECT id, role, campus_id FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
    )
      .bind(lesson.teacher_id)
      .first<{ id: number; role: string; campus_id: number | null }>();
    if (oldTeacher) {
      await upsertNotifications(c.env.DB, [oldTeacher], {
        campusId: lesson.campus_id,
        type: 'lesson_rescheduled',
        title: '课程已从你的课表移除',
        content: `${lesson.date} ${lesson.start_time}-${lesson.end_time}`,
        link: '/teacher',
        relatedLessonId: id,
      });
    }
  }

  await c.env.DB.prepare(
    'UPDATE lessons SET teacher_id = ?, room_id = ?, date = ?, start_time = ?, end_time = ?, note = ? WHERE id = ?',
  )
    .bind(teacherId, roomId, date, start, end, note, id)
    .run();
  if (scheduleChanged) await notifyLessonChange(c.env.DB, id, me.id, 'rescheduled');
  return c.json({ ok: true });
});

// ---------- 取消课（status → cancelled；已点名扣过课的自动回退，见 6.5） ----------
lessonRoutes.delete('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');

  const lesson = await c.env.DB.prepare('SELECT id, campus_id, status FROM lessons WHERE id = ?')
    .bind(id)
    .first<{ id: number; campus_id: number; status: string }>();
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  if (me.role === 'campus_admin' && lesson.campus_id !== me.campusId) {
    return c.json({ error: '课不存在' }, 404);
  }
  if (lesson.status === 'cancelled') return c.json({ error: '该课已取消' }, 400);

  // 已点名的课：先构建回退语句（卡+台账+考勤），与置 cancelled 同一事务
  const refundStmts = await buildRefund(c.env.DB, id, me.id);
  await c.env.DB.batch([
    ...refundStmts,
    c.env.DB.prepare("UPDATE lessons SET status = 'cancelled' WHERE id = ?").bind(id),
  ]);
  await notifyLessonChange(c.env.DB, id, me.id, 'cancelled');
  return c.json({ ok: true, refunded: refundStmts.length / 3 });
});

// ---------- 点名页数据（学员 + 当前状态 + 该科目余额） ----------
lessonRoutes.get(
  '/:id/attendance',
  requireRole('super_admin', 'campus_admin', 'teacher'),
  async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
    const me = c.get('user');

    const lesson = await c.env.DB.prepare(
      `SELECT l.id, l.campus_id, l.class_id, l.teacher_id, l.date, l.start_time, l.end_time, l.status,
         c.name AS class_name, co.id AS course_id, co.name AS course_name, u.name AS teacher_name
       FROM lessons l
       LEFT JOIN classes c ON c.id = l.class_id
       LEFT JOIN courses co ON co.id = c.course_id
       LEFT JOIN users u ON u.id = l.teacher_id
       WHERE l.id = ?`,
    )
      .bind(id)
      .first<{
        id: number;
        campus_id: number;
        class_id: number;
        teacher_id: number;
        date: string;
        start_time: string;
        end_time: string;
        status: string;
        class_name: string | null;
        course_id: number | null;
        course_name: string | null;
        teacher_name: string | null;
      }>();
    if (!lesson) return c.json({ error: '课不存在' }, 404);
    if (me.role === 'campus_admin' && lesson.campus_id !== me.campusId) {
      return c.json({ error: '课不存在' }, 404);
    }
    if (me.role === 'teacher' && lesson.teacher_id !== me.id) {
      return c.json({ error: '没有权限' }, 403);
    }

    // 班级在册学员 + 已有考勤状态 + 该科目课时余额
    const students = await c.env.DB.prepare(
      `SELECT s.id, s.name, s.grade,
         (SELECT COALESCE(SUM(h.total_lessons - h.used_lessons), 0) FROM hour_cards h
           WHERE h.student_id = s.id AND h.course_id = ? AND h.status = 'active'
             AND (h.valid_until IS NULL OR h.valid_until >= date('now', 'localtime'))) AS balance
       FROM enrollments e JOIN students s ON s.id = e.student_id
       WHERE e.class_id = ? AND e.status = 'active' AND s.deleted_at IS NULL
       ORDER BY s.id`,
    )
      .bind(lesson.course_id ?? 0, lesson.class_id)
      .all<{ id: number; name: string; grade: string | null; balance: number }>();

    const records = await c.env.DB.prepare(
      'SELECT student_id, status, hour_card_id, deducted FROM lesson_attendance WHERE lesson_id = ?',
    )
      .bind(id)
      .all<{ student_id: number; status: string; hour_card_id: number | null; deducted: number }>();
    const byStudent = new Map(records.results.map((r) => [r.student_id, r]));

    return c.json({
      lesson,
      students: students.results.map((s) => ({
        ...s,
        attendance: byStudent.get(s.id) ?? null,
      })),
    });
  },
);

// ---------- 提交点名（事务扣课，HANDOFF 6.4/6.5） ----------
lessonRoutes.post(
  '/:id/attendance',
  requireRole('super_admin', 'campus_admin', 'teacher'),
  async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
    const me = c.get('user');

    const lesson = await c.env.DB.prepare(
      `SELECT l.id, l.campus_id, l.class_id, l.teacher_id, l.date, l.status, co.id AS course_id
       FROM lessons l LEFT JOIN classes cl ON cl.id = l.class_id
       LEFT JOIN courses co ON co.id = cl.course_id
       WHERE l.id = ?`,
    )
      .bind(id)
      .first<{
        id: number;
        campus_id: number;
        class_id: number;
        teacher_id: number;
        date: string;
        status: string;
        course_id: number | null;
      }>();
    if (!lesson) return c.json({ error: '课不存在' }, 404);
    if (me.role === 'campus_admin' && lesson.campus_id !== me.campusId) {
      return c.json({ error: '课不存在' }, 404);
    }
    if (me.role === 'teacher' && lesson.teacher_id !== me.id) {
      return c.json({ error: '没有权限' }, 403);
    }
    if (lesson.status === 'cancelled') return c.json({ error: '该课已取消' }, 400);
    if (lesson.status === 'done') return c.json({ error: '该课已完成点名' }, 400);

    // 只能点今天及过去 30 天内的课（补点名）
    const today = beijingToday();
    const earliest = addDays(today, -30);
    if (lesson.date > today) return c.json({ error: '还不能点名：课还没上' }, 400);
    if (lesson.date < earliest) return c.json({ error: '只能补点名过去 30 天内的课' }, 400);

    const body = await c.req.json().catch(() => null);
    const b = (body ?? {}) as Record<string, unknown>;
    const records = b.records;
    if (!Array.isArray(records) || records.length === 0) {
      return c.json({ error: '点名记录不能为空' }, 400);
    }

    // 校验学员都在班 + 状态合法
    const enrolled = new Set(
      (
        await c.env.DB.prepare(
          `SELECT e.student_id FROM enrollments e JOIN students s ON s.id = e.student_id
           WHERE e.class_id = ? AND e.status = 'active' AND s.deleted_at IS NULL`,
        )
          .bind(lesson.class_id)
          .all<{ student_id: number }>()
      ).results.map((r) => r.student_id),
    );
    const stmts: D1PreparedStatement[] = [];
    let present = 0;
    let absent = 0;
    let leave = 0;
    const noCard: number[] = [];

    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const studentId = readInt(r.student_id);
      const status = readStr(r.status);
      if (studentId === null || !enrolled.has(studentId)) {
        return c.json({ error: '有学员不在该班级' }, 400);
      }
      if (status !== 'present' && status !== 'absent' && status !== 'leave') {
        return c.json({ error: '点名状态不合法' }, 400);
      }
      if (status === 'present') {
        // 扣课（找卡生成语句）；没卡则记录为未扣
        const deduct = await prepareDeduct(
          c.env.DB,
          studentId,
          lesson.course_id ?? 0,
          id,
          me.id,
        );
        if (deduct) {
          stmts.push(...deduct.stmts);
          stmts.push(
            c.env.DB
              .prepare(
                `INSERT INTO lesson_attendance (lesson_id, student_id, status, hour_card_id, deducted, checked_at)
                 VALUES (?, ?, 'present', ?, 1, datetime('now'))
                 ON CONFLICT(lesson_id, student_id) DO UPDATE SET status='present', hour_card_id=?, deducted=1, checked_at=datetime('now')`,
              )
              .bind(id, studentId, deduct.cardId, deduct.cardId),
          );
        } else {
          noCard.push(studentId);
          stmts.push(
            c.env.DB
              .prepare(
                `INSERT INTO lesson_attendance (lesson_id, student_id, status, deducted, checked_at)
                 VALUES (?, ?, 'present', 0, datetime('now'))
                 ON CONFLICT(lesson_id, student_id) DO UPDATE SET status='present', deducted=0, checked_at=datetime('now')`,
              )
              .bind(id, studentId),
          );
        }
        present++;
      } else {
        // absent / leave 不扣课
        if (status === 'absent') absent++;
        else leave++;
        stmts.push(
          c.env.DB
            .prepare(
              `INSERT INTO lesson_attendance (lesson_id, student_id, status, deducted, checked_at)
               VALUES (?, ?, ?, 0, datetime('now'))
               ON CONFLICT(lesson_id, student_id) DO UPDATE SET status=?, deducted=0, checked_at=datetime('now')`,
            )
            .bind(id, studentId, status, status),
        );
      }
    }

    // 课置 done，与扣课同一事务
    stmts.push(c.env.DB.prepare("UPDATE lessons SET status = 'done' WHERE id = ?").bind(id));
    await c.env.DB.batch(stmts);

    return c.json({ ok: true, present, absent, leave, no_card: noCard });
  },
);
