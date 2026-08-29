// 环境绑定类型定义
export type Env = {
  /** D1 数据库（业务数据） */
  DB: D1Database;
  /** KV（会话吊销黑名单、登录失败计数） */
  CACHE: KVNamespace;
  /** Workers Assets（前端 SPA 静态资源） */
  ASSETS: Fetcher;
  /** JWT 签名密钥（.dev.vars 本地 / wrangler secret 线上） */
  JWT_SECRET: string;
};

/** 五种角色 */
export type Role = 'super_admin' | 'campus_admin' | 'teacher' | 'parent' | 'student';

/** 登录用户摘要（会话与前端共享） */
export type UserSummary = {
  id: number;
  name: string;
  role: Role;
  campusId: number | null;
};

/** Hono 应用环境类型 */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: UserSummary;
    /** 本次请求的数据范围校区：super_admin 可为 null（全部），其他角色强制为自己所属校区 */
    campusId: number | null;
  };
};
