// WeekGrid 核心周历组件（自研，不依赖日历库）：
// - WeekGrid：时段 × 星期 网格（排课周历 / 我的课表）
// - TeacherGrid：教师 × 星期 忙闲总览（行=老师，格内为忙闲条与课程列表）
// - TeacherDayCell：单老师单日时间轴（移动端总览用，也可放大显示）
import type { MouseEvent } from 'react';
import { WEEKDAY_NAMES } from '../types';
import type { Lesson, OverviewTeacher } from '../types';
import { addDays, fmtMD, todayStr, weekdayOf } from '../util/date';

/** 'HH:MM' → 当日分钟数 */
export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 当日分钟数 → 'HH:MM'（对齐到 30 分钟） */
function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 30, Math.round(min / 30) * 30));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** 课程色 null 时的兜底色板（8 色低饱和） */
const FALLBACK_COLORS = ['#7c9a6e', '#8ea7c1', '#c9a27e', '#b58ea8', '#93b4c9', '#c9b47e', '#9ec9a2', '#c98e8e'];
export function courseColor(color: string | null | undefined, seed: number): string {
  return color && color !== '' ? color : FALLBACK_COLORS[Math.abs(seed) % FALLBACK_COLORS.length];
}

// ==================================================================
// WeekGrid：时段 × 星期 网格（排课周历 / 我的课表）
// ==================================================================

export type CalendarBlock = {
  id: number;
  dayIndex: number; // 0=周一 … 6=周日
  startTime: string;
  endTime: string;
  color: string;
  title: string;
  sub?: string;
  faded?: boolean;
};

const DAY_START = 7 * 60; // 07:00
const DAY_END = 22 * 60; // 22:00
const HOUR_H = 56; // 每小时像素高度
const HOURS: number[] = [];
for (let h = 7; h <= 22; h++) HOURS.push(h);

/** 从点击位置反推时间（对齐 30 分钟），用于点空白格快速建课 */
function clickTime(e: MouseEvent<HTMLDivElement>): string {
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  return minToTime(DAY_START + ratio * (DAY_END - DAY_START));
}

