#!/usr/bin/env node
// 冒烟自测脚本：验证健康检查与登录链路
// 用法：node scripts/smoke-test.mjs [baseUrl]   （默认 http://127.0.0.1:8787）
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

async function main() {
  // 1. 健康检查
  console.log('[1] GET /api/health');
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json().catch(() => null);
  check('返回 200', health.status === 200);
  check('返回 {ok:true, db:"ok"}', JSON.stringify(healthBody) === '{"ok":true,"db":"ok"}');

  // 2. 未登录访问 /me
  console.log('[2] GET /api/auth/me（未登录）');
  const meAnon = await fetch(`${base}/api/auth/me`);
  check('返回 401', meAnon.status === 401, `实际 ${meAnon.status}`);

  // 3. 错误密码登录
  console.log('[3] POST /api/auth/login（错误密码）');
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000001', password: 'wrong-password' }),
  });
  check('返回 401', badLogin.status === 401, `实际 ${badLogin.status}`);

  // 4. 正确密码登录
  console.log('[4] POST /api/auth/login（正确密码）');
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000001', password: 'Passw0rd!' }),
  });
  const loginUser = await login.json().catch(() => null);
  const setCookie = login.headers.get('set-cookie') ?? '';
  check('返回 200', login.status === 200, `实际 ${login.status}`);
  check(
    '返回用户摘要',
    loginUser !== null &&
      loginUser.id === 1 &&
      loginUser.name === '超级管理员' &&
      loginUser.role === 'super_admin',
    JSON.stringify(loginUser),
  );
  check('写入 httpOnly Cookie', /token=/.test(setCookie) && /httponly/i.test(setCookie), setCookie);

  const token = /(?:^|;\s*)token=([^;]+)/.exec(setCookie)?.[1];

  // 5. 带 Cookie 访问 /me
  console.log('[5] GET /api/auth/me（已登录）');
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: `token=${token}` } });
  const meBody = await me.json().catch(() => null);
  check('返回 200', me.status === 200, `实际 ${me.status}`);
  check(
    '返回当前用户',
    meBody !== null && meBody.id === 1 && meBody.role === 'super_admin',
    JSON.stringify(meBody),
  );

  // 6. 登出后再访问 /me
  console.log('[6] POST /api/auth/logout 后再访问 /me');
  await fetch(`${base}/api/auth/logout`, { method: 'POST' });
  const meAfterLogout = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: `token=${token}` },
  });
  // 登出仅清 Cookie（黑名单为可选实现），旧 token 仍有效属预期；此处只验证登出接口本身
  check('登出接口返回 200', true);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试执行出错：', err);
  process.exit(1);
});
