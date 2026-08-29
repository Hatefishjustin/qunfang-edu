// 校区范围解析：读 / 写两种场景（需在 requireAuth 之后使用）
import type { Context } from 'hono';
import type { AppEnv } from '../env';

/** 查询范围：super_admin 可用 ?campus_id= 筛选（null=全部），其他角色强制本校区 */
export function queryCampus(c: Context<AppEnv>): number | null {
  const user = c.get('user');
  if (user.role === 'super_admin') {
    const raw = c.req.query('campus_id');
    const n = raw !== undefined && raw !== '' ? Number(raw) : null;
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  }
  return user.campusId;
}

/** 写入操作：super_admin 用 body 里的 campus_id（null=全局/通用），其他角色强制本校区 */
export function writeCampus(c: Context<AppEnv>, bodyCampusId: unknown): number | null {
  const user = c.get('user');
  if (user.role === 'super_admin') {
    const n =
      bodyCampusId === null || bodyCampusId === undefined || bodyCampusId === ''
        ? null
        : Number(bodyCampusId);
    return n !== null && Number.isInteger(n) && n > 0 ? n : null;
  }
  return user.campusId;
}
