// 家长管理：CRUD（软删）+ 家长-学员多对多关联维护
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr } from '../util/validate';
import { hashPassword } from '../util/password';

export const parentRoutes = new Hono<AppEnv>();
parentRoutes.use('*', requireAuth);

// ---------- 列表 ----------
parentRoutes.get('/', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const campusId = queryCampus(c);

  const where = ['p.deleted_at IS NULL'];
  const binds: (string | number)[] = [];
  if (campusId !== null) {
    where.push('p.campus_id = ?');
    binds.push(campusId);
  }

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.campus_id, p.name, p.relation, p.user_id, u.phone,
       (SELECT GROUP_CONCAT(s.name, '、') FROM parent_student ps
         JOIN students s ON s.id = ps.student_id AND s.deleted_at IS NULL
         WHERE ps.parent_id = p.id) AS student_names
     FROM parents p
     LEFT JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL
     WHERE ${where.join(' AND ')}
     ORDER BY p.id DESC`,
  )
    .bind(...binds)
    .all<{
      id: number;
      campus_id: number;
      name: string;
      relation: string | null;
      user_id: number | null;
      phone: string | null;
      student_names: string | null;
    }>();
  return c.json(rows.results);
});

/** 校验家长在操作者数据范围内 */
async function findParent(
  c: { env: { DB: D1Database }; get: (k: 'user') => { role: string; campusId: number | null } },
  id: number,
): Promise<{ id: number; campus_id: number; user_id: number | null } | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, campus_id, user_id FROM parents WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{ id: number; campus_id: number; user_id: number | null }>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== me.campusId) return null;
  return row;
}

/** 校验 student_ids 均属于指定校区，返回合法 ID 列表 */
async function validStudentIds(
  db: D1Database,
  campusId: number,
  ids: unknown,
): Promise<number[] | null> {
  if (!Array.isArray(ids)) return null;
  const list: number[] = [];
  for (const v of ids) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    const s = await db
      .prepare('SELECT id FROM students WHERE id = ? AND campus_id = ? AND deleted_at IS NULL')
      .bind(n, campusId)
      .first();
    if (!s) return null;
    list.push(n);
  }
  return list;
}

// ---------- 新建（可同时创建登录账号 + 关联学员） ----------
parentRoutes.post('/', requireRole('super_admin', 'campus_admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;
  const name = readStr(b.name);
  if (!name) return c.json({ error: '家长姓名不能为空' }, 400);

  const campusId = writeCampus(c, b.campus_id);
  if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);

  const relation = readStr(b.relation) || null;

  // 可选：同时创建登录账号
  let userId: number | null = null;
  const phone = readStr(b.phone);
  if (phone) {
    if (!/^\d{6,20}$/.test(phone)) return c.json({ error: '手机号格式不正确' }, 400);
    const dup = await c.env.DB.prepare(
      'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL',
    )
      .bind(phone)
      .first();
    if (dup) return c.json({ error: '该手机号已被使用' }, 400);

    const password = typeof b.password === 'string' && b.password !== '' ? b.password : 'Passw0rd!';
    if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
    const passwordHash = await hashPassword(password);

    const r = await c.env.DB.prepare(
      "INSERT INTO users (campus_id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, 'parent')",
    )
      .bind(campusId, name, phone, passwordHash)
      .run();
    userId = Number(r.meta.last_row_id);
  }

  const studentIds = b.student_ids === undefined ? [] : await validStudentIds(c.env.DB, campusId, b.student_ids);
  if (studentIds === null) return c.json({ error: '关联学员不合法' }, 400);

  const r = await c.env.DB.prepare(
    'INSERT INTO parents (campus_id, user_id, name, relation) VALUES (?, ?, ?, ?)',
  )
    .bind(campusId, userId, name, relation)
    .run();
  const parentId = Number(r.meta.last_row_id);

  if (studentIds.length > 0) {
    await c.env.DB.batch(
      studentIds.map((sid) =>
        c.env.DB.prepare('INSERT INTO parent_student (parent_id, student_id) VALUES (?, ?)').bind(
          parentId,
          sid,
        ),
      ),
    );
  }

  return c.json({ id: parentId, userId, studentIds }, 201);
});

// ---------- 修改（含关联关系整表替换） ----------
parentRoutes.patch('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findParent(c, id);
  if (!target) return c.json({ error: '家长不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '家长姓名不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }
  if ('relation' in b) {
    sets.push('relation = ?');
    binds.push(readStr(b.relation) || null);
  }

  const stmts: D1PreparedStatement[] = [];
  if (sets.length > 0) {
    binds.push(id);
    stmts.push(
      c.env.DB.prepare(`UPDATE parents SET ${sets.join(', ')} WHERE id = ?`).bind(...binds),
    );
  }

  if ('student_ids' in b) {
    const studentIds = await validStudentIds(c.env.DB, target.campus_id, b.student_ids);
    if (studentIds === null) return c.json({ error: '关联学员不合法' }, 400);
    stmts.push(c.env.DB.prepare('DELETE FROM parent_student WHERE parent_id = ?').bind(id));
    for (const sid of studentIds) {
      stmts.push(
        c.env.DB.prepare('INSERT INTO parent_student (parent_id, student_id) VALUES (?, ?)').bind(
          id,
          sid,
        ),
      );
    }
  }

  if (stmts.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ---------- 软删除（不删登录账号；如需禁用账号去用户管理） ----------
parentRoutes.delete('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const target = await findParent(c, id);
  if (!target) return c.json({ error: '家长不存在' }, 404);

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE parents SET deleted_at = datetime('now') WHERE id = ?").bind(id),
    c.env.DB.prepare('DELETE FROM parent_student WHERE parent_id = ?').bind(id),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});
