# 群芳教育管理系统（网页端 MVP）

培训机构排课 / 考勤 / 课时卡管理系统。技术栈：Cloudflare Workers + Hono + D1 + KV，前端 Vite + React 18 + TypeScript + Tailwind v4。双云部署：同一套代码同时跑在 Cloudflare Workers（海外）与腾讯 CloudBase（国内直连）。

## 线上地址（双云）

| 入口 | 地址 | 适用 |
| --- | --- | --- |
| CloudBase（腾讯云，国内推荐） | <https://qunfang-d6gfpeiow40f97899.service.tcloudbase.com/> | 国内不翻墙直连 |
| Cloudflare Workers | <https://qunfang-edu.3099316459.workers.dev> | 海外访问 |

两朵云数据各自独立（都灌有一份完整演示数据），测试账号通用。

## 测试账号（密码统一 `Passw0rd!`）

| 手机号 | 角色 | 说明 |
| --- | --- | --- |
| 13800000001 | super_admin | 超级管理员，全局看板 / 校区 / 用户管理 |
| 13800000002 | campus_admin | 阳光广场校区管理员，登录后落地页为校区看板 |
| 13800000003 | campus_admin | 滨江校区管理员 |
| 13800000011 | teacher | 教师（阳光广场 · 张雨薇），课表 / 可用时间 / 点名 |
| 13800000012 | teacher | 教师（阳光广场 · 李文轩） |
| 13800000021 | parent | 家长（王芳，2 个孩子的课表与课时卡） |
| 13800000031 | student | 学员（谢雨萱，自己的课表与课时卡） |

演示数据含 2 个校区、16 名教师、40 名学员、40 张课时卡、未来两周课表（详见 `seed/seed.sql`，可重复执行不会产生重复数据）。所有角色均可在右上角"改密"按钮自助修改密码。

## 本地开发

```bash
npm install            # 安装依赖（npm workspaces：根 + web/）
npx wrangler d1 migrations apply qunfang --local   # 本地库迁移
npx wrangler d1 execute qunfang --local --file=seed/seed.sql  # 种子数据（可选）
npx wrangler dev --port 8787     # 启动后端 + 前端静态资源 http://localhost:8787
```

前端单独开发调试：`npm run dev -w web`（Vite 代理到 8787）。

## 部署

### Cloudflare（海外入口）

```bash
npm run deploy         # 构建前端 + wrangler deploy（需已登录 wrangler）
npx wrangler d1 migrations apply qunfang --remote   # 线上库迁移（有变更时）
```

### CloudBase（国内入口）

```bash
npm run cloudbase:deploy   # 打包 + 装依赖 + tcb 云函数部署（需已 tcb login）
```

部署链先执行前端生产构建，再串联三个脚本：`build-cloudbase.mjs`（esbuild 打包服务端 + 复制最新 `web/dist`）→ `install-cloudbase-deps.mjs`（函数目录内装 pg 依赖）→ `deploy-cloudbase-fn.mjs`（Node spawn 直调 tcb，避开 PowerShell 包装层）。

> 历史坑：曾用 `npm install --prefix cloudbase/functions/qunfang-server` 装依赖，该方式会从仓库根解析 npm workspaces，把整个项目以 Junction 链接进函数包 node_modules，导致 tcb 打出的 zip 损坏、线上代码不更新（表象是"部署成功但行为不变"）。现已改为 cwd 方式安装并兜底清理，勿改回 --prefix。

## 自测脚本

```bash
node scripts/smoke-test-m2.mjs http://localhost:8787   # 认证 / 校区 / 用户 / 越权
node scripts/smoke-test-m3.mjs http://localhost:8787   # 基础数据 CRUD
node scripts/smoke-test-m4.mjs http://localhost:8787   # 排课与冲突
node scripts/smoke-test-m5.mjs http://localhost:8787   # 课时卡与考勤
node scripts/smoke-test-m6.mjs http://localhost:8787   # 端到端验收（需先导入 seed）
node scripts/smoke-test-r1.mjs http://localhost:8787   # 自助改密 + 校区看板
node scripts/smoke-batch2.mjs http://localhost:8787    # 学员状态 / 跟进 / 课堂内容
node scripts/smoke-r8.mjs http://localhost:8787        # 调课 / 请假 / 通知 / 课堂反馈权限
```

脚本可传线上地址（如 `node scripts/smoke-test-r1.mjs https://qunfang-d6gfpeiow40f97899.service.tcloudbase.com`）做线上回归。

## 部署记录

- 2026-08-28：v1.x 全部里程碑（M1–M6）完成，Cloudflare 侧部署并验收。
- 2026-08-29：CloudBase 双云部署完成（HTTP 云函数 `qunfang-server` + PG 15 表 + 种子数据）；R1 功能补缺（自助改密 + 校区看板）双云上线，线上冒烟 m2 25/25、r1 20/20 全绿；Cloudflare 版本 `19b51f7d`。
- 2026-08-29：git 仓库初始化，首次提交 `4be91f3`（密钥文件均不入库）。
- 2026-08-30：R7 全界面 Liquid Glass 设计系统双云上线；Cloudflare 版本 `b463c572-d132-4844-b69a-b4a9c3dd1931`，CloudBase `qunfang-server` 更新完成；两端健康检查正常并加载同一 CSS `index-DV61iKTH.css`。同时修复 CloudBase 打包链复制陈旧 `server/web-dist` 的问题。

## 已知问题与限制

1. `*.workers.dev` 域名在国内被 DNS 污染，大陆网络不翻墙不可达 Cloudflare 入口——国内访问请用 CloudBase 入口（已解决访问问题；如需品牌域名见 HANDOFF.md 10.3）。
2. CloudBase 免费体验版 2027-02-27 到期，到期前需续费或迁移（共享集群 PG，无直连地址，走 `exec_sql` RPC 通道）。
3. 无单元测试，质量由八个冒烟脚本（本地基线 228 项断言）保障。
4. 移动端 375px 人工走查（登录→看课表→点名完整流程）建议交付前在手机浏览器过一遍。

需求文档见仓库根 `HANDOFF.md`。
