// Hono 应用本体：API 路由（不含运行时入口，供 Workers 与 Node 双端复用）
import { Hono } from 'hono';
import type { AppEnv } from './env';
import { authRoutes } from './routes/auth';
import { campusRoutes } from './routes/campuses';
import { userRoutes } from './routes/users';
import { teacherRoutes } from './routes/teachers';
import { roomRoutes } from './routes/rooms';
import { courseRoutes } from './routes/courses';
import { classRoutes } from './routes/classes';
import { studentRoutes } from './routes/students';
import { parentRoutes } from './routes/parents';
import { lessonRoutes } from './routes/lessons';
import { scheduleRoutes } from './routes/schedule';
import { cardRoutes } from './routes/cards';
import { meRoutes } from './routes/me';
import { statsRoutes } from './routes/stats';

export function createApp() {
  const app = new Hono<AppEnv>();

  // ---------- API ----------
  app.route('/api/auth', authRoutes);
  app.route('/api/campuses', campusRoutes);
  app.route('/api/users', userRoutes);
  app.route('/api/teachers', teacherRoutes);
  app.route('/api/rooms', roomRoutes);
  app.route('/api/courses', courseRoutes);
  app.route('/api/classes', classRoutes);
  app.route('/api/students', studentRoutes);
  app.route('/api/parents', parentRoutes);
  app.route('/api/lessons', lessonRoutes);
  app.route('/api/schedule', scheduleRoutes);
  app.route('/api/cards', cardRoutes);
  app.route('/api/me', meRoutes);
  app.route('/api/stats', statsRoutes);

  // 健康检查（含一次数据库探测查询）
  app.get('/api/health', async (c) => {
    const probe = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (!probe || probe.ok !== 1) {
      return c.json({ ok: false, db: 'error' }, 500);
    }
    return c.json({ ok: true, db: 'ok' });
  });

  // 404：仅 API 路径
  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not Found' }, 404);
    }
    // 非 API 路径：Node 端由静态资源兜底；Workers 端由 Assets 层兜底
    return c.text('Not Found', 404);
  });

  // 全局错误处理
  app.onError((err, c) => {
    console.error('Unhandled error:', err);
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: '服务器内部错误' }, 500);
    }
    return c.text('Internal Server Error', 500);
  });

  return app;
}
