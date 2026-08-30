import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { materializeLessonReminders } from '../util/notifications';
import { beijingNow } from '../util/time';

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use('*', requireAuth);

notificationRoutes.get('/', async (c) => {
  const me = c.get('user');
  const rawLimit = Number(c.req.query('limit') ?? 30);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

  await materializeLessonReminders(c.env.DB, {
    id: me.id,
    role: me.role,
    campus_id: me.campusId,
  });

  const [items, unread] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, type, title, content, link, related_lesson_id, related_request_id,
         read_at, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(me.id, limit),
    c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
    ).bind(me.id),
  ]);

  const unreadRow = unread.results[0] as { n: number } | undefined;
  return c.json({ items: items.results, unread_count: unreadRow?.n ?? 0 });
});

notificationRoutes.patch('/:id/read', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);
  const me = c.get('user');
  const result = await c.env.DB.prepare(
    'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?',
  )
    .bind(beijingNow(), id, me.id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: '通知不存在' }, 404);
  return c.json({ ok: true });
});

notificationRoutes.post('/read-all', async (c) => {
  const me = c.get('user');
  await c.env.DB.prepare(
    'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
  )
    .bind(beijingNow(), me.id)
    .run();
  return c.json({ ok: true });
});
