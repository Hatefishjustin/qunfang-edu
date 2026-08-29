// 家长/学生端 · 课表：家长可切换多个孩子；本周/下周视图
import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import WeekPicker from '../../components/WeekPicker';
import { WeekGrid, courseColor } from '../../components/WeekGrid';
import type { MyLesson } from '../../types';
import { addDays, fmtCN, mondayOf, todayStr, weekdayOf } from '../../util/date';
import { WEEKDAY_NAMES } from '../../types';

export default function FamilySchedulePage() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayStr()));
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const { data: lessons, loading, error } = useApiData<MyLesson[]>(
    `/api/me/lessons?from=${weekStart}&to=${addDays(weekStart, 6)}`,
  );

  // 多孩家庭：按孩子筛选（student_id 为空=全部）
  const childIds = [...new Set((lessons ?? []).map((l) => l.student_id).filter((id): id is number => id != null))];
  const [childFilter, setChildFilter] = useState<number | null>(null);
  const visible = (lessons ?? []).filter((l) => childFilter === null || l.student_id === childFilter);
  const childNames = new Map<number, string>(); // 由课的 student_id 区分（名字展示从卡页获取，这里用"孩子1/2"序号）
  childIds.forEach((id, i) => childNames.set(id, `孩子 ${i + 1}`));

  const blocks = visible.map((l) => ({
    id: l.id,
    dayIndex: weekdayOf(l.date),
    startTime: l.start_time,
    endTime: l.end_time,
    color: courseColor(l.course_color, l.id),
    title:
      (childIds.length > 1 && l.student_id != null ? `${childNames.get(l.student_id)}·` : '') +
      (l.course_name ?? l.class_name ?? ''),
    sub: `${l.teacher_name ?? ''} ${l.room_name ?? ''}`.trim() || undefined,
  }));

  // 列表模式
  const byDate = new Map<string, MyLesson[]>();
  for (const l of visible) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">课表</h1>
          <p className="mt-1 text-sm text-ink/50">本周课程安排</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {childIds.length > 1 && (
            <select
              value={childFilter ?? ''}
              onChange={(e) => setChildFilter(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="">全部孩子</option>
              {childIds.map((id) => (
                <option key={id} value={id}>
                  {childNames.get(id)}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5"
          >
            {view === 'grid' ? '切换列表' : '切换周历'}
          </button>
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
        </div>
      </div>

      {loading && <p className="mb-2 text-ink/50">加载中…</p>}
      {error && <p className="mb-2 text-red-600">{error}</p>}

      {view === 'grid' ? (
        <WeekGrid weekStart={weekStart} blocks={blocks} />
      ) : (
        <div className="space-y-4">
          {dates.length === 0 && !loading && (
            <p className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-sm text-ink/40">
              这一周没有课
            </p>
          )}
          {dates.map((date) => (
            <div key={date} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <p className="border-b border-black/5 bg-primary-bg/40 px-4 py-2 text-sm font-medium text-ink/70">
                {fmtCN(date)} {WEEKDAY_NAMES[weekdayOf(date)]}
                {date === todayStr() && <span className="ml-2 text-xs text-primary">今天</span>}
              </p>
              {(byDate.get(date) ?? []).map((l) => (
                <div key={`${l.id}-${l.student_id ?? 0}`} className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0">
                  <span className="w-[110px] shrink-0 text-sm font-medium text-ink">
                    {l.start_time}–{l.end_time}
                  </span>
                  <span className="flex-1 truncate text-sm text-ink/80">
                    {l.course_name ?? l.class_name}
                  </span>
                  <span className="text-xs text-ink/40">{l.teacher_name ?? ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
