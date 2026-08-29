// 用户管理路由（super_admin 全部 / campus_admin 本校区）
import { Hono } from 'hono';
import type { AppEnv, Role } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { campusScope } from '../middleware/campusScope';
import { hashPassword } from '../util/password';

const ROLES: Role[] = ['super_admin', 'campus_admin', 'teacher', 'parent', 'student'];
const DEFAULT_PASSWORD = 'Passw0rd!';

type UserRow = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  status: string;
  campus_id: number | null;
  campus_name: string | null;
  created_at: string;
};

export const userRoutes = new Hono<AppEnv>();
userRoutes.use('*', requireAuth, requireRole('super_admin', 'campus_admin'), campusScope);

function readStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validPhone(phone: string): boolean {
  return /^\d{6,20}$/.test(phone);
}

// ---------- 列表（分页 + 筛选） ----------
userRoutes.get('/', async (c) => {
  const role = readStr(c.req.query('role'));
  const status = readStr(c.req.query('status'));
  const campusId = c.get('campusId'); // super_admin 为 null 时=全部

  const page = Math.max(1, Number(c.req.query('page') ?? '1') || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? '20') || 20));

  const where: string[] = ['u.deleted_at IS NULL'];
  const binds: (string | number)[] = [];
  if (role && ROLES.includes(role as Role)) {
    where.push('u.role = ?');
    binds.push(role);
  }
  if (status === 'active' || status === 'disabled') {
    where.push('u.status = ?');
    binds.push(status);
  }
  if (campusId !== null) {
    where.push('u.campus_id = ?');
    binds.push(campusId);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first<{ total: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.phone, u.role, u.status, u.campus_id, c.name AS campus_name, u.created_at
     FROM users u LEFT JOIN campuses c ON c.id = u.campus_id
     WHERE ${whereSql}
     ORDER BY u.id DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<UserRow>();

  return c.json({ items: rows.results, total: totalRow?.total ?? 0, page, pageSize });
});

// ---------- 创建账号 ----------
userRoutes.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const name = readStr(b.name);
  const phone = readStr(b.phone);
  const role = readStr(b.role) as Role;
  const password = typeof b.password === 'string' && b.password !== '' ? b.password : DEFAULT_PASSWORD;

  if (!name) return c.json({ error: '姓名不能为空' }, 400);
  if (!validPhone(phone)) return c.json({ error: '手机号格式不正确' }, 400);
  if (!ROLES.includes(role)) return c.json({ error: '角色不合法' }, 400);
  if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);

  // campus_admin 不能创建总管理员
  if (me.role !== 'super_admin' && role === 'super_admin') {
    return c.json({ error: '没有权限创建总管理员账号' }, 403);
  }

  // 校区归属：super_admin 可指定；campus_admin 强制本校区；super_admin 角色本身跨校区（campus_id=NULL）
  let campusId: number | null;
  if (role === 'super_admin') {
    campusId = null;
  } else if (me.role === 'super_admin') {
    const n = Number(b.campus_id);
    campusId = Number.isInteger(n) && n > 0 ? n : null;
    if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);
  } else {
    campusId = me.campusId; // 忽略客户端传参
  }

  // 校区必须存在
  if (campusId !== null) {
    const campus = await c.env.DB.prepare(
      'SELECT id FROM campuses WHERE id = ? AND deleted_at IS NULL',
    )
      .bind(campusId)
      .first();
    if (!campus) return c.json({ error: '所属校区不存在' }, 400);
  }

  // 手机号唯一
  const dup = await c.env.DB.prepare(
    'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL',
  )
    .bind(phone)
    .first();
  if (dup) return c.json({ error: '该手机号已被使用' }, 400);

  const passwordHash = await hashPassword(password);
  const r = await c.env.DB.prepare(
    'INSERT INTO users (campus_id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(campusId, name, phone, passwordHash, role)
    .run();

  return c.json({ id: Number(r.meta.last_row_id), name, phone, role, campusId }, 201);
});

// ---------- 修改（改信息 / 重置密码 / 禁用启用 / 换校区换角色） ----------
userRoutes.patch('/:id', async (c) => {
  const me = c.get('user');
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const target = await c.env.DB.prepare(
    'SELECT id, name, phone, role, status, campus_id FROM users WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(id)
    .first<{
      id: number;
      name: string;
      phone: string;
      role: Role;
      status: string;
      campus_id: number | null;
    }>();
  if (!target) return c.json({ error: '用户不存在' }, 404);

  // campus_admin 只能管本校区、且不能动 super_admin 账号
  if (me.role === 'campus_admin') {
    if (target.role === 'super_admin' || target.campus_id !== me.campusId) {
      return c.json({ error: '没有权限修改该用户' }, 403);
    }
  }

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '姓名不能为空' }, 400);
    sets.push('name = ?');
    binds.push(name);
  }

  if ('phone' in b) {
    const phone = readStr(b.phone);
    if (!validPhone(phone)) return c.json({ error: '手机号格式不正确' }, 400);
    const dup = await c.env.DB.prepare(
      'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL AND id != ?',
    )
      .bind(phone, id)
      .first();
    if (dup) return c.json({ error: '该手机号已被使用' }, 400);
    sets.push('phone = ?');
    binds.push(phone);
  }

  if ('password' in b) {
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
    sets.push('password_hash = ?');
    binds.push(await hashPassword(password));
  }

  if ('status' in b) {
    const status = readStr(b.status);
    if (status !== 'active' && status !== 'disabled') {
      return c.json({ error: '状态不合法' }, 400);
    }
    if (status === 'disabled' && id === me.id) {
      return c.json({ error: '不能禁用自己的账号' }, 400);
    }
    sets.push('status = ?');
    binds.push(status);
  }

  // 换校区 / 换角色：仅 super_admin
  if ('campus_id' in b || 'role' in b) {
    if (me.role !== 'super_admin') {
      return c.json({ error: '只有总管理员可以修改校区或角色' }, 403);
    }
    if ('role' in b) {
      const role = readStr(b.role) as Role;
      if (!ROLES.includes(role)) return c.json({ error: '角色不合法' }, 400);
      sets.push('role = ?');
      binds.push(role);
      if (role === 'super_admin') {
        sets.push('campus_id = NULL');
      }
    }
    if ('campus_id' in b) {
      const n = Number(b.campus_id);
      const campusId = Number.isInteger(n) && n > 0 ? n : null;
      if (campusId !== null) {
        const campus = await c.env.DB.prepare(
          'SELECT id FROM campuses WHERE id = ? AND deleted_at IS NULL',
        )
          .bind(campusId)
          .first();
        if (!campus) return c.json({ error: '校区不存在' }, 400);
      }
      sets.push('campus_id = ?');
      binds.push(campusId);
    }
  }

  if (sets.length === 0) return c.json({ error: '没有需要修改的字段' }, 400);

  binds.push(id);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  return c.json({ ok: true });
});
