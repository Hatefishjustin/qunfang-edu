// 前端日期工具（本地时区，格式 YYYY-MM-DD）

/** 日期加 N 天 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 星期几：0=周一 … 6=周日（与后端 availability_rules.weekday 一致） */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}

/** 该日期所在周的周一 */
export function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** 今天的日期串 */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** '2026-09-01' → '9/1' */
export function fmtMD(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** '2026-09-01' → '9月1日' */
export function fmtCN(date: string): string {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}