export function WeekGrid({
  weekStart,
  blocks,
  onCellClick,
  onBlockClick,
}: {
  weekStart: string;
  blocks: CalendarBlock[];
  /** 点空白格：date + 反推的半小时对齐时间 */
  onCellClick?: (date: string, time: string) => void;
  onBlockClick?: (block: CalendarBlock) => void;
}) {
  const today = todayStr();
  const totalMin = DAY_END - DAY_START;

  return (
    <div className="table-container">
      <div className="min-w-[780px]">
        {/* 表头：星期 + 日期 */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border bg-page/40">
          <div />
          {WEEKDAY_NAMES.map((name, i) => {
            const date = addDays(weekStart, i);
            const isToday = date === today;
            return (
              <div key={i} className="py-2 text-center">
                <p className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-ink-tertiary'}`}>{name}</p>
                <p className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-ink-muted'}`}>{fmtMD(date)}</p>
              </div>
            );
          })}
        </div>
        {/* 主体：时间刻度 + 7 天列 */}
        <div className="flex">
          <div className="w-[52px] shrink-0 pt-1">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_H }} className="relative">
                {h < 22 && (
                  <span className="absolute -top-2 right-1.5 text-[10px] text-ink-muted">
                    {String(h).padStart(2, '0')}:00
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7">
            {WEEKDAY_NAMES.map((_, dayIndex) => {
              const date = addDays(weekStart, dayIndex);
              const isToday = date === today;
              return (
                <div
                  key={dayIndex}
                  className={`relative border-l border-border ${isToday ? 'bg-page/50' : ''} ${
                    onCellClick ? 'cursor-copy' : ''
                  }`}
                  style={{ height: HOURS.length * HOUR_H }}
                  onClick={(e) => onCellClick?.(date, clickTime(e))}
                >
                  {/* 小时横线 */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-border"
                      style={{ top: `${((h * 60 - DAY_START) / totalMin) * 100}%` }}
                    />
                  ))}
                  {/* 课块 */}
                  {blocks
                    .filter((b) => b.dayIndex === dayIndex)
                    .map((b) => (
                      <button
                        key={b.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBlockClick?.(b);
                        }}
                        className={`absolute inset-x-0.5 overflow-hidden rounded-md px-1 py-0.5 text-left text-[10px] leading-tight text-white shadow-sm ${
                          onBlockClick ? 'hover:opacity-90' : 'cursor-default'
                        }`}
                        style={{
                          top: `${((timeToMin(b.startTime) - DAY_START) / totalMin) * 100}%`,
                          height: `${((timeToMin(b.endTime) - timeToMin(b.startTime)) / totalMin) * 100}%`,
                          backgroundColor: b.color,
                          opacity: b.faded ? 0.55 : 1,
                        }}
                        title={`${b.title} ${b.startTime}-${b.endTime}`}
                      >
                        <p className="truncate font-medium">{b.title}</p>
                        {b.sub && <p className="truncate opacity-80">{b.sub}</p>}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================================================================
// 教师忙闲总览：行=老师，格=当日横向时间轴（08:00–21:00）
// ==================================================================

const OV_START = 8 * 60; // 08:00
const OV_END = 21 * 60; // 21:00
const OV_TOTAL = OV_END - OV_START;

function pct(startMin: number, endMin: number): { left: string; width: string } {
  const s = Math.max(OV_START, Math.min(OV_END, startMin));
  const e = Math.max(OV_START, Math.min(OV_END, endMin));
  return {
    left: `${((s - OV_START) / OV_TOTAL) * 100}%`,
    width: `${((e - s) / OV_TOTAL) * 100}%`,
  };
}

/** 单老师单日时间轴：绿=申报空闲、灰=不可上课、色块=已排课、白=未申报 */
export function TeacherDayCell({
  teacher,
  date,
  tall = false,
  onCellClick,
  onLessonClick,
}: {
  teacher: OverviewTeacher;
  date: string;
  tall?: boolean;
  /** 点空白处快速建课（预填老师+日期+时间） */
  onCellClick?: (teacherId: number, date: string, time: string) => void;
  onLessonClick?: (lesson: Lesson) => void;
}) {
  const dayIndex = weekdayOf(date);
  const rules = teacher.rules.filter((r) => r.weekday === dayIndex);
  const lessons = teacher.lessons.filter((l) => l.date === date);

  /** 从横向点击位置反推时间（对齐 30 分钟） */
  function cellTime(e: MouseEvent<HTMLDivElement>): string {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return minToTime(OV_START + ratio * OV_TOTAL);
  }

  return (
    <div
      className={`relative ${tall ? 'h-14' : 'h-10'} border-l border-border ${onCellClick ? 'cursor-copy' : ''}`}
      onClick={(e) => onCellClick?.(teacher.id, date, cellTime(e))}
    >
      {/* 绿色：申报空闲 */}
      {rules
        .filter((r) => r.kind === 'available')
        .map((r, i) => (
          <div
            key={`a${i}`}
            className="absolute inset-y-0.5 rounded-sm"
            style={{ ...pct(timeToMin(r.start_time), timeToMin(r.end_time)), backgroundColor: 'rgba(124,154,110,0.35)' }}
          />
        ))}
      {/* 灰色：申报不可上课 */}
      {rules
        .filter((r) => r.kind === 'unavailable')
        .map((r, i) => (
          <div
            key={`u${i}`}
            className="absolute inset-y-0.5 rounded-sm"
            style={{ ...pct(timeToMin(r.start_time), timeToMin(r.end_time)), backgroundColor: '#e2e4e6' }}
          />
        ))}
      {/* 色块：已排课 */}
      {lessons.map((l) => {
        const p = pct(timeToMin(l.start_time), timeToMin(l.end_time));
        return (
          <button
            key={l.id}
            onClick={(e) => {
              e.stopPropagation();
              onLessonClick?.(l);
            }}
            className="absolute inset-y-0.5 z-10 overflow-hidden rounded-sm px-1 text-left text-[10px] leading-none text-white shadow-sm"
            style={{ ...p, backgroundColor: courseColor(l.course_color, l.class_id) }}
            title={`${l.class_name ?? ''} ${l.start_time}-${l.end_time}${l.room_name ? ` · ${l.room_name}` : ''}`}
          >
            <span className={`block truncate ${tall ? 'pt-2' : 'pt-1.5'}`}>{l.class_name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 桌面周视图单元格：忙闲时间带保留时间定位，课程改为可读列表。 */
function TeacherWeekCell({
  teacher,
  date,
  onCellClick,
  onLessonClick,
}: {
  teacher: OverviewTeacher;
  date: string;
  onCellClick?: (teacherId: number, date: string, time: string) => void;
  onLessonClick?: (lesson: Lesson) => void;
}) {
  const dayIndex = weekdayOf(date);
  const rules = teacher.rules.filter((rule) => rule.weekday === dayIndex);
  const lessons = teacher.lessons
    .filter((lesson) => lesson.date === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  function timeFromTrack(event: MouseEvent<HTMLElement>): string {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return minToTime(OV_START + ratio * OV_TOTAL);
  }

  function createFromTrack(event: MouseEvent<HTMLElement>) {
    if (!onCellClick) return;
    onCellClick(teacher.id, date, timeFromTrack(event));
  }

  return (
    <div className="teacher-overview-day-cell">
      <button
        type="button"
        className="teacher-availability-track"
        onClick={createFromTrack}
        disabled={!onCellClick}
        aria-label={`${teacher.name} ${date} 08:00 至 21:00 忙闲时间带，点击快速建课`}
        title="08:00 - 21:00，点击对应时间快速建课"
      >
        {rules.map((rule, index) => (
          <span
            key={`${rule.kind}-${index}`}
            className="absolute inset-y-0 rounded-full"
            style={{
              ...pct(timeToMin(rule.start_time), timeToMin(rule.end_time)),
              backgroundColor: rule.kind === 'available' ? 'rgba(124,154,110,0.55)' : '#dfe3e5',
            }}
          />
        ))}
      </button>

      <div className="mt-2 space-y-1.5">
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            type="button"
            className="teacher-week-lesson"
            onClick={() => onLessonClick?.(lesson)}
            aria-label={`${lesson.start_time} ${lesson.class_name ?? lesson.course_name ?? '课程'}，点击调课或取消`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: courseColor(lesson.course_color, lesson.class_id) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold text-ink-tertiary">
                {lesson.start_time.slice(0, 5)} - {lesson.end_time.slice(0, 5)}
              </span>
              <span className="block truncate text-xs font-medium text-ink">
                {lesson.class_name ?? lesson.course_name ?? '课程'}
              </span>
            </span>
          </button>
        ))}
        {lessons.length === 0 && (
          <button
            type="button"
            className="teacher-week-empty"
            onClick={createFromTrack}
            disabled={!onCellClick}
          >
            暂无排课
          </button>
        )}
      </div>
    </div>
  );
}

/** 总览网格：每行一位老师，左侧固定身份栏，右侧为 7 天课程矩阵。 */
export function TeacherGrid({
  teachers,
  weekStart,
  onCellClick,
  onLessonClick,
}: {
  teachers: OverviewTeacher[];
  weekStart: string;
  onCellClick?: (teacherId: number, date: string, time: string) => void;
  onLessonClick?: (lesson: Lesson) => void;
}) {
  const today = todayStr();
  return (
    <div className="table-container teacher-overview-table">
      <div className="min-w-[980px]">
        <div className="teacher-overview-grid teacher-overview-head">
          <div className="teacher-overview-sticky px-4 py-3">
            <p className="text-xs font-semibold text-ink-secondary">教师</p>
            <p className="mt-0.5 text-[10px] text-ink-muted">08:00 - 21:00</p>
          </div>
          {WEEKDAY_NAMES.map((name, i) => {
            const date = addDays(weekStart, i);
            return (
              <div key={i} className="border-l border-border/70 py-3 text-center">
                <p className={`text-xs ${date === today ? 'font-bold text-primary' : 'text-ink-tertiary'}`}>{name}</p>
                <p className={`text-xs ${date === today ? 'font-bold text-primary' : 'text-ink-muted'}`}>{fmtMD(date)}</p>
              </div>
            );
          })}
        </div>
        {/* 每行一位老师 */}
        {teachers.map((t) => (
          <div
            key={t.id}
            className="teacher-overview-grid teacher-overview-row"
          >
            <div className="teacher-overview-sticky flex flex-col justify-center px-4 py-3">
              <p className="truncate text-sm font-medium text-ink">{t.name}</p>
              <p className="truncate text-xs text-ink-muted">{t.subject ?? ''}</p>
            </div>
            {WEEKDAY_NAMES.map((_, dayIndex) => (
              <TeacherWeekCell
                key={dayIndex}
                teacher={t}
                date={addDays(weekStart, dayIndex)}
                onCellClick={onCellClick}
                onLessonClick={onLessonClick}
              />
            ))}
          </div>
        ))}
        {teachers.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">该校区还没有教师</p>
        )}
      </div>
    </div>
  );
}
