// 校区看板：今日课次 / 本周课次 / 活跃班级数 / 本周点名完成率 + 今日课程列表
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { queryCampus } from '../util/scope';
import { addDays, beijingToday, thisMonday } from '../util/time';

export const statsRoutes = new Hono<AppEnv>();

statsRoutes.get('/dashboard', requireAuth, requireRole('super_admin', 'campus_admin'), async (c) => {
  const campusId = queryCampus(c); // super_admin 可传 ?campus_id=（不传=全部汇总）
  const today = beijingToday();
  const weekStart = thisMonday();
  const weekEnd = addDays(weekStart, 6);

  // 日期全部由服务端按北京时间计算并作为绑定参数传入，不依赖数据库端日期函数（双云方言安全）
  // campus_id 在 lessons 与 classes 表都存在，JOIN 查询必须带表名限定，否则列名歧义
  const cLessons = campusId !== null ? ' AND lessons.campus_id = ?' : '';
  const cClasses = campusId !== null ? ' AND classes.campus_id = ?' : '';
  const cJoined = campusId !== null ? ' AND l.campus_id = ?' : '';

  const countOne = async (sql: string, ...binds: (string | number)[]): Promise<number> => {
    const row = await c.env.DB.prepare(sql).bind(...binds).first<{ n: number }>();
    return row?.n ?? 0;
  };

  const [todayLessons, weekLessons, activeClasses] = await Promise.all([
    countOne(
      `SELECT COUNT(*) AS n FROM lessons WHERE status != 'cancelled' AND date = ?${cLessons}`,
      ...(campusId !== null ? [today, campusId] : [today]),
    ),
    countOne(
      `SELECT COUNT(*) AS n FROM lessons WHERE status != 'cancelled' AND date >= ? AND date <= ?${cLessons}`,
      ...(campusId !== null ? [weekStart, weekEnd, campusId] : [weekStart, weekEnd]),
    ),
    countOne(
      `SELECT COUNT(*) AS n FROM classes WHERE status = 'active'${cClasses}`,
      ...(campusId !== null ? [campusId] : []),
    ),
  ]);

  // 本周点名完成率：本周开始到今天为止的非取消课中，已完成点名的占比
  const attendanceRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
     FROM lessons WHERE status != 'cancelled' AND date >= ? AND date <= ?${cLessons}`,
  )
    .bind(...(campusId !== null ? [weekStart, today, campusId] : [weekStart, today]))
    .first<{ total: number; done: number | null }>();
  const total = attendanceRow?.total ?? 0;
  const done = attendanceRow?.done ?? 0;
  const checkinRate = total > 0 ? Math.round((done / total) * 100) : null;

  // 今日课程列表（点击可进点名）
  const todayList = await c.env.DB.prepare(
    `SELECT l.id, l.date, l.start_time, l.end_time, l.status, l.class_id,
       c.name AS class_name, co.color AS course_color, r.name AS room_name, t.name AS teacher_name
     FROM lessons l
     LEFT JOIN classes c ON c.id = l.class_id
     LEFT JOIN courses co ON co.id = c.course_id
     LEFT JOIN rooms r ON r.id = l.room_id
     LEFT JOIN users t ON t.id = l.teacher_id
     WHERE l.status != 'cancelled' AND l.date = ?${cJoined}
     ORDER BY l.start_time`,
  )
    .bind(...(campusId !== null ? [today, campusId] : [today]))
    .all<{
      id: number;
      date: string;
      start_time: string;
      end_time: string;
      status: string;
      class_id: number;
      class_name: string | null;
      course_color: string | null;
      room_name: string | null;
      teacher_name: string | null;
    }>();

  return c.json({
    date: today,
    week_start: weekStart,
    week_end: weekEnd,
    today_lessons: todayLessons,
    week_lessons: weekLessons,
    active_classes: activeClasses,
    checkin_rate: checkinRate,
    today_list: todayList.results,
  });
});
