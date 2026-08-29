// 课程科目管理：campus_id 为 NULL 表示全校区通用
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr, readInt } from '../util/validate';

export const courseRoutes = new Hono<AppEnv>();
courseRoutes.use('*', requireAuth, requireRole('super_admin', 'campus_admin'));

type CourseRow = {
  id: number;
  campus_id: number | null;
  name: string;
  default_duration_min: number;
  color: string | null;
};

// ---------- 列表（campus_admin 看到 本校区 + 全局通用） ----------
courseRoutes.get('/', async (c) => {
  const campusId = queryCampus(c);
  const rows =
    campusId === null
      ? await c.env.DB.prepare(
          'SELECT id, campus_id, name, default_duration_min, color FROM courses ORDER BY id',
        ).all<CourseRow>()
      : await c.env.DB.prepare(
          'SELECT id, campus_id, name, default_duration_min, color FROM courses WHERE campus_id = ? OR campus_id IS NULL ORDER BY id',
        )
          .bind(campusId)
          .all<CourseRow>();
  return c.json(rows.results);
});

// ---------- 新建 ----------
courseRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  if (!name) return c.json({ error: '课程名称不能为空' }, 400);

  // super_admin 不传 campus_id = 建全局通用课程；campus_admin 强制本校区
  const campusId = writeCampus(c, b.campus_id);

  const duration = readInt(b.default_duration_min) ?? 90;
  const color = readStr(b.color) || null;

  const r = await c.env.DB.prepare(
    'INSERT INTO courses (campus_id, name, default_duration_min, color) VALUES (?, ?, ?, ?)',
  )
    .bind(campusId, name, duration, color)
    .run();
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});

/** 校验课程在操作者数据范围内（campus_admin 可操作 本校区 + 全局） */
async function findCourse(
  c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } },
  id: number,
): Promise<CourseRow | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, campus_id, name, default_duration_min, color FROM courses WHERE id = ?',
  )
    .bind(id)
    .first<CourseRow>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== null && row.campus_id !== me.campusId) {
    return null;
  }
  return row;
}

// ---------- 修改 ----------
courseRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const course = await findCourse(c, id);
  if (!course) return c.json({ error: '课程不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '课程名称不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }
  if ('default_duration_min' in b) {
    sets.push('default_duration_min = ?');
    binds.push(readInt(b.default_duration_min) ?? 90);
  }
  if ('color' in b) {
    sets.push('color = ?');
    binds.push(readStr(b.color) || null);
  }
  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

// ---------- 删除 ----------
courseRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const course = await findCourse(c, id);
  if (!course) return c.json({ error: '课程不存在' }, 404);

  // 有班级在用则拒绝删除
  const used = await c.env.DB.prepare('SELECT id FROM classes WHERE course_id = ? LIMIT 1')
    .bind(id)
    .first();
  if (used) return c.json({ error: '该课程下还有班级，无法删除' }, 400);

  await c.env.DB.prepare('DELETE FROM courses WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
