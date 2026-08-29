// 通过 Node spawn 调 tcb 部署云函数（避开 PowerShell 转义/包装层问题）
import { spawnSync } from 'node:child_process';

const TCB = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@cloudbase/cli/bin/tcb';
const args = ['fn', 'deploy', 'qunfang-server', '--httpFn', '--force'];
const r = spawnSync(process.execPath, [TCB, ...args], {
  stdio: ['pipe', 'inherit', 'inherit'],
  input: 'y\n',
  cwd: process.cwd(),
});
process.exit(r.status ?? 1);
