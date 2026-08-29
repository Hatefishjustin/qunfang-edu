// 校区数据隔离（安全关键）：
// - super_admin：可用 ?campus_id= 筛选，缺省 = 全部（null）
// - 其他角色：强制使用自己所属校区，忽略客户端传入的任何 campus_id
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

export const campusScope = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (user.role === 'super_admin') {
    const raw = c.req.query('campus_id');
    const n = raw !== undefined && raw !== '' ? Number(raw) : null;
    c.set('campusId', n !== null && Number.isInteger(n) && n > 0 ? n : null);
  } else {
    // 非 super_admin：无视客户端传参，强制本校区
    c.set('campusId', user.campusId);
  }
  await next();
});
