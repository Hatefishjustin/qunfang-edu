// 北京时间工具（系统约定：全按 Asia/Shanghai naive 本地时间，日期存 YYYY-MM-DD）

/** 加 8 小时后取 UTC，即为北京时间的"今天" */
export function beijingToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 当前北京时间，存为系统约定的 YYYY-MM-DD HH:mm:ss 无时区字符串。 */
export function beijingNow(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

/** 日期加 N 天 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 该日期所在周的周一 */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 0=周一 … 6=周日
  return addDays(date, -day);
}

/** 星期几：0=周一 … 6=周日（与 availability_rules.weekday 一致） */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

/** 本周周一（北京时间） */
export function thisMonday(): string {
  return mondayOf(beijingToday());
}
