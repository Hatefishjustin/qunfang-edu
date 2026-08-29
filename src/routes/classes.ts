// 班级管理：CRUD（删除=归档）+ 报班/退班
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr, readInt } from '../util/validate';

export const classRoutes = new Hono<AppEnv>();
classRoutes.use('*', requireAuth, requireRole('super_admin', 'campus_admin'));

type ClassRow = {
  id: number;
  campus_id: number;
  course_id: number;
  name: string;
  head_teacher_id: number | null;
  capacity: number;
  status: string;
  course_name: string | null;
  course_color: string | null;
  head_teacher_name: string | null;
  enrolled_count: number;
};

// ---------- 列表 ----------
classRoutes.get('/', async (c) => {
  const campusId = queryCampus(c);
  const where = campusId === null ? 'cl.status = ?' : 'cl.campus_id = ? AND cl.status = ?';

  const rows = await c.env.DB.prepare(
    `SELECT cl.id, cl.campus_id, cl.course_id, cl.name, cl.head_teacher_id, cl.capacity, cl.status,
       co.name AS course_name, co.color AS course_color,
       u.name AS head_teacher_name,
       (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = cl.id AND e.status = 'active') AS enrolled_count
     FROM classes cl
     LEFT JOIN courses co ON co.id = cl.course_id
     LEFT JOIN users u ON u.id = cl.head_teacher_id AND u.deleted_at IS NULL
     WHERE ${where}
     ORDER BY cl.id DESC`,
  )
    .bind(...(campusId === null ? ['active'] : [campusId, 'active']))
    .all<ClassRow>();
  return c.json(rows.results);
});

// ---------- 新建 ----------
classRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  const courseId = readInt(b.course_id);
  if (!name) return c.json({ error: '班级名称不能为空' }, 400);
  if (courseId === null) return c.json({ error: '请选择课程' }, 400);

  const campusId = writeCampus(c, b.campus_id);
  if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);

  // 课程必须是全局或本校区
  const course = await c.env.DB.prepare(
    'SELECT id, campus_id FROM courses WHERE id = ?',
  )
    .bind(courseId)
    .first<{ id: number; campus_id: number | null }>();
  if (!course || (course.campus_id !== null && course.campus_id !== campusId)) {
    return c.json({ error: '课程不存在或不属于该校区' }, 400);
  }

  const headTeacherId = readInt(b.head_teacher_id);
  // 主班老师必须属于本校区
  if (headTeacherId !== null) {
    const teacher = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND role = 'teacher' AND campus_id = ? AND deleted_at IS NULL",
    )
      .bind(headTeacherId, campusId)
      .first();
    if (!teacher) return c.json({ error: '主班老师不存在或不属于该校区' }, 400);
  }

  const capacity = readInt(b.capacity) ?? 12;
  const r = await c.env.DB.prepare(
    'INSERT INTO classes (campus_id, course_id, name, head_teacher_id, capacity) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(campusId, courseId, name, headTeacherId, capacity)
    .run();
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});

/** 校验班级在操作者数据范围内 */
async function findClass(
  c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } },
  id: number,
): Promise<{ id: number; campus_id: number } | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, campus_id FROM classes WHERE id = ?')
    .bind(id)
    .first<{ id: number; campus_id: number }>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== me.campusId) return null;
  return row;
}

// ---------- 修改 ----------
classRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findClass(c, id);
  if (!target) return c.json({ error: '班级不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '班级名称不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }
  if ('head_teacher_id' in b) {
    const headTeacherId = readInt(b.head_teacher_id);
    if (headTeacherId !== null) {
      const teacher = await c.env.DB.prepare(
        "SELECT id FROM users WHERE id = ? AND role = 'teacher' AND campus_id = ? AND deleted_at IS NULL",
      )
        .bind(headTeacherId, target.campus_id)
        .first();
      if (!teacher) return c.json({ error: '主班老师不存在' }, 400);
    }
    sets.push('head_teacher_id = ?');
    binds.push(headTeacherId);
  }
  if ('capacity' in b) {
    sets.push('capacity = ?');
    binds.push(readInt(b.capacity) ?? 12);
  }
  if ('status' in b) {
    const status = readStr(b.status);
    if (status !== 'active' && status !== 'archived') return c.json({ error: '状态不合法' }, 400);
    sets.push('status = ?');
    binds.push(status);
  }
  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE classes SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

// ---------- 删除（归档） ----------
classRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findClass(c, id);
  if (!target) return c.json({ error: '班级不存在' }, 404);

  await c.env.DB.prepare("UPDATE classes SET status = 'archived' WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ---------- 班级学员列表 ----------
classRoutes.get('/:id/enrollments', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findClass(c, id);
  if (!target) return c.json({ error: '班级不存在' }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT e.student_id, s.name, s.grade, e.enrolled_at
     FROM enrollments e
     JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
     WHERE e.class_id = ? AND e.status = 'active'
     ORDER BY s.name`,
  )
    .bind(id)
    .all<{ student_id: number; name: string; grade: string | null; enrolled_at: string }>();
  return c.json(rows.results);
});

// ---------- 报班 ----------
classRoutes.post('/:id/enrollments', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findClass(c, id);
  if (!target) return c.json({ error: '班级不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const studentId = readInt((body as Record<string, unknown> | null)?.student_id);
  if (studentId === null) return c.json({ error: '请选择学员' }, 400);

  // 学员必须属于同校区
  const student = await c.env.DB.prepare(
    'SELECT id, campus_id FROM students WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(studentId)
    .first<{ id: number; campus_id: number }>();
  if (!student || student.campus_id !== target.campus_id) {
    return c.json({ error: '学员不存在或不属于该校区' }, 400);
  }

  // 班级人数上限
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND status = 'active'",
  )
    .bind(id)
    .first<{ n: number }>();
  const capacity = await c.env.DB.prepare('SELECT capacity FROM classes WHERE id = ?')
    .bind(id)
    .first<{ capacity: number }>();
  if (count && capacity && count.n >= capacity.capacity) {
    return c.json({ error: '班级人数已满' }, 400);
  }

  try {
    await c.env.DB.prepare(
      'INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)',
    )
      .bind(id, studentId)
      .run();
  } catch (err) {
    // UNIQUE 冲突 = 已报过班
    if (String(err).includes('UNIQUE')) {
      return c.json({ error: '该学员已在班级中' }, 400);
    }
    throw err;
  }
  return c.json({ ok: true }, 201);
});

// ---------- 退班 ----------
classRoutes.delete('/:id/enrollments/:studentId', async (c) => {
  const id = Number(c.req.param('id'));
  const studentId = Number(c.req.param('studentId'));
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(studentId) || studentId <= 0) {
    return c.json({ error: '参数错误' }, 400);
  }
  const target = await findClass(c, id);
  if (!target) return c.json({ error: '班级不存在' }, 404);

  const r = await c.env.DB.prepare(
    'DELETE FROM enrollments WHERE class_id = ? AND student_id = ?',
  )
    .bind(id, studentId)
    .run();
  if (r.meta.changes === 0) return c.json({ error: '该学员不在班级中' }, 404);
  return c.json({ ok: true });
});
