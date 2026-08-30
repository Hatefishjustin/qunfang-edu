// 课堂反馈：仅本节课老师可录入文字、图片和留言，其他角色只读
// 挂载前缀 /api/lessons（与 lessons.ts 同前缀，Hono 顺序匹配）
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { notifyClassroomFeedback } from '../util/notifications';

export const lessonContentRoutes = new Hono<AppEnv>();
lessonContentRoutes.use('*', requireAuth);

/** 单张图片上限（base64 字符数，约 400KB 二进制） */
const MAX_BASE64 = 540000;
/** 每节课最多图片数 */
const MAX_FILES = 9;

type LessonCore = {
  id: number;
  campus_id: number;
  class_id: number;
  teacher_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
};

async function loadLesson(c: { env: { DB: D1Database } }, id: number): Promise<LessonCore | null> {
  return c.env.DB.prepare(
    `SELECT id, campus_id, class_id, teacher_id, date, start_time, end_time, status
     FROM lessons WHERE id = ?`,
  )
    .bind(id)
    .first<LessonCore>();
}

/** 当前用户（家长/学生）在指定班级的在册学员 id 列表 */
async function myEnrolledStudentIds(
  c: { env: { DB: D1Database }; get: (k: 'user') => { id: number; role: string } },
  classId: number,
): Promise<number[]> {
  const me = c.get('user');

  if (me.role === 'student') {
    const rows = await c.env.DB.prepare(
      `SELECT e.student_id FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE e.class_id = ? AND e.status = 'active' AND s.user_id = ? AND s.deleted_at IS NULL`,
    )
      .bind(classId, me.id)
      .all<{ student_id: number }>();
    return rows.results.map((r) => r.student_id);
  }

  if (me.role === 'parent') {
    const rows = await c.env.DB.prepare(
      `SELECT e.student_id FROM enrollments e
       JOIN parent_student ps ON ps.student_id = e.student_id
       JOIN parents p ON p.id = ps.parent_id
       WHERE e.class_id = ? AND e.status = 'active' AND p.user_id = ? AND p.deleted_at IS NULL`,
    )
      .bind(classId, me.id)
      .all<{ student_id: number }>();
    return [...new Set(rows.results.map((r) => r.student_id))];
  }

  return [];
}

/** 视角判定：view=能看反馈，edit=仅本节课老师能录入 */
async function lessonView(
  c: { env: { DB: D1Database }; get: (k: 'user') => { id: number; role: string; campusId: number | null } },
  lesson: LessonCore,
): Promise<{ view: boolean; edit: boolean }> {
  const me = c.get('user');
  if (me.role === 'super_admin') return { view: true, edit: false };
  if (me.role === 'campus_admin') return { view: lesson.campus_id === me.campusId, edit: false };
  if (me.role === 'teacher') {
    const own = lesson.teacher_id === me.id;
    return { view: own, edit: own };
  }
  const enrolled = await myEnrolledStudentIds(c, lesson.class_id);
  return { view: enrolled.length > 0, edit: false };
}

