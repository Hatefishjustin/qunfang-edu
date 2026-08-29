// Workers 入口：Hono API 路由 + SPA 静态资源兜底（静态资源由 wrangler [assets] 层托管）
import { createApp } from './app';

const app = createApp();

export default app;
