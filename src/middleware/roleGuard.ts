// 角色守卫：限制接口只允许指定角色访问（需在 requireAuth 之后使用）
import { createMiddleware } from 'hono/factory';
import type { AppEnv, Role } from '../env';

export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
      return c.json({ error: '没有权限执行此操作' }, 403);
    }
    await next();
  });
}