// ---------- 课内容详情（文字 + 图片列表 + 留言） ----------
lessonContentRoutes.get('/:id/content', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const lesson = await loadLesson(c, id);
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  const scope = await lessonView(c, lesson);
  if (!scope.view) return c.json({ error: '没有权限' }, 403);

  const [detail, files, comments] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT l.note, cl.name AS class_name, co.name AS course_name, co.color AS course_color,
         u.name AS teacher_name, r.name AS room_name
       FROM lessons l
       LEFT JOIN classes cl ON cl.id = l.class_id
       LEFT JOIN courses co ON co.id = cl.course_id
       LEFT JOIN users u ON u.id = l.teacher_id
       LEFT JOIN rooms r ON r.id = l.room_id
       WHERE l.id = ?`,
    ).bind(id),
    c.env.DB.prepare(
      'SELECT id, mime, size, created_at FROM lesson_files WHERE lesson_id = ? ORDER BY id',
    ).bind(id),
    c.env.DB.prepare(
      `SELECT cm.id, cm.user_id, cm.role, cm.content, cm.created_at, u.name AS user_name
       FROM lesson_comments cm LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.lesson_id = ? ORDER BY cm.id`,
    ).bind(id),
  ]);

  const detailRow = detail.results[0] as
    | {
        note: string | null;
        class_name: string | null;
        course_name: string | null;
        course_color: string | null;
        teacher_name: string | null;
        room_name: string | null;
      }
    | undefined;

  return c.json({
    lesson: {
      id: lesson.id,
      date: lesson.date,
      start_time: lesson.start_time,
      end_time: lesson.end_time,
      status: lesson.status,
      note: detailRow?.note ?? null,
      class_name: detailRow?.class_name ?? null,
      course_name: detailRow?.course_name ?? null,
      course_color: detailRow?.course_color ?? null,
      teacher_name: detailRow?.teacher_name ?? null,
      room_name: detailRow?.room_name ?? null,
    },
    files: files.results,
    comments: comments.results,
    can_edit: scope.edit,
  });
});

// ---------- 修改本节课内容（老师本人 / 管理员） ----------
lessonContentRoutes.patch('/:id/note', requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const lesson = await loadLesson(c, id);
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  const scope = await lessonView(c, lesson);
  if (!scope.edit) return c.json({ error: '只有本节课的老师可以录入内容' }, 403);

  const body = await c.req.json<{ note?: unknown }>().catch(() => null);
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000) return c.json({ error: '课堂内容最多 2000 字' }, 400);

  await c.env.DB.prepare('UPDATE lessons SET note = ? WHERE id = ?').bind(note || null, id).run();
  await notifyClassroomFeedback(c.env.DB, id, c.get('user').id);
  return c.json({ ok: true });
});

// ---------- 上传课堂图片（JSON base64，前端已压缩） ----------
lessonContentRoutes.post('/:id/files', requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const lesson = await loadLesson(c, id);
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  const scope = await lessonView(c, lesson);
  if (!scope.edit) return c.json({ error: '只有本节课的老师可以上传图片' }, 403);

  const body = await c.req.json<{ mime?: unknown; data?: unknown }>().catch(() => null);
  const mime = typeof body?.mime === 'string' ? body.mime : '';
  const data = typeof body?.data === 'string' ? body.data.replace(/^data:image\/\w+;base64,/, '') : '';
  if (!mime.startsWith('image/')) return c.json({ error: '只支持图片文件' }, 400);
  if (data === '') return c.json({ error: '图片内容为空' }, 400);
  if (data.length > MAX_BASE64) return c.json({ error: '图片太大，请压缩后重试（单张 ≤ 400KB）' }, 400);

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM lesson_files WHERE lesson_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_FILES) return c.json({ error: `每节课最多 ${MAX_FILES} 张图片` }, 400);

  const me = c.get('user');
  const r = await c.env.DB.prepare(
    'INSERT INTO lesson_files (lesson_id, mime, size, data, uploaded_by) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, mime, Math.floor((data.length * 3) / 4), data, me.id)
    .run();
  await notifyClassroomFeedback(c.env.DB, id, me.id);
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});

// ---------- 删除课堂图片（仅当前授课老师） ----------
lessonContentRoutes.delete('/:id/files/:fileId', requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  const fileId = Number(c.req.param('fileId'));
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
    return c.json({ error: '参数错误' }, 400);
  }

  const lesson = await loadLesson(c, id);
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  const file = await c.env.DB.prepare('SELECT id FROM lesson_files WHERE id = ? AND lesson_id = ?')
    .bind(fileId, id)
    .first<{ id: number }>();
  if (!file) return c.json({ error: '图片不存在' }, 404);

  const scope = await lessonView(c, lesson);
  if (!scope.edit) return c.json({ error: '没有权限' }, 403);

  await c.env.DB.prepare('DELETE FROM lesson_files WHERE id = ?').bind(fileId).run();
  return c.json({ ok: true });
});

/** 校验对某张图片的访问权限（读权限=对应课的 view） */
async function canReadFile(
  c: { env: { DB: D1Database }; get: (k: 'user') => { id: number; role: string; campusId: number | null } },
  fileId: number,
): Promise<{ ok: true; mime: string; data: string } | { ok: false; status: 404 | 403 }> {
  const file = await c.env.DB.prepare('SELECT id, lesson_id, mime, data FROM lesson_files WHERE id = ?')
    .bind(fileId)
    .first<{ id: number; lesson_id: number; mime: string; data: string }>();
  if (!file) return { ok: false, status: 404 };

  const lesson = await loadLesson(c, file.lesson_id);
  if (!lesson) return { ok: false, status: 404 };
  const scope = await lessonView(c, lesson);
  if (!scope.view) return { ok: false, status: 403 };
  return { ok: true, mime: file.mime, data: file.data };
}

// ---------- 读取图片二进制（<img> 直接引用） ----------
lessonContentRoutes.get('/files/:fileId', async (c) => {
  const fileId = Number(c.req.param('fileId'));
  if (!Number.isInteger(fileId) || fileId <= 0) return c.json({ error: '参数错误' }, 400);

  const r = await canReadFile(c, fileId);
  if (!r.ok) return c.json({ error: r.status === 404 ? '图片不存在' : '没有权限' }, r.status);

  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return c.body(bytes, 200, {
    'Content-Type': r.mime,
    'Cache-Control': 'private, max-age=86400',
  });
});

// ---------- 课堂留言（仅本节课老师） ----------
lessonContentRoutes.post('/:id/comments', requireRole('teacher'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: '参数错误' }, 400);

  const lesson = await loadLesson(c, id);
  if (!lesson) return c.json({ error: '课不存在' }, 404);
  const scope = await lessonView(c, lesson);
  if (!scope.edit) return c.json({ error: '没有权限' }, 403);

  const body = await c.req.json<{ content?: unknown }>().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return c.json({ error: '留言内容不能为空' }, 400);
  if (content.length > 500) return c.json({ error: '留言最多 500 字' }, 400);

  const me = c.get('user');
  const r = await c.env.DB.prepare(
    'INSERT INTO lesson_comments (lesson_id, user_id, role, content) VALUES (?, ?, ?, ?)',
  )
    .bind(id, me.id, me.role, content)
    .run();
  await notifyClassroomFeedback(c.env.DB, id, me.id);
  return c.json({ id: Number(r.meta.last_row_id) }, 201);
});
