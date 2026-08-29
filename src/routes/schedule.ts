// 教师忙闲总览（HANDOFF 核心页的数据接口）：一周内每位老师的可用规则 + 已排课
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus } from '../util/scope';
import { isValidDate, readStr } from '../util/validate';
import { addDays, mondayOf, thisMonday } from '../util/time';

export const scheduleRoutes = new Hono<AppEnv>();
scheduleRoutes.get('/overview', requireAuth, requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const campusId = queryCampus(c);

  // 周起点：默认本周一；传了日期则取所在周的周一
  const rawWeekStart = readStr(c.req.query('week_start'));
  let weekStart = rawWeekStart === '' ? thisMonday() : rawWeekStart;
  if (!isValidDate(weekStart)) return c.json({ error: 'week_start 日期格式不正确' }, 400);
  weekStart = mondayOf(weekStart);
  const weekEnd = addDays(weekStart, 6);

  // 教师列表（按 sort_no 排序）
  const where: string[] = ["u.role = 'teacher'", 'u.deleted_at IS NULL'];
  const binds: (string | number)[] = [];
  if (campusId !== null) {
    where.push('u.campus_id = ?');
    binds.push(campusId);
  }
  const teachers = await c.env.DB.prepare(
    `SELECT u.id, u.name, tp.subject FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE ${where.join(' AND ')} ORDER BY tp.sort_no, u.id`,
  )
    .bind(...binds)
    .all<{ id: number; name: string; subject: string | null }>();

  if (teachers.results.length === 0) {
    return c.json({ week_start: weekStart, week_end: weekEnd, teachers: [] });
  }

  const ids = teachers.results.map((t) => t.id);
  const ph = ids.map(() => '?').join(',');

  // 可用时间规则
  const rules = await c.env.DB.prepare(
    `SELECT teacher_id, weekday, start_time, end_time, kind FROM availability_rules WHERE teacher_id IN (${ph})`,
  )
    .bind(...ids)
    .all<{
      teacher_id: number;
      weekday: number;
      start_time: string;
      end_time: string;
      kind: string;
    }>();

  // 本周未取消的课（含班级/课程/教室名称）
  const lessons = await c.env.DB.prepare(
    `SELECT l.id, l.teacher_id, l.class_id, l.room_id, l.date, l.start_time, l.end_time, l.status, l.note,
       c.name AS class_name, co.color AS course_color, r.name AS room_name
     FROM lessons l
     LEFT JOIN classes c ON c.id = l.class_id
     LEFT JOIN courses co ON co.id = c.course_id
     LEFT JOIN rooms r ON r.id = l.room_id
     WHERE l.teacher_id IN (${ph}) AND l.date >= ? AND l.date <= ? AND l.status != 'cancelled'
     ORDER BY l.date, l.start_time`,
  )
    .bind(...ids, weekStart, weekEnd)
    .all<{
      id: number;
      teacher_id: number;
      class_id: number;
      room_id: number | null;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      note: string | null;
      class_name: string | null;
      course_color: string | null;
      room_name: string | null;
    }>();

  // 组装：按 teacher_id 分组
  const rulesByTeacher = new Map<number, { weekday: number; start_time: string; end_time: string; kind: string }[]>();
  for (const r of rules.results) {
    const list = rulesByTeacher.get(r.teacher_id) ?? [];
    list.push({ weekday: r.weekday, start_time: r.start_time, end_time: r.end_time, kind: r.kind });
    rulesByTeacher.set(r.teacher_id, list);
  }
  const lessonsByTeacher = new Map<number, unknown[]>();
  for (const l of lessons.results) {
    const list = lessonsByTeacher.get(l.teacher_id) ?? [];
    list.push(l);
    lessonsByTeacher.set(l.teacher_id, list);
  }

  return c.json({
    week_start: weekStart,
    week_end: weekEnd,
    teachers: teachers.results.map((t) => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      rules: rulesByTeacher.get(t.id) ?? [],
      lessons: lessonsByTeacher.get(t.id) ?? [],
    })),
  });
});
