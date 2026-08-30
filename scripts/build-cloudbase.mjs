// 构建 CloudBase HTTP 云函数部署包
// 产物：cloudbase/function/（index.js 单文件 + web-dist 前端 + scf_bootstrap + package.json）
// 用法：node scripts/build-cloudbase.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('cloudbase/functions/qunfang-server');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 服务端打包：src + server 全部捆成一个 ESM 文件，pg 留在 node_modules（运行时 require）
await build({
  entryPoints: ['server/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(outDir, 'index.js'),
  external: ['pg'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// 前端静态资源：cloudbase:build 会先生成最新的 web/dist
cpSync('web/dist', path.join(outDir, 'web-dist'), { recursive: true });

// 启动引导文件（必须 LF 行尾 + 固定文件名）
writeFileSync(path.join(outDir, 'scf_bootstrap'), '#!/bin/bash\n/var/lang/node20/bin/node index.js\n', 'utf8');

// 函数自身的 package.json（type: module，pg 为运行时依赖）
writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify(
    {
      name: 'qunfang-server',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: { pg: '^8.16.0' },
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log('[build-cloudbase] 部署包已生成: cloudbase/functions/qunfang-server/');
console.log('[build-cloudbase] 下一步: 在该目录 npm install --omit=dev，然后 tcb fn deploy');
