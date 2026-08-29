// 学员管理：CRUD（软删）+ 搜索 + 详情（家长 / 报班记录）
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr, readInt, isValidDate } from '../util/validate';

export const studentRoutes = new Hono<AppEnv>();
studentRoutes.use('*', requireAuth);

// ---------- 列表（管理员 / teacher 受限只读）+ 搜索 ----------
studentRoutes.get('/', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const campusId = queryCampus(c);
  const search = readStr(c.req.query('search'));

  const where = ['s.deleted_at IS NULL'];
  const binds: (string | number)[] = [];
  if (campusId !== null) {
    where.push('s.campus_id = ?');
    binds.push(campusId);
  }
  if (search) {
    where.push('s.name LIKE ?');
    binds.push(`%${search}%`);
  }

  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.campus_id, s.name, s.grade, s.birth_date, s.note, s.user_id,
       (SELECT GROUP_CONCAT(p.name, '、') FROM parent_student ps
         JOIN parents p ON p.id = ps.parent_id AND p.deleted_at IS NULL
         WHERE ps.student_id = s.id) AS parent_names,
       (SELECT COUNT(*) FROM enrollments e
         WHERE e.student_id = s.id AND e.status = 'active') AS class_count
     FROM students s
     WHERE ${where.join(' AND ')}
     ORDER BY s.id DESC`,
  )
    .bind(...binds)
    .all<{
      id: number;
      campus_id: number;
      name: string;
      grade: string | null;
      birth_date: string | null;
      note: string | null;
      user_id: number | null;
      parent_names: string | null;
      class_count: number;
    }>();
  return c.json(rows.results);
});

// ---------- 学员详情（基本信息 + 家长 + 报班记录 + 课时卡） ----------
studentRoutes.get('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const me = c.get('user');
  const student = await c.env.DB.prepare(
    'SELECT id, campus_id, name, grade, birth_date, note, user_id, created_at FROM students WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{
      id: number;
      campus_id: number;
      name: string;
      grade: string | null;
      birth_date: string | null;
      note: string | null;
      user_id: number | null;
      created_at: string;
    }>();
  if (!student) return c.json({ error: '学员不存在' }, 404);
  if (me.role !== 'super_admin' && student.campus_id !== me.campusId) {
    return c.json({ error: '学员不存在' }, 404);
  }

  const [parents, enrollments, cards] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT p.id, p.name, p.relation, p.user_id FROM parent_student ps
       JOIN parents p ON p.id = ps.parent_id AND p.deleted_at IS NULL
       WHERE ps.student_id = ?`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT e.class_id, cl.name AS class_name, co.name AS course_name, e.enrolled_at
       FROM enrollments e
       JOIN classes cl ON cl.id = e.class_id
       JOIN courses co ON co.id = cl.course_id
       WHERE e.student_id = ? AND e.status = 'active'
       ORDER BY e.enrolled_at DESC`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, course_id, title, total_lessons, used_lessons, status, valid_until
       FROM hour_cards WHERE student_id = ? ORDER BY id DESC`,
    ).bind(id),
  ]);

  return c.json({
    ...student,
    parents: parents.results,
    enrollments: enrollments.results,
    cards: cards.results,
  });
});

// ---------- 新建 ----------
studentRoutes.post('/', requireRole('super_admin', 'campus_admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  if (!name) return c.json({ error: '学员姓名不能为空' }, 400);

  const campusId = writeCampus(c, b.campus_id);
  if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);

  const grade = readStr(b.grade) || null;
  const birthDate = readStr(b.birth_date);
  if (birthDate && !isValidDate(birthDate)) return c.json({ error: '出生日期格式不正确' }, 400);
  const note = readStr(b.note) || null;

  const r = await c.env.DB.prepare(
    'INSERT INTO students (campus_id, name, grade, birth_date, note) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(campusId, name, grade, birthDate || null, note)
    .run();
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});

/** 校验学员在操作者数据范围内 */
async function findStudent(
  c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } },
  id: number,
): Promise<{ id: number; campus_id: number } | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, campus_id FROM students WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{ id: number; campus_id: number }>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== me.campusId) return null;
  return row;
}

// ---------- 修改 ----------
studentRoutes.patch('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findStudent(c, id);
  if (!target) return c.json({ error: '学员不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '学员姓名不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }
  if ('grade' in b) {
    sets.push('grade = ?');
    binds.push(readStr(b.grade) || null);
  }
  if ('birth_date' in b) {
    const birthDate = readStr(b.birth_date);
    if (birthDate && !isValidDate(birthDate)) {
      return c.json({ error: '出生日期格式不正确' }, 400);
    }
    sets.push('birth_date = ?');
    binds.push(birthDate || null);
  }
  if ('note' in b) {
    sets.push('note = ?');
    binds.push(readStr(b.note) || null);
  }
  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

// ---------- 软删除（历史课表/流水仍可追溯） ----------
studentRoutes.delete('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findStudent(c, id);
  if (!target) return c.json({ error: '学员不存在' }, 404);

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE students SET deleted_at = datetime('now') WHERE id = ?").bind(id),
    // 同时结束其报班关系（历史流水不受影响）
    c.env.DB.prepare(
      "UPDATE enrollments SET status = 'ended' WHERE student_id = ? AND status = 'active'",
    ).bind(id),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});
