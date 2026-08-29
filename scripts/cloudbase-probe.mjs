// 探针脚本：验证 CloudBase PostgREST RPC 通道（exec_sql 函数）
// 用法：node scripts/cloudbase-probe.mjs
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
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

console.log('--- 测试 1: 单条 SELECT ---');
console.log(JSON.stringify(await callRpc(['SELECT 42 AS answer']), null, 2));

console.log('--- 测试 2: 多条混合（SELECT + DML 建表/删表）---');
console.log(JSON.stringify(await callRpc([
  'CREATE TABLE IF NOT EXISTS __probe_t (id int)',
  'INSERT INTO __probe_t VALUES (1), (2)',
  'SELECT count(*) AS c FROM __probe_t',
  'DROP TABLE __probe_t',
]), null, 2));

console.log('--- 测试 3: 查看数据库里 exec_sql 实际源码 ---');
const r3 = await callRpc(["SELECT prosrc FROM pg_proc WHERE proname='exec_sql'"]);
console.log(r3.body[0]?.rows?.[0]?.prosrc ?? JSON.stringify(r3));

console.log('--- 测试 4: 数据完整性（表清单 + 行数）---');
const r4 = await callRpc([
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1",
  "SELECT (SELECT count(*) FROM campuses) AS campuses, (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM hour_cards) AS cards, (SELECT count(*) FROM lessons) AS lessons",
]);
console.log('表清单:', JSON.stringify(r4.body?.[0]?.rows?.map((r) => r.table_name)));
console.log('行数:', JSON.stringify(r4.body?.[1]?.rows));
if (r4.status !== 200) console.log('错误:', JSON.stringify(r4.body));
