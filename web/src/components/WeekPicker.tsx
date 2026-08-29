// 周选择器：上一周 / 下一周 / 本周
import { addDays, fmtMD, mondayOf, todayStr } from '../util/date';

export default function WeekPicker({
  weekStart,
  onChange,
}: {
  weekStart: string;
  onChange: (weekStart: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(addDays(weekStart, -7))}
        className="btn-secondary px-2.5 py-1 text-sm"
        aria-label="上一周"
      >
        ‹
      </button>
      <span className="min-w-[104px] text-center text-sm font-semibold text-ink">
        {fmtMD(weekStart)} – {fmtMD(addDays(weekStart, 6))}
      </span>
      <button
        onClick={() => onChange(addDays(weekStart, 7))}
        className="btn-secondary px-2.5 py-1 text-sm"
        aria-label="下一周"
      >
        ›
      </button>
      <button
        onClick={() => onChange(mondayOf(todayStr()))}
        className="btn-secondary px-2.5 py-1 text-sm"
      >
        本周
      </button>
    </div>
  );
}
