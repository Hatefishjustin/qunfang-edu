// 家长/学生专属接口：我的（或我孩子的）课表 + 课时卡
// 安全关键（HANDOFF 6.7）：强制按登录身份关联过滤，不接受客户端传入 student_id
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { isValidDate } from '../util/validate';
import { beijingToday } from '../util/time';

export const meRoutes = new Hono<AppEnv>();
meRoutes.use('*', requireAuth);

/** 解析当前登录身份关联的学员 id 列表（parent → 所有孩子；student → 自己；teacher → 空走老师分支） */
async function myStudentIds(c: { env: { DB: D1Database }; get: (k: 'user') => { id: number; role: string } }): Promise<
  { ok: true; ids: number[] } | { ok: false; err: string }
> {
  const me = c.get('user');

  if (me.role === 'student') {
    const row = await c.env.DB.prepare('SELECT id FROM students WHERE user_id = ? AND deleted_at IS NULL')
      .bind(me.id)
      .first<{ id: number }>();
    return row ? { ok: true, ids: [row.id] } : { ok: false, err: '未找到你的学员档案' };
  }

  if (me.role === 'parent') {
    const rows = await c.env.DB.prepare(
      `SELECT ps.student_id FROM parent_student ps
       JOIN parents p ON p.id = ps.parent_id
       WHERE p.user_id = ? AND p.deleted_at IS NULL`,
    )
      .bind(me.id)
      .all<{ student_id: number }>();
    return { ok: true, ids: rows.results.map((r) => r.student_id) };
  }

  return { ok: false, err: '没有权限' };
}

// ---------- 我的课表（家长=孩子的课；学生=自己的课；教师=自己的课） ----------
meRoutes.get('/lessons', requireRole('parent', 'student', 'teacher'), async (c) => {
  const me = c.get('user');
  const q = c.req.query();
  const from = q.from ?? '';
  const to = q.to ?? '';
  if (from !== '' && !isValidDate(from)) return c.json({ error: 'from 日期格式不正确' }, 400);
  if (to !== '' && !isValidDate(to)) return c.json({ error: 'to 日期格式不正确' }, 400);

  const where: string[] = ["l.status != 'cancelled'"];
  const binds: (string | number)[] = [];
  if (from !== '') {
    where.push('l.date >= ?');
    binds.push(from);
  }
  if (to !== '') {
    where.push('l.date <= ?');
    binds.push(to);
  }

  if (me.role === 'teacher') {
    where.push('l.teacher_id = ?');
    binds.push(me.id);
  } else {
    const mine = await myStudentIds(c);
    if (!mine.ok) return c.json({ error: mine.err }, 403);
    if (mine.ids.length === 0) return c.json([]);
    const ph = mine.ids.map(() => '?').join(',');
    // 通过报班关系找课；同时带上学员 id 供前端区分是哪个孩子的课
    const rows = await c.env.DB.prepare(
      `SELECT DISTINCT l.id, l.date, l.start_time, l.end_time, l.status, e.student_id,
         cl.name AS class_name, co.name AS course_name, co.color AS course_color,
         u.name AS teacher_name, r.name AS room_name
       FROM lessons l
       JOIN enrollments e ON e.class_id = l.class_id AND e.status = 'active'
       LEFT JOIN classes cl ON cl.id = l.class_id
       LEFT JOIN courses co ON co.id = cl.course_id
       LEFT JOIN users u ON u.id = l.teacher_id
       LEFT JOIN rooms r ON r.id = l.room_id
       WHERE ${where.join(' AND ')} AND e.student_id IN (${ph})
       ORDER BY l.date, l.start_time`,
    )
      .bind(...binds, ...mine.ids)
      .all<{
        id: number;
        date: string;
        start_time: string;
        end_time: string;
        status: string;
        student_id: number;
        class_name: string | null;
        course_name: string | null;
        course_color: string | null;
        teacher_name: string | null;
        room_name: string | null;
      }>();
    return c.json(rows.results);
  }

  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.date, l.start_time, l.end_time, l.status,
       cl.name AS class_name, co.name AS course_name, co.color AS course_color,
       u.name AS teacher_name, r.name AS room_name
     FROM lessons l
     LEFT JOIN classes cl ON cl.id = l.class_id
     LEFT JOIN courses co ON co.id = cl.course_id
     LEFT JOIN users u ON u.id = l.teacher_id
     LEFT JOIN rooms r ON r.id = l.room_id
     WHERE ${where.join(' AND ')}
     ORDER BY l.date, l.start_time`,
  )
    .bind(...binds)
    .all();
  return c.json(rows.results);
});

// ---------- 我的课时卡（家长=孩子的；学生=自己的；含流水） ----------
meRoutes.get('/cards', requireRole('parent', 'student'), async (c) => {
  const mine = await myStudentIds(c);
  if (!mine.ok) return c.json({ error: mine.err }, 403);
  if (mine.ids.length === 0) return c.json([]);
  const ph = mine.ids.map(() => '?').join(',');

  const cards = await c.env.DB.prepare(
    `SELECT h.id, h.student_id, h.title, h.total_lessons, h.used_lessons, h.status, h.valid_until,
       s.name AS student_name, co.name AS course_name, co.color AS course_color
     FROM hour_cards h
     LEFT JOIN students s ON s.id = h.student_id
     LEFT JOIN courses co ON co.id = h.course_id
     WHERE h.student_id IN (${ph})
     ORDER BY h.id DESC`,
  )
    .bind(...mine.ids)
    .all<{
      id: number;
      student_id: number;
      title: string | null;
      total_lessons: number;
      used_lessons: number;
      status: string;
      valid_until: string | null;
      student_name: string | null;
      course_name: string | null;
      course_color: string | null;
    }>();

  // 每张卡的流水（数量有限，直接带出）
  const today = beijingToday();
  const result = [];
  for (const card of cards.results) {
    const ledger = await c.env.DB.prepare(
      `SELECT id, change, balance_after, reason, ref_lesson_id, created_at
       FROM hour_ledger WHERE card_id = ? ORDER BY id DESC`,
    )
      .bind(card.id)
      .all<{
        id: number;
        change: number;
        balance_after: number;
        reason: string;
        ref_lesson_id: number | null;
        created_at: string;
      }>();
    result.push({
      ...card,
      balance: card.total_lessons - card.used_lessons,
      expired: card.valid_until !== null && card.valid_until < today,
      ledger: ledger.results,
    });
  }
  return c.json(result);
});
