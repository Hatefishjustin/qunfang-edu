// 一键执行：设置 ROUTE_JSON 后直接调 tcb（避免 shell 转义破坏 JSON）
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const data = readFileSync('routes.json', 'utf8').trim();
const TCB = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@cloudbase/cli/bin/tcb';
const args = ['routes', 'edit', '--data', data, '--json'];
const r = spawnSync(process.execPath, [TCB, ...args], { stdio: ['pipe', 'inherit', 'inherit'], input: 'y\n' });
process.exit(r.status ?? 1);
