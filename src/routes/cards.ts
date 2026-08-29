// 课时卡管理：售课（自动建卡+purchase 流水）/ 列表 / 手工调整 / 卡流水
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { isValidDate, readStr, readInt } from '../util/validate';

export const cardRoutes = new Hono<AppEnv>();
cardRoutes.use('*', requireAuth, requireRole('super_admin', 'campus_admin'));

type CardRow = {
  id: number;
  campus_id: number;
  student_id: number;
  course_id: number;
  title: string | null;
  total_lessons: number;
  used_lessons: number;
  status: string;
  valid_until: string | null;
  created_at: string;
  student_name: string | null;
  course_name: string | null;
};

// ---------- 列表（可按学员/状态筛选） ----------
cardRoutes.get('/', async (c) => {
  const campusId = queryCampus(c);
  const q = c.req.query();

  const where: string[] = ['1=1'];
  const binds: (string | number)[] = [];
  if (campusId !== null) {
    where.push('h.campus_id = ?');
    binds.push(campusId);
  }
  if (q.student_id !== undefined && q.student_id !== '') {
    where.push('h.student_id = ?');
    binds.push(Number(q.student_id));
  }
  if (q.status !== undefined && q.status !== '') {
    where.push('h.status = ?');
    binds.push(q.status);
  }

  const rows = await c.env.DB.prepare(
    `SELECT h.*, s.name AS student_name, co.name AS course_name
     FROM hour_cards h
     LEFT JOIN students s ON s.id = h.student_id
     LEFT JOIN courses co ON co.id = h.course_id
     WHERE ${where.join(' AND ')}
     ORDER BY h.id DESC`,
  )
    .bind(...binds)
    .all<CardRow>();
  return c.json(rows.results);
});

// ---------- 售课：建卡 + purchase 流水（同一事务） ----------
cardRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const studentId = readInt(b.student_id);
  const courseId = readInt(b.course_id);
  const totalLessons = readInt(b.total_lessons);
  const title = readStr(b.title) || null;
  const validUntil = readStr(b.valid_until) || null;

  if (studentId === null) return c.json({ error: '请选择学员' }, 400);
  if (courseId === null) return c.json({ error: '请选择科目（课程）' }, 400);
  if (totalLessons === null || totalLessons < 1) return c.json({ error: '课时数需为正整数' }, 400);
  if (validUntil !== null && !isValidDate(validUntil)) return c.json({ error: '有效期格式不正确' }, 400);

  // 学员与课程校验（同校区；课程可为全局通用或本校区）
  const student = await c.env.DB.prepare(
    'SELECT id, campus_id FROM students WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(studentId)
    .first<{ id: number; campus_id: number }>();
  if (!student) return c.json({ error: '学员不存在' }, 400);
  const course = await c.env.DB.prepare('SELECT id, campus_id FROM courses WHERE id = ?')
    .bind(courseId)
    .first<{ id: number; campus_id: number | null }>();
  if (!course) return c.json({ error: '课程不存在' }, 400);
  if (course.campus_id !== null && course.campus_id !== student.campus_id) {
    return c.json({ error: '课程与学员不在同一校区' }, 400);
  }

  const campusId = writeCampus(c, student.campus_id);
  const me = c.get('user');
  const operatorId = me.id;

  // 建卡 + 购课流水（同一 batch 事务，保证账实一致）
  const insertCard = c.env.DB.prepare(
    'INSERT INTO hour_cards (campus_id, student_id, course_id, title, total_lessons, used_lessons, status, valid_until) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
  ).bind(campusId, studentId, courseId, title, totalLessons, 'active', validUntil);
  // 先插卡拿 id 再写流水：D1 batch 内无法引用上一条的自增 id，
  // 改为子查询取 MAX(id)（同事务内即刚插入的卡）
  await c.env.DB.batch([
    insertCard,
    c.env.DB.prepare(
      `INSERT INTO hour_ledger (card_id, student_id, change, balance_after, reason, operator_id)
       SELECT id, student_id, total_lessons, total_lessons, 'purchase', ? FROM hour_cards WHERE rowid = last_insert_rowid()`,
    ).bind(operatorId),
  ]);

  const card = await c.env.DB.prepare(
    'SELECT id FROM hour_cards WHERE student_id = ? AND course_id = ? ORDER BY id DESC LIMIT 1',
  )
    .bind(studentId, courseId)
    .first<{ id: number }>();
  return c.json({ id: card?.id ?? 0 }, 201);
});

// ---------- 手工调整（±N，必填备注，写 adjust 流水） ----------
cardRoutes.post('/:id/adjust', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');

  const card = await c.env.DB.prepare('SELECT * FROM hour_cards WHERE id = ?')
    .bind(id)
    .first<CardRow>();
  if (!card) return c.json({ error: '课时卡不存在' }, 404);
  if (me.role === 'campus_admin' && card.campus_id !== me.campusId) {
    return c.json({ error: '课时卡不存在' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const change = Number(b.change);
  const note = readStr(b.note);
  if (!Number.isInteger(change) || change === 0) {
    return c.json({ error: '调整数量需为非零整数' }, 400);
  }
  if (!note) return c.json({ error: '调整必须填写备注' }, 400);

  // 调整改的是卡总量（如赠送/纠错），保证调后总量不小于已用
  const newTotal = card.total_lessons + change;
  if (newTotal < card.used_lessons) {
    return c.json({ error: '调整后总课时不能小于已用课时' }, 400);
  }

  const balanceAfter = newTotal - card.used_lessons;
  const status = balanceAfter <= 0 ? 'exhausted' : 'active';

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE hour_cards SET total_lessons = ?, status = ? WHERE id = ?').bind(
      newTotal,
      status,
      id,
    ),
    c.env.DB.prepare(
      "INSERT INTO hour_ledger (card_id, student_id, change, balance_after, reason, operator_id) VALUES (?, ?, ?, ?, 'adjust', ?)",
    ).bind(id, card.student_id, change, balanceAfter, me.id),
  ]);
  return c.json({ ok: true, total_lessons: newTotal, balance: balanceAfter });
});

// ---------- 卡流水 ----------
cardRoutes.get('/:id/ledger', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');

  const card = await c.env.DB.prepare('SELECT id, campus_id FROM hour_cards WHERE id = ?')
    .bind(id)
    .first<{ id: number; campus_id: number }>();
  if (!card) return c.json({ error: '课时卡不存在' }, 404);
  if (me.role === 'campus_admin' && card.campus_id !== me.campusId) {
    return c.json({ error: '课时卡不存在' }, 404);
  }

  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.change, l.balance_after, l.reason, l.ref_lesson_id, l.created_at,
       u.name AS operator_name
     FROM hour_ledger l LEFT JOIN users u ON u.id = l.operator_id
     WHERE l.card_id = ? ORDER BY l.id DESC`,
  )
    .bind(id)
    .all<{
      id: number;
      change: number;
      balance_after: number;
      reason: string;
      ref_lesson_id: number | null;
      created_at: string;
      operator_name: string | null;
    }>();
  return c.json(rows.results);
});
