// 课时扣减闭环（HANDOFF 6.5）：卡变动必带台账，同一 batch 事务，balance_after = total - used
import { beijingToday } from './time';

type CardRow = {
  id: number;
  campus_id: number;
  student_id: number;
  course_id: number;
  total_lessons: number;
  used_lessons: number;
  status: string;
  valid_until: string | null;
};

/**
 * 找到学员该科目下一张可扣的卡：
 * status='active' 且未过期（valid_until 为空=永不过期）且有余量，
 * 按 valid_until 升序（快过期的先扣）、id 升序
 */
async function findDeductibleCard(
  db: D1Database,
  studentId: number,
  courseId: number,
): Promise<CardRow | null> {
  const today = beijingToday();
  return db
    .prepare(
      `SELECT id, campus_id, student_id, course_id, total_lessons, used_lessons, status, valid_until
       FROM hour_cards
       WHERE student_id = ? AND course_id = ? AND status = 'active'
         AND (valid_until IS NULL OR valid_until >= ?)
         AND total_lessons - used_lessons > 0
       ORDER BY (valid_until IS NULL), valid_until, id
       LIMIT 1`,
    )
    .bind(studentId, courseId, today)
    .first<CardRow>();
}

/** 扣 1 节：UPDATE 卡（扣完自动 exhausted）+ INSERT 台账（attendance） */
function buildDeduct(
  db: D1Database,
  card: CardRow,
  lessonId: number,
  operatorId: number,
): D1PreparedStatement[] {
  const used = card.used_lessons + 1;
  const balanceAfter = card.total_lessons - used;
  const status = balanceAfter <= 0 ? 'exhausted' : 'active';
  return [
    db
      .prepare('UPDATE hour_cards SET used_lessons = ?, status = ? WHERE id = ?')
      .bind(used, status, card.id),
    db
      .prepare(
        'INSERT INTO hour_ledger (card_id, student_id, change, balance_after, reason, ref_lesson_id, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(card.id, card.student_id, -1, balanceAfter, 'attendance', lessonId, operatorId),
  ];
}

/**
 * 点名提交时为一名学员扣课。
 * D1 batch 需预先构建全部语句：先查卡，生成 UPDATE+台账语句由调用方汇总进同一 batch。
 * 无可用卡返回 null（考勤仍记录，deducted=0）。
 */
export async function prepareDeduct(
  db: D1Database,
  studentId: number,
  courseId: number,
  lessonId: number,
  operatorId: number,
): Promise<{ cardId: number; stmts: D1PreparedStatement[] } | null> {
  const card = await findDeductibleCard(db, studentId, courseId);
  if (!card) return null;
  return { cardId: card.id, stmts: buildDeduct(db, card, lessonId, operatorId) };
}

/**
 * 取消已点名课：对每条 deducted=1 的考勤回退 +1（cancel_refund），考勤保留、deducted 置 0。
 * 返回全部语句（空数组=无需回退），由调用方在同一 batch 提交。
 */
export async function buildRefund(
  db: D1Database,
  lessonId: number,
  operatorId: number,
): Promise<D1PreparedStatement[]> {
  const rows = await db
    .prepare(
      `SELECT a.student_id, a.hour_card_id, c.total_lessons, c.used_lessons
       FROM lesson_attendance a JOIN hour_cards c ON c.id = a.hour_card_id
       WHERE a.lesson_id = ? AND a.deducted = 1`,
    )
    .bind(lessonId)
    .all<{ student_id: number; hour_card_id: number; total_lessons: number; used_lessons: number }>();

  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results) {
    const used = r.used_lessons - 1;
    const balanceAfter = r.total_lessons - used;
    stmts.push(
      db
        .prepare("UPDATE hour_cards SET used_lessons = ?, status = 'active' WHERE id = ?")
        .bind(used, r.hour_card_id),
      db
        .prepare(
          'INSERT INTO hour_ledger (card_id, student_id, change, balance_after, reason, ref_lesson_id, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(r.hour_card_id, r.student_id, 1, balanceAfter, 'cancel_refund', lessonId, operatorId),
      db
        .prepare('UPDATE lesson_attendance SET deducted = 0 WHERE lesson_id = ? AND student_id = ?')
        .bind(lessonId, r.student_id),
    );
  }
  return stmts;
}
