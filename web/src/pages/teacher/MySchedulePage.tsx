// 教师端 · 我的课表：周视图（只读，今天高亮）+ 列表模式切换
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import WeekPicker from '../../components/WeekPicker';
import { WeekGrid, courseColor } from '../../components/WeekGrid';
import { WEEKDAY_NAMES } from '../../types';
import type { Lesson } from '../../types';
import { addDays, fmtCN, mondayOf, todayStr, weekdayOf } from '../../util/date';

export default function MySchedulePage() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayStr()));
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const navigate = useNavigate();

  const { data: lessons, loading, error } = useApiData<Lesson[]>(
    `/api/lessons?from=${weekStart}&to=${addDays(weekStart, 6)}`,
  );

  const blocks = (lessons ?? []).map((l) => ({
    id: l.id,
    dayIndex: weekdayOf(l.date),
    startTime: l.start_time,
    endTime: l.end_time,
    color: courseColor(l.course_color, l.class_id),
    title: l.class_name ?? '',
    sub: l.room_name ?? undefined,
    faded: l.status === 'done',
  }));
  const lessonById = new Map((lessons ?? []).map((l) => [l.id, l]));

  // 列表模式：按日期分组
  const byDate = new Map<string, Lesson[]>();
  for (const l of lessons ?? []) {
    const list = byDate.get(l.date) ?? [];
    list.push(l);
    byDate.set(l.date, list);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">我的课表</h1>
          <p className="mt-1 text-sm text-ink/50">点课块进入点名</p>
        </div>
        <div className="flex items-center gap-2">
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
        <WeekGrid
          weekStart={weekStart}
          blocks={blocks}
          onBlockClick={(block) => {
            const l = lessonById.get(block.id);
            if (l && l.status !== 'cancelled') navigate(`/checkin/${l.id}`);
          }}
        />
      ) : (
        <div className="space-y-4">
          {dates.length === 0 && !loading && (
            <p className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-sm text-ink/40">
              这一周还没有课
            </p>
          )}
          {dates.map((date) => (
            <div key={date} className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <p className="border-b border-black/5 bg-primary-bg/40 px-4 py-2 text-sm font-medium text-ink/70">
                {fmtCN(date)} {WEEKDAY_NAMES[weekdayOf(date)]}
                {date === todayStr() && <span className="ml-2 text-xs text-primary">今天</span>}
              </p>
              {(byDate.get(date) ?? []).map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/checkin/${l.id}`)}
                  className="flex w-full items-center gap-3 border-b border-black/5 px-4 py-3 text-left last:border-0 hover:bg-black/[0.03]"
                >
                  <span className="w-[110px] shrink-0 text-sm font-medium text-ink">
                    {l.start_time}–{l.end_time}
                  </span>
                  <span className="flex-1 truncate text-sm text-ink/80">{l.class_name}</span>
                  {l.status === 'done' && (
                    <span className="rounded-full bg-primary-bg px-2 py-0.5 text-xs text-primary">已点名</span>
                  )}
                  <span className="text-xs text-ink/40">{l.room_name ?? '未定教室'}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
