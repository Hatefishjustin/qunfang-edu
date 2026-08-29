// 教室管理：本校区 CRUD
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr, readInt } from '../util/validate';

export const roomRoutes = new Hono<AppEnv>();
roomRoutes.use('*', requireAuth, requireRole('super_admin', 'campus_admin'));

type RoomRow = { id: number; campus_id: number; name: string; capacity: number | null };

// ---------- 列表 ----------
roomRoutes.get('/', async (c) => {
  const campusId = queryCampus(c);
  if (campusId === null) {
    const rows = await c.env.DB.prepare(
      'SELECT id, campus_id, name, capacity FROM rooms ORDER BY campus_id, name',
    ).all<RoomRow>();
    return c.json(rows.results);
  }
  const rows = await c.env.DB.prepare(
    'SELECT id, campus_id, name, capacity FROM rooms WHERE campus_id = ? ORDER BY name',
  )
    .bind(campusId)
    .all<RoomRow>();
  return c.json(rows.results);
});

// ---------- 新建 ----------
roomRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  if (!name) return c.json({ error: '教室名称不能为空' }, 400);

  const campusId = writeCampus(c, b.campus_id);
  if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);

  const r = await c.env.DB.prepare('INSERT INTO rooms (campus_id, name, capacity) VALUES (?, ?, ?)')
    .bind(campusId, name, readInt(b.capacity))
    .run();
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});

/** 校验教室在操作者数据范围内 */
async function findRoom(c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } }, id: number): Promise<RoomRow | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, campus_id, name, capacity FROM rooms WHERE id = ?')
    .bind(id)
    .first<RoomRow>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== me.campusId) return null;
  return row;
}

// ---------- 修改 ----------
roomRoutes.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const room = await findRoom(c, id);
  if (!room) return c.json({ error: '教室不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '教室名称不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }
  if ('capacity' in b) {
    sets.push('capacity = ?');
    binds.push(readInt(b.capacity));
  }
  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

// ---------- 删除 ----------
roomRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const room = await findRoom(c, id);
  if (!room) return c.json({ error: '教室不存在' }, 404);

  await c.env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
