// 快速诊断：登录后拉学员/家长列表，打印真实错误
const base = process.argv[2] ?? 'http://127.0.0.1:9000';

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800000001', password: 'Passw0rd!' }),
});
const cookie = /(?:^|;\s*)token=([^;]+)/.exec(login.headers.get('set-cookie') ?? '')?.[1];
console.log('登录:', login.status, cookie ? 'ok' : 'fail');
if (!cookie) process.exit(1);

for (const path of ['/api/students', '/api/parents', '/api/campuses']) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: `token=${cookie}` } });
  const text = await res.text();
  console.log(`\nGET ${path} → ${res.status}`);
  console.log(text.slice(0, 300));
}
