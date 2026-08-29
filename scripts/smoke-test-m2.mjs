#!/usr/bin/env node
// M2 冒烟自测：认证中间件 / 角色守卫 / 校区数据隔离 / 用户管理
// 用法：node scripts/smoke-test-m2.mjs [baseUrl]（默认 http://127.0.0.1:8787）
// 前置：本地库已应用迁移 0001 且有 seed 管理员（13800000001 / Passw0rd!）
const base = process.argv[2] ?? 'http://127.0.0.1:8787';

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function login(phone, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const cookie = /(?:^|;\s*)token=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  return { res, cookie };
}

function authFetch(cookie, path, init = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: `token=${cookie}`, ...(init.headers ?? {}) },
  });
}

async function main() {
  // 每次运行使用随机手机号，保证脚本可重复执行
  const suffix = String(Date.now()).slice(-7);
  const PHONE_ADMIN_A = `139${suffix}01`;
  const PHONE_TEACHER_A = `139${suffix}02`;
  const PHONE_ADMIN_B = `139${suffix}03`;
  const PHONE_EXTRA_A = `139${suffix}04`;

  // ---------- 准备：super_admin 登录 ----------
  console.log('[准备] super_admin 登录');
  const sa = await login('13800000001', 'Passw0rd!');
  check('super_admin 登录成功', sa.res.status === 200);
  const saCookie = sa.cookie;

  // ---------- 建两个测试校区 ----------
  console.log('[1] 校区 CRUD');
  const c1 = await authFetch(saCookie, '/api/campuses', {
    method: 'POST',
    body: JSON.stringify({ name: `测试校区A${suffix}`, address: 'A 地', phone: '0571-111' }),
  });
  const c1Body = await c1.json().catch(() => null);
  check('创建校区A', c1.status === 201 && c1Body?.id > 0, `${c1.status}`);
  const campusA = c1Body.id;

  const c2 = await authFetch(saCookie, '/api/campuses', {
    method: 'POST',
    body: JSON.stringify({ name: `测试校区B${suffix}`, address: 'B 地' }),
  });
  const c2Body = await c2.json().catch(() => null);
  check('创建校区B', c2.status === 201 && c2Body?.id > 0, `${c2.status}`);
  const campusB = c2Body.id;

  const listRes = await authFetch(saCookie, '/api/campuses');
  const list = await listRes.json().catch(() => null);
  check('校区列表含数据概览', Array.isArray(list) && list.length >= 2 && 'teacher_count' in list[0]);

  const upd = await authFetch(saCookie, `/api/campuses/${campusA}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: '测试校区A', phone: '0571-222' }),
  });
  check('修改校区', upd.status === 200, `${upd.status}`);

  // ---------- 创建三种角色账号 ----------
  console.log('[2] 用户创建（含越权）');
  const mk = async (body) =>
    authFetch(saCookie, '/api/users', { method: 'POST', body: JSON.stringify(body) });

  const adminA = await mk({ name: '排课老师甲', phone: PHONE_ADMIN_A, role: 'campus_admin', campus_id: campusA });
  const adminABody = await adminA.json().catch(() => null);
  check('创建校区A排课老师', adminA.status === 201, `${adminA.status} ${JSON.stringify(adminABody)}`);

  const teacherA = await mk({ name: '上课老师甲', phone: PHONE_TEACHER_A, role: 'teacher', campus_id: campusA });
  check('创建校区A上课老师', teacherA.status === 201, `${teacherA.status}`);

  const adminB = await mk({ name: '排课老师乙', phone: PHONE_ADMIN_B, role: 'campus_admin', campus_id: campusB });
  const adminBBody = await adminB.json().catch(() => null);
  check('创建校区B排课老师', adminB.status === 201, `${adminB.status}`);
  const userB = adminBBody?.id;

  const dupPhone = await mk({ name: '重复手机号', phone: PHONE_ADMIN_A, role: 'teacher', campus_id: campusA });
  check('重复手机号被拒绝', dupPhone.status === 400, `${dupPhone.status}`);

  // ---------- campus_admin 权限边界 ----------
  console.log('[3] campus_admin 越权测试');
  const ca = await login(PHONE_ADMIN_A, 'Passw0rd!');
  const caCookie = ca.cookie;
  check('campus_admin 登录成功', ca.res.status === 200);

  const r1 = await authFetch(caCookie, '/api/campuses');
  check('访问校区管理返回 403', r1.status === 403, `${r1.status}`);

  const r2 = await authFetch(caCookie, '/api/users');
  const r2Body = await r2.json().catch(() => null);
  check('用户列表仅本校区', r2.status === 200 && r2Body?.items?.length > 0 &&
    r2Body.items.every((u) => u.campus_id === campusA), JSON.stringify(r2Body?.items?.map((u) => u.campus_id)));

  const r3 = await authFetch(caCookie, '/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: '偷偷建超管', phone: `139${suffix}99`, role: 'super_admin' }),
  });
  check('创建 super_admin 被拒', r3.status === 403, `${r3.status}`);

  // 带别人的 campus_id 建账号 → 强制落回本校区
  const r4 = await authFetch(caCookie, '/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: '越权校区测试', phone: PHONE_EXTRA_A, role: 'teacher', campus_id: campusB }),
  });
  const r4Body = await r4.json().catch(() => null);
  check('伪造 campus_id 被忽略（落回本校区）', r4.status === 201 && r4Body?.campusId === campusA,
    `${r4.status} ${JSON.stringify(r4Body)}`);

  // 改别的校区的用户 → 403
  const r5 = await authFetch(caCookie, `/api/users/${userB}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: '改名' }),
  });
  check('跨校区改用户返回 403', r5.status === 403, `${r5.status}`);

  // ---------- teacher 权限边界 ----------
  console.log('[4] teacher 越权测试');
  const t = await login(PHONE_TEACHER_A, 'Passw0rd!');
  const tCookie = t.cookie;
  check('teacher 登录成功', t.res.status === 200);

  const t1 = await authFetch(tCookie, '/api/users');
  check('访问用户管理返回 403', t1.status === 403, `${t1.status}`);
  const t2 = await authFetch(tCookie, '/api/campuses');
  check('访问校区管理返回 403', t2.status === 403, `${t2.status}`);

  // ---------- 禁用 / 重置密码 ----------
  console.log('[5] 禁用与重置密码');
  const dis = await authFetch(saCookie, `/api/users/${userB}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'disabled' }),
  });
  check('super_admin 禁用账号', dis.status === 200, `${dis.status}`);

  const loginDisabled = await login(PHONE_ADMIN_B, 'Passw0rd!');
  check('被禁用账号登录被拒', loginDisabled.res.status === 401, `${loginDisabled.res.status}`);

  const en = await authFetch(saCookie, `/api/users/${userB}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active' }),
  });
  check('重新启用账号', en.status === 200, `${en.status}`);

  const reset = await authFetch(saCookie, `/api/users/${userB}`, {
    method: 'PATCH',
    body: JSON.stringify({ password: 'NewPass123' }),
  });
  check('重置密码', reset.status === 200, `${reset.status}`);

  const newLogin = await login(PHONE_ADMIN_B, 'NewPass123');
  check('用新密码登录成功', newLogin.res.status === 200, `${newLogin.res.status}`);
  const oldLogin = await login(PHONE_ADMIN_B, 'Passw0rd!');
  check('旧密码登录失败', oldLogin.res.status === 401, `${oldLogin.res.status}`);

  // 不能禁用自己
  const selfDis = await authFetch(saCookie, '/api/users/1', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'disabled' }),
  });
  check('不能禁用自己', selfDis.status === 400, `${selfDis.status}`);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
