# 群芳教育管理系统（网页端 MVP）

培训机构排课 / 考勤 / 课时卡管理系统。技术栈：Cloudflare Workers + Hono + D1 + KV，前端 Vite + React 18 + TypeScript + Tailwind v4。

线上地址：<https://qunfang-edu.3099316459.workers.dev>

## 测试账号（密码统一 `Passw0rd!`）

| 手机号 | 角色 | 说明 |
| --- | --- | --- |
| 13800000001 | super_admin | 超级管理员，全局看板 / 校区 / 用户管理 |
| 13800000002 | campus_admin | 阳光广场校区管理员 |
| 13800000003 | campus_admin | 滨江校区管理员 |
| 13800000011 | teacher | 教师（阳光广场 · 张雨薇），课表 / 可用时间 / 点名 |
| 13800000012 | teacher | 教师（阳光广场 · 李文轩） |
| 13800000021 | parent | 家长（王芳，2 个孩子的课表与课时卡） |
| 13800000031 | student | 学员（谢雨萱，自己的课表与课时卡） |

演示数据含 2 个校区、16 名教师、40 名学员、40 张课时卡、未来两周课表（详见 `seed/seed.sql`，可重复执行不会产生重复数据）。

## 本地开发

```bash
npm install            # 安装依赖（npm workspaces：根 + web/）
npx wrangler d1 migrations apply qunfang --local   # 本地库迁移
npx wrangler d1 execute qunfang --local --file=seed/seed.sql  # 种子数据（可选）
npx wrangler dev --port 8787     # 启动后端 + 前端静态资源 http://localhost:8787
```

前端单独开发调试：`npm run dev -w web`（Vite 代理到 8787）。

## 部署

```bash
npm run build -w web   # 构建前端到 web/dist
npm run deploy         # wrangler deploy（需已登录 wrangler）
npx wrangler d1 migrations apply qunfang --remote   # 线上库迁移（有变更时）
```

## 自测脚本

```bash
node scripts/smoke-test-m2.mjs http://localhost:8787   # 认证 / 校区 / 用户
node scripts/smoke-test-m3.mjs http://localhost:8787   # 基础数据 CRUD
node scripts/smoke-test-m4.mjs http://localhost:8787   # 排课与冲突
node scripts/smoke-test-m5.mjs http://localhost:8787   # 课时卡与考勤
node scripts/smoke-test-m6.mjs http://localhost:8787   # 端到端验收（需先导入 seed）
```

需求文档见仓库根 `HANDOFF.md`。
