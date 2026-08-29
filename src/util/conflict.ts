// 排课冲突检测（HANDOFF 6.2 硬约束：保存前必须校验）
import { weekdayOf } from './time';

/** 一次待校验的课位 */
export type LessonSlot = {
  teacherId: number;
  roomId: number | null;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  /** 调课时排除自身，避免和自己重叠 */
  excludeLessonId?: number;
};

/** 三类冲突的检查结果（null = 无该类冲突，否则为可读错误信息） */
export type ConflictReport = {
  teacher: string | null;
  room: string | null;
  unavailable: string | null;
};

/**
 * 检查一个课位的全部三类冲突：
 * 1. 同老师同日期与未取消的课时间段重叠（硬约束，不可跳过）
 * 2. 同教室同日期与未取消的课时间段重叠（硬约束，不可跳过）
 * 3. 老师该时段落在 unavailable 规则内（可用 force 跳过）
 * 注：时间段按字符串比较（格式保证字典序=时间序）。
 */
export async function checkLessonConflicts(db: D1Database, slot: LessonSlot): Promise<ConflictReport> {
  const report: ConflictReport = { teacher: null, room: null, unavailable: null };
  const exclude = slot.excludeLessonId ?? 0;

  // 1. 老师冲突
  const teacherHit = await db
    .prepare(
      `SELECT l.start_time, l.end_time, c.name AS class_name
       FROM lessons l LEFT JOIN classes c ON c.id = l.class_id
       WHERE l.teacher_id = ? AND l.date = ? AND l.status != 'cancelled' AND l.id != ?
         AND l.start_time < ? AND l.end_time > ?
       LIMIT 1`,
    )
    .bind(slot.teacherId, slot.date, exclude, slot.endTime, slot.startTime)
    .first<{ start_time: string; end_time: string; class_name: string | null }>();
  if (teacherHit) {
    report.teacher = `该老师此时段已有课「${teacherHit.class_name ?? ''}」（${teacherHit.start_time}–${teacherHit.end_time}）`;
  }

  // 2. 教室冲突
  if (slot.roomId !== null) {
    const roomHit = await db
      .prepare(
        `SELECT l.start_time, l.end_time, c.name AS class_name
         FROM lessons l LEFT JOIN classes c ON c.id = l.class_id
         WHERE l.room_id = ? AND l.date = ? AND l.status != 'cancelled' AND l.id != ?
           AND l.start_time < ? AND l.end_time > ?
         LIMIT 1`,
      )
      .bind(slot.roomId, slot.date, exclude, slot.endTime, slot.startTime)
      .first<{ start_time: string; end_time: string; class_name: string | null }>();
    if (roomHit) {
      report.room = `该教室此时段已被「${roomHit.class_name ?? ''}」占用（${roomHit.start_time}–${roomHit.end_time}）`;
    }
  }

  // 3. 老师不可用时段（unavailable 规则）
  const weekday = weekdayOf(slot.date);
  const ruleHit = await db
    .prepare(
      `SELECT start_time, end_time FROM availability_rules
       WHERE teacher_id = ? AND weekday = ? AND kind = 'unavailable'
         AND start_time < ? AND end_time > ?
       LIMIT 1`,
    )
    .bind(slot.teacherId, weekday, slot.endTime, slot.startTime)
    .first<{ start_time: string; end_time: string }>();
  if (ruleHit) {
    report.unavailable = `老师该时段申报为不可上课（${ruleHit.start_time}–${ruleHit.end_time}）`;
  }

  return report;
}
