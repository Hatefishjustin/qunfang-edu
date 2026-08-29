// 在函数目录内安装运行时依赖（pg）
// 关键：用 cwd 方式而非 --prefix —— --prefix 会从仓库根解析 npm workspaces，
// 把整个项目以 Junction 形式链接进 node_modules，导致 tcb 打 zip 时递归损坏
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, rmSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('cloudbase/functions/qunfang-server');

const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
  cwd: outDir,
  stdio: 'inherit',
  shell: true,
});
if (r.status !== 0) {
  console.error('[install-cloudbase-deps] npm install 失败');
  process.exit(r.status ?? 1);
}

// 保险：清理可能混入的 workspace Junction（指回仓库根，会打坏 zip）
const stray = path.join(outDir, 'node_modules', 'qunfang-edu');
if (existsSync(stray) && lstatSync(stray).isSymbolicLink()) {
  rmSync(stray, { force: true });
  console.warn('[install-cloudbase-deps] 已清理误入的 workspace 链接 qunfang-edu');
}

console.log('[install-cloudbase-deps] 依赖安装完成');
