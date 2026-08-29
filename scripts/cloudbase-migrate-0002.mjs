// CloudBase PG 迁移执行器：把 db/postgres/0002 按语句拆分后经 exec_sql RPC 逐条执行
// 用法：node scripts/cloudbase-migrate-0002.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const key = readFileSync(path.join(here, '..', '.cloudbase-apikey.txt'), 'utf8').trim();
const ENV = 'qunfang-d6gfpeiow40f97899';
const URL_BASE = `https://${ENV}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/exec_sql`;

async function callRpc(sqls) {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_sqls: sqls }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// 幂等检查：students 表是否已有 status 列
const check = await callRpc([
  `SELECT column_name FROM information_schema.columns WHERE table_name='students' AND column_name='status'`,
]);
const hasStatus = (check.body?.[0]?.rows ?? []).length > 0;
console.log('前置检查：students.status 已存在 =', hasStatus);
if (hasStatus) {
  console.log('迁移已应用过，跳过。');
  process.exit(0);
}

const raw = readFileSync(path.join(here, '..', 'db', 'postgres', '0002_student_status_followups_lesson_content.sql'), 'utf8');
// 去注释行后按分号拆分
const statements = raw
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`待执行 ${statements.length} 条语句：`);
statements.forEach((s, i) => console.log(`  [${i + 1}] ${s.slice(0, 70).replace(/\n/g, ' ')}…`));

const r = await callRpc(statements);
if (r.status !== 200) {
  console.error('迁移失败：', JSON.stringify(r.body).slice(0, 500));
  process.exit(1);
}
// exec_sql 返回数组，检查每条是否报错
const results = Array.isArray(r.body) ? r.body : [];
results.forEach((item, i) => {
  if (item?.error) {
    console.error(`语句 [${i + 1}] 出错：`, item.error);
    process.exit(1);
  }
});
console.log(`\n✅ 全部 ${statements.length} 条语句执行成功`);

// 验证
const verify = await callRpc([
  `SELECT column_name FROM information_schema.columns WHERE table_name='students' AND column_name='status'`,
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('followups','lesson_files','lesson_comments') ORDER BY 1`,
]);
console.log('验证 status 列：', JSON.stringify(verify.body?.[0]?.rows));
console.log('验证新表：', JSON.stringify(verify.body?.[1]?.rows));
