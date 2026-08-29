// 教师管理：列表（含负荷统计）/ 创建（账号+档案）/ 编辑档案 / 软删 / 可用时间规则
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { hashPassword } from '../util/password';
import { queryCampus, writeCampus } from '../util/scope';
import { readStr, readInt, isValidTime } from '../util/validate';
import { thisMonday, addDays } from '../util/time';

export const teacherRoutes = new Hono<AppEnv>();
teacherRoutes.use('*', requireAuth);

type TeacherRow = {
  id: number;
  name: string;
  phone: string;
  status: string;
  campus_id: number | null;
  subject: string | null;
  bio: string | null;
  sort_no: number;
  rule_count: number;
  week_load: number;
};

// ---------- 列表（管理员 / teacher 只读本校区） ----------
teacherRoutes.get('/', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const campusId = queryCampus(c);
  const monday = thisMonday();
  const sunday = addDays(monday, 6);

  const where = ["u.role = 'teacher'", 'u.deleted_at IS NULL'];
  const binds: (string | number)[] = [];
  if (campusId !== null) {
    where.push('u.campus_id = ?');
    binds.push(campusId);
  }

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.phone, u.status, u.campus_id,
       tp.subject, tp.bio, tp.sort_no,
       (SELECT COUNT(*) FROM availability_rules ar WHERE ar.teacher_id = u.id) AS rule_count,
       (SELECT COUNT(*) FROM lessons l
         WHERE l.teacher_id = u.id AND l.status != 'cancelled'
           AND l.date >= ? AND l.date <= ?) AS week_load
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY tp.sort_no, u.id`,
  )
    .bind(monday, sunday, ...binds)
    .all<TeacherRow>();
  return c.json(rows.results);
});

// ---------- 创建教师（users + teacher_profiles 同事务） ----------
teacherRoutes.post('/', requireRole('super_admin', 'campus_admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  const name = readStr(b.name);
  const phone = readStr(b.phone);
  const password = typeof b.password === 'string' && b.password !== '' ? b.password : 'Passw0rd!';
  if (!name) return c.json({ error: '姓名不能为空' }, 400);
  if (!/^\d{6,20}$/.test(phone)) return c.json({ error: '手机号格式不正确' }, 400);
  if (password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);

  const campusId = writeCampus(c, b.campus_id);
  if (campusId === null) return c.json({ error: '请选择所属校区' }, 400);

  const campus = await c.env.DB.prepare(
    'SELECT id FROM campuses WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(campusId)
    .first();
  if (!campus) return c.json({ error: '校区不存在' }, 400);

  const dup = await c.env.DB.prepare(
    'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL',
  )
    .bind(phone)
    .first();
  if (dup) return c.json({ error: '该手机号已被使用' }, 400);

  const subject = readStr(b.subject) || null;
  const bio = readStr(b.bio) || null;
  const sortNo = readInt(b.sort_no) ?? 0;
  const passwordHash = await hashPassword(password);

  const uid = await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO users (campus_id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ).bind(campusId, name, phone, passwordHash, 'teacher'),
  ]).then((r) => Number(r[0].meta.last_row_id));

  await c.env.DB.prepare(
    'INSERT INTO teacher_profiles (user_id, campus_id, subject, bio, sort_no) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(uid, campusId, subject, bio, sortNo)
    .run();

  return c.json({ id: uid, name, phone, campusId }, 201);
});

/** 校验目标教师存在且在操作者数据范围内 */
async function findTeacher(
  c: { env: { DB: D1Database }; get: (k: 'user') => { id: number; role: string; campusId: number | null } },
  id: number,
): Promise<{ id: number; campus_id: number | null } | null> {
  const me = c.get('user');
  const row = await c.env.DB.prepare(
    "SELECT id, campus_id FROM users WHERE id = ? AND role = 'teacher' AND deleted_at IS NULL",
  )
    .bind(id)
    .first<{ id: number; campus_id: number | null }>();
  if (!row) return null;
  if (me.role !== 'super_admin' && row.campus_id !== me.campusId) return null;
  return row;
}

// ---------- 编辑档案（含基本信息） ----------
teacherRoutes.patch('/:id/profile', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const target = await findTeacher(c, id);
  if (!target) return c.json({ error: '教师不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const b = (body ?? {}) as Record<string, unknown>;

  // users 表字段
  const userSets: string[] = [];
  const userBinds: (string | number)[] = [];
  if ('name' in b) {
    const name = readStr(b.name);
    if (!name) return c.json({ error: '姓名不能为空' }, 400);
    userSets.push('name = ?');
    userBinds.push(name);
  }
  if ('phone' in b) {
    const phone = readStr(b.phone);
    if (!/^\d{6,20}$/.test(phone)) return c.json({ error: '手机号格式不正确' }, 400);
    const dup = await c.env.DB.prepare(
      'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL AND id != ?',
    )
      .bind(phone, id)
      .first();
    if (dup) return c.json({ error: '该手机号已被使用' }, 400);
    userSets.push('phone = ?');
    userBinds.push(phone);
  }
  if ('status' in b) {
    const status = readStr(b.status);
    if (status !== 'active' && status !== 'disabled') return c.json({ error: '状态不合法' }, 400);
    userSets.push('status = ?');
    userBinds.push(status);
  }

  // teacher_profiles 表字段
  const profSets: string[] = [];
  const profBinds: (string | number | null)[] = [];
  if ('subject' in b) {
    profSets.push('subject = ?');
    profBinds.push(readStr(b.subject) || null);
  }
  if ('bio' in b) {
    profSets.push('bio = ?');
    profBinds.push(readStr(b.bio) || null);
  }
  if ('sort_no' in b) {
    profSets.push('sort_no = ?');
    profBinds.push(readInt(b.sort_no) ?? 0);
  }

  if (userSets.length === 0 && profSets.length === 0) {
    return c.json({ error: '没有需要修改的字段' }, 400);
  }

  const stmts: D1PreparedStatement[] = [];
  if (userSets.length > 0) {
    userBinds.push(id);
    stmts.push(
      c.env.DB.prepare(`UPDATE users SET ${userSets.join(', ')} WHERE id = ?`).bind(...userBinds),
    );
  }
  if (profSets.length > 0) {
    profBinds.push(id);
    stmts.push(
      c.env.DB.prepare(
        `UPDATE teacher_profiles SET ${profSets.join(', ')} WHERE user_id = ?`,
      ).bind(...profBinds),
    );
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ---------- 软删教师账号 ----------
teacherRoutes.delete('/:id', requireRole('super_admin', 'campus_admin'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const target = await findTeacher(c, id);
  if (!target) return c.json({ error: '教师不存在' }, 404);

  await c.env.DB.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
  return c.json({ ok: true });
});

// ---------- 可用时间规则：查询 ----------
teacherRoutes.get('/:id/availability', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');

  // teacher 只能看自己的
  if (me.role === 'teacher' && me.id !== id) {
    return c.json({ error: '没有权限' }, 403);
  }
  const target = await findTeacher(c, id);
  if (!target) return c.json({ error: '教师不存在' }, 404);

  const rows = await c.env.DB.prepare(
    'SELECT id, weekday, start_time, end_time, kind FROM availability_rules WHERE teacher_id = ? ORDER BY weekday, start_time',
  )
    .bind(id)
    .all<{
      id: number;
      weekday: number;
      start_time: string;
      end_time: string;
      kind: string;
    }>();
  return c.json(rows.results);
});

// ---------- 可用时间规则：整表替换（PUT 全量覆盖） ----------
teacherRoutes.put('/:id/availability', requireRole('super_admin', 'campus_admin', 'teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');

  // teacher 只能改自己的
  if (me.role === 'teacher' && me.id !== id) {
    return c.json({ error: '没有权限' }, 403);
  }
  const target = await findTeacher(c, id);
  if (!target) return c.json({ error: '教师不存在' }, 404);

  const body = await c.req.json().catch(() => null);
  const rules = (body as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules) || rules.length > 100) {
    return c.json({ error: '规则格式不正确' }, 400);
  }

  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM availability_rules WHERE teacher_id = ?').bind(id),
  ];
  for (const raw of rules) {
    const r = raw as Record<string, unknown>;
    const weekday = Number(r.weekday);
    const start = readStr(r.start_time);
    const end = readStr(r.end_time);
    const kind = readStr(r.kind) || 'available';
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return c.json({ error: '星期不合法' }, 400);
    }
    if (!isValidTime(start) || !isValidTime(end) || start >= end) {
      return c.json({ error: '时间段格式不正确（需 HH:MM 且开始早于结束）' }, 400);
    }
    if (kind !== 'available' && kind !== 'unavailable') {
      return c.json({ error: '规则类型不合法' }, 400);
    }
    stmts.push(
      c.env.DB.prepare(
        'INSERT INTO availability_rules (teacher_id, weekday, start_time, end_time, kind) VALUES (?, ?, ?, ?, ?)',
      ).bind(id, weekday, start, end, kind),
    );
  }

  await c.env.DB.batch(stmts);
  return c.json({ ok: true, count: rules.length });
});
