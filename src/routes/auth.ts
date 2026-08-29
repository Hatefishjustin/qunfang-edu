// 认证路由：登录 / 登出 / 当前用户 / 修改密码
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Role, UserSummary } from '../env';
import { requireAuth } from '../middleware/auth';
import { verifyPassword, hashPassword } from '../util/password';
import { signToken } from '../util/jwt';

/** Cookie 名 */
const TOKEN_COOKIE = 'token';

/** 登录失败锁定：5 次失败锁 10 分钟（KV key: fail:<phone>） */
const MAX_FAILS = 5;
const LOCK_SECONDS = 600;

type LoginBody = { phone?: unknown; password?: unknown };

type UserRow = {
  id: number;
  name: string;
  role: Role;
  campus_id: number | null;
  status: string;
  deleted_at: string | null;
  password_hash: string;
};

function toSummary(row: UserRow): UserSummary {
  return { id: row.id, name: row.name, role: row.role, campusId: row.campus_id };
}

export const authRoutes = new Hono<AppEnv>();

// ---------- 登录 ----------
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => null);
  const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!phone || !password) {
    return c.json({ error: '请输入手机号和密码' }, 400);
  }

  // 登录失败计数（KV）
  const failKey = `fail:${phone}`;
  const fails = Number((await c.env.CACHE.get(failKey)) ?? '0');
  if (fails >= MAX_FAILS) {
    return c.json({ error: '失败次数过多，账号已锁定 10 分钟' }, 429);
  }

  const row = await c.env.DB.prepare(
    'SELECT id, name, role, campus_id, status, deleted_at, password_hash FROM users WHERE phone = ?',
  )
    .bind(phone)
    .first<UserRow>();

  const ok = row !== null && row.status === 'active' && row.deleted_at === null
    && (await verifyPassword(password, row.password_hash));

  if (!ok) {
    await c.env.CACHE.put(failKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
    // 统一错误文案，不区分"账号不存在"与"密码错误"
    return c.json({ error: '手机号或密码错误' }, 401);
  }

  await c.env.CACHE.delete(failKey);

  const token = await signToken(
    { uid: row.id, role: row.role, campusId: row.campus_id },
    c.env.JWT_SECRET,
  );
  // 线上 https 置 Secure；本地 dev 为 http 不加
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: 7 * 24 * 3600,
  });

  return c.json(toSummary(row));
});

// ---------- 登出 ----------
authRoutes.post('/logout', (c) => {
  deleteCookie(c, TOKEN_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ---------- 当前用户 ----------
authRoutes.get('/me', requireAuth, (c) => {
  return c.json(c.get('user'));
});

// ---------- 修改密码 ----------
type PasswordBody = { oldPassword?: unknown; newPassword?: unknown };

authRoutes.patch('/password', requireAuth, async (c) => {
  const body = await c.req.json<PasswordBody>().catch(() => null);
  const oldPassword = typeof body?.oldPassword === 'string' ? body.oldPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (!oldPassword || !newPassword) {
    return c.json({ error: '请输入旧密码和新密码' }, 400);
  }
  if (newPassword.length < 6) {
    return c.json({ error: '新密码至少 6 位' }, 400);
  }
  if (newPassword === oldPassword) {
    return c.json({ error: '新密码不能与旧密码相同' }, 400);
  }

  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ id: number; password_hash: string }>();
  if (!row) return c.json({ error: '账号不存在' }, 404);

  const ok = await verifyPassword(oldPassword, row.password_hash);
  if (!ok) return c.json({ error: '旧密码错误' }, 400);

  const hash = await hashPassword(newPassword);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(hash, user.id)
    .run();

  return c.json({ ok: true });
});
