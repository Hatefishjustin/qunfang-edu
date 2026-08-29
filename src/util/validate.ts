// 时间与格式校验工具

/** 'HH:MM'（00:00–23:59） */
export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** 'YYYY-MM-DD'（含合法性日期） */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 读取请求体中的字符串字段（trim） */
export function readStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 读取请求体中的整数（非法返回 null） */
export function readInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
