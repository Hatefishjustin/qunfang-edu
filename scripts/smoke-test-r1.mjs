#!/usr/bin/env node
// R1 冒烟自测：自助改密 + 校区看板接口
// 用法：node scripts/smoke-test-r1.mjs [baseUrl]（默认 http://127.0.0.1:8787）
// 前置：本地库已应用迁移并导入 seed（13800000001 / Passw0rd! 可登录）
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
  const suffix = String(Date.now()).slice(-7);
  const PHONE_NEW = `139${suffix}09`;

  // ---------- 准备：super_admin 登录 ----------
  console.log('[准备] super_admin 登录');
  const sa = await login('13800000001', 'Passw0rd!');
  check('super_admin 登录成功', sa.res.status === 200);
  const saCookie = sa.cookie;

  console.log('[1] 自助改密');
  // 建一个测试校区管理员账号（改密测试用，避免污染 seed 账号）
  const campusList = await (await authFetch(saCookie, '/api/campuses')).json();
  const campusA = campusList[0]?.id;
  const mk = await authFetch(saCookie, '/api/users', {
    method: 'POST',
    body: JSON.stringify({
      name: '改密测试员',
      phone: PHONE_NEW,
      password: 'OldPass123',
      role: 'campus_admin',
      campus_id: campusA,
    }),
  });
  check('创建测试账号', mk.status === 201, `${mk.status}`);

  // 未登录改密 → 401
  const noAuth = await fetch(`${base}/api/auth/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: 'OldPass123', newPassword: 'NewPass456' }),
  });
  check('未登录改密被拒（401）', noAuth.status === 401, `${noAuth.status}`);

  const u = await login(PHONE_NEW, 'OldPass123');
  check('新账号用初始密码登录成功', u.res.status === 200);
  const uCookie = u.cookie;

  // 旧密码错误 → 400
  const wrongOld = await authFetch(uCookie, '/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ oldPassword: 'WrongOld99', newPassword: 'NewPass456' }),
  });
  check('旧密码错误被拒（400）', wrongOld.status === 400, `${wrongOld.status}`);

  // 新密码太短 → 400
  const tooShort = await authFetch(uCookie, '/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ oldPassword: 'OldPass123', newPassword: '123' }),
  });
  check('新密码过短被拒（400）', tooShort.status === 400, `${tooShort.status}`);

  // 正常改密 → 200
  const ok = await authFetch(uCookie, '/api/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ oldPassword: 'OldPass123', newPassword: 'NewPass456' }),
  });
  check('改密成功', ok.status === 200, `${ok.status}`);

  // 旧密码再登录 → 401
  const reOld = await login(PHONE_NEW, 'OldPass123');
  check('旧密码登录失效（401）', reOld.res.status === 401, `${reOld.res.status}`);

  // 新密码登录 → 200
  const reNew = await login(PHONE_NEW, 'NewPass456');
  check('新密码登录成功', reNew.res.status === 200, `${reNew.res.status}`);

  console.log('[2] 校区看板 /api/stats/dashboard');
  // super_admin 全局视角
  const dashAll = await authFetch(saCookie, '/api/stats/dashboard');
  const dashAllBody = await dashAll.json().catch(() => null);
  check('super_admin 看板 200', dashAll.status === 200, `${dashAll.status}`);
  const hasFields =
    dashAllBody !== null &&
    typeof dashAllBody.date === 'string' &&
    typeof dashAllBody.today_lessons === 'number' &&
    typeof dashAllBody.week_lessons === 'number' &&
    typeof dashAllBody.active_classes === 'number' &&
    (dashAllBody.checkin_rate === null || typeof dashAllBody.checkin_rate === 'number') &&
    Array.isArray(dashAllBody.today_list);
  check('看板返回字段齐全', hasFields, JSON.stringify(dashAllBody)?.slice(0, 120));
  check(
    'today_list 数量与 today_lessons 一致',
    dashAllBody?.today_list?.length === dashAllBody?.today_lessons,
    `${dashAllBody?.today_list?.length} vs ${dashAllBody?.today_lessons}`,
  );
  check(
    'week_lessons >= today_lessons',
    dashAllBody?.week_lessons >= dashAllBody?.today_lessons,
  );
  check(
    'checkin_rate 为 0~100 整数或 null',
    dashAllBody?.checkin_rate === null ||
      (Number.isInteger(dashAllBody?.checkin_rate) &&
        dashAllBody.checkin_rate >= 0 &&
        dashAllBody.checkin_rate <= 100),
  );
  check(
    '今日列表含课程字段',
    dashAllBody?.today_list?.every(
      (l) => typeof l.id === 'number' && typeof l.start_time === 'string',
    ) ?? true,
  );

  // super_admin 按校区过滤：分校数据 <= 全局数据
  const dashA = await (await authFetch(saCookie, `/api/stats/dashboard?campus_id=${campusA}`)).json();
  check(
    '按校区过滤：今日课次不大于全局',
    dashA.today_lessons <= dashAllBody.today_lessons,
    `${dashA.today_lessons} vs ${dashAllBody.today_lessons}`,
  );

  // 不存在的校区 → 空数据
  const dashNone = await (
    await authFetch(saCookie, '/api/stats/dashboard?campus_id=999999')
  ).json();
  check('不存在校区返回空数据', dashNone.today_lessons === 0 && dashNone.today_list.length === 0);

  // campus_admin 视角（新账号属于校区 A）
  const dashMine = await authFetch(reNew.cookie, '/api/stats/dashboard');
  const dashMineBody = await dashMine.json().catch(() => null);
  check('campus_admin 看板 200', dashMine.status === 200, `${dashMine.status}`);
  check(
    'campus_admin 数据与按校区过滤一致',
    dashMineBody?.today_lessons === dashA.today_lessons &&
      dashMineBody?.active_classes === dashA.active_classes,
  );

  // teacher 无权访问 → 403
  const t = await login('13800000011', 'Passw0rd!');
  const teacherDash = await authFetch(t.cookie, '/api/stats/dashboard');
  check('teacher 访问看板被拒（403）', teacherDash.status === 403, `${teacherDash.status}`);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(1);
});
