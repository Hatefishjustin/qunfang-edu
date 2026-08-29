// 认证中间件：验签 JWT → 按 uid 查库校验账号状态（保证禁用/软删立即生效）
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppEnv, Role, UserSummary } from '../env';
import { verifyToken } from '../util/jwt';

type UserRow = {
  id: number;
  name: string;
  role: Role;
  campus_id: number | null;
  status: string;
  deleted_at: string | null;
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ error: '未登录' }, 401);

  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: '登录已过期，请重新登录' }, 401);

  // 每个请求都查一次 users 表，校验 active 且未软删
  const row = await c.env.DB.prepare(
    'SELECT id, name, role, campus_id, status, deleted_at FROM users WHERE id = ?',
  )
    .bind(payload.uid)
    .first<UserRow>();
  if (!row || row.status !== 'active' || row.deleted_at) {
    return c.json({ error: '账号不可用或已被禁用' }, 401);
  }

  const user: UserSummary = {
    id: row.id,
    name: row.name,
    role: row.role,
    campusId: row.campus_id,
  };
  c.set('user', user);
  await next();
});
