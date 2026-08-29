// 校区管理路由（仅 super_admin）
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';

type CampusRow = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  teacher_count: number;
  student_count: number;
  class_count: number;
};

export const campusRoutes = new Hono<AppEnv>();
campusRoutes.use('*', requireAuth, requireRole('super_admin'));

/** 读取并校验请求体中的字符串字段 */
function readStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// ---------- 列表（含各校区数据概览） ----------
campusRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.address, c.phone, c.created_at,
      (SELECT COUNT(*) FROM users u
        WHERE u.campus_id = c.id AND u.role = 'teacher'
          AND u.deleted_at IS NULL AND u.status = 'active') AS teacher_count,
      (SELECT COUNT(*) FROM students s
        WHERE s.campus_id = c.id AND s.deleted_at IS NULL) AS student_count,
      (SELECT COUNT(*) FROM classes cl
        WHERE cl.campus_id = c.id AND cl.status = 'active') AS class_count
    FROM campuses c
    WHERE c.deleted_at IS NULL
    ORDER BY c.id
  `).all<CampusRow>();
  return c.json(rows.results);
});

// ---------- 新建 ----------
campusRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = readStr((body as Record<string, unknown> | null)?.name);
  if (!name) return c.json({ error: '校区名称不能为空' }, 400);

  const address = readStr((body as Record<string, unknown>)?.address) || null;
  const phone = readStr((body as Record<string, unknown>)?.phone) || null;

  const r = await c.env.DB.prepare(
    'INSERT INTO campuses (name, address, phone) VALUES (?, ?, ?)',
  )
    .bind(name, address, phone)
    .run();
  return c.json({ id: Number(r.meta.last_row_id), name, address, phone }, 201);
});

// ---------- 修改 ----------
campusRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  if ('name' in b && !name) return c.json({ error: '校区名称不能为空' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM campuses WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first();
  if (!existing) return c.json({ error: '校区不存在' }, 404);

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if ('name' in b) {
    sets.push('name = ?');
    binds.push(name);
  }
  if ('address' in b) {
    sets.push('address = ?');
    binds.push(readStr(b.address) || null);
  }
  if ('phone' in b) {
    sets.push('phone = ?');
    binds.push(readStr(b.phone) || null);
  }
  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE campuses SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return c.json({ ok: true });
});

// ---------- 软删除 ----------
campusRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const r = await c.env.DB.prepare(
    "UPDATE campuses SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
  )
    .bind(id)
    .run();
  if (r.meta.changes === 0) return c.json({ error: '校区不存在' }, 404);
  return c.json({ ok: true });
});
