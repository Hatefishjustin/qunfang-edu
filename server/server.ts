// Node 入口：HTTP 云函数（CloudBase）/ 本地 Node 通用服务器
// 同一个 Hono app：API 路由 + 前端静态资源 + SPA 兜底，与 Cloudflare Worker 行为对等
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../src/app';
import { PgD1 } from './pg-d1';
import { RpcD1 } from './rpc-d1';
import { MemoryKv } from './memory-kv';
import type { Env } from '../src/env';

const here = path.dirname(fileURLToPath(import.meta.url));

// 运行时环境注入（等价于 Workers 的 bindings）
// 两种数据库模式（二选一）：
//   1. DATABASE_URL         —— PostgreSQL 直连（本地/付费版有连接串时）
//   2. CLOUDBASE_ENV + CLOUDBASE_APIKEY —— CloudBase RPC 通道（免费体验版走 exec_sql 函数）
function buildEnv(): Env {
  if (!process.env.JWT_SECRET) {
    throw new Error('缺少 JWT_SECRET 环境变量');
  }
  const dbUrl = process.env.DATABASE_URL;
  const cbEnv = process.env.CLOUDBASE_ENV;
  const cbKey = process.env.CLOUDBASE_APIKEY;
  let db: unknown;
  if (dbUrl) {
    db = new PgD1(dbUrl);
  } else if (cbEnv && cbKey) {
    db = new RpcD1(cbEnv, cbKey);
  } else {
    throw new Error('缺少数据库配置：需要 DATABASE_URL（直连）或 CLOUDBASE_ENV + CLOUDBASE_APIKEY（RPC）');
  }
  return {
    DB: db as unknown as Env['DB'],
    CACHE: new MemoryKv() as unknown as Env['CACHE'],
    JWT_SECRET: process.env.JWT_SECRET,
  } satisfies Omit<Env, 'ASSETS'> as unknown as Env;
}

const app = createApp();
const env = buildEnv();

// 前端静态资源（web 构建产物），放在 API 路由之后
const webDist = path.join(here, 'web-dist');
app.use(
  '*',
  serveStatic({
    root: webDist,
    // 命中目录时自动补 index.html（如 / → /index.html）
    rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p),
  }),
);
// SPA 路由兜底：未命中的非 API 路径一律返回 index.html（前端路由接管）
app.get('*', serveStatic({ path: path.join(webDist, 'index.html') }));

const port = Number(process.env.PORT ?? 9000);
serve({
  fetch: (request) => app.fetch(request, env),
  port,
  hostname: '0.0.0.0',
});

console.log(`[qunfang-edu] server listening on :${port}`);
