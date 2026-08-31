// 教师忙闲总览（核心页）：一屏看全老师的空闲/不可用/已排课
// 桌面：行=老师 × 列=7 天忙闲与课程矩阵；移动端：单老师当天/一周切换
import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { TeacherDayCell, TeacherGrid } from '../../components/WeekGrid';
import LessonFormModal from '../../components/LessonFormModal';
import { useSchedule } from './ScheduleLayout';
import { WEEKDAY_NAMES } from '../../types';
import type { Lesson, OverviewData } from '../../types';
import { addDays, fmtMD, todayStr, weekdayOf } from '../../util/date';

export default function TeachersOverviewPage() {
  const { campusId, weekStart } = useSchedule();
  const { data, loading, error, reload } = useApiData<OverviewData>(
    `/api/schedule/overview?week_start=${weekStart}${campusId !== null ? `&campus_id=${campusId}` : ''}`,
  );

  // 弹窗：create（点空白格快速建课，预填老师/日期/时间）或 edit（点课块调课/取消）
  const [createInitial, setCreateInitial] = useState<
    { teacherId: number; date: string; startTime: string } | null
  >(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  // 移动端视图状态：默认显示今天所在的星期，可切换当天/一周。
  const [mobileTeacherId, setMobileTeacherId] = useState<number | null>(null);
  const [mobileDay, setMobileDay] = useState(() => weekdayOf(todayStr()));
  const [mobileView, setMobileView] = useState<'day' | 'week'>('day');
  const mobileTeacher = data?.teachers.find((t) => t.id === mobileTeacherId) ?? data?.teachers[0] ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">教师忙闲总览</h1>
          <p className="mt-1 text-sm text-ink-tertiary">点空白处快速建课 · 点色块调课/取消</p>
        </div>
        {/* 图例 */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-tertiary">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: 'rgba(124,154,110,0.5)' }} />
            空闲
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-sm bg-[#e2e4e6]" />
            不可上课
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-sm bg-primary" />
            已排课
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-sm border border-border bg-surface" />
            未申报
          </span>
        </div>
      </div>

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}

      {/* 桌面：全教师周网格 */}
      <div className="hidden md:block">
        {data && (
          <TeacherGrid
            teachers={data.teachers}
            weekStart={weekStart}
            onCellClick={(teacherId, date, time) => setCreateInitial({ teacherId, date, startTime: time })}
            onLessonClick={(lesson) => setEditLesson(lesson)}
          />
        )}
      </div>

      {/* 移动端：单老师视图，可在当天与一周之间切换。 */}
      <div className="md:hidden">
        {data && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={mobileTeacher?.id ?? ''}
                onChange={(e) => setMobileTeacherId(Number(e.target.value))}
                className="select"
                aria-label="选择教师"
              >
                {data.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.subject ? `（${t.subject}）` : ''}
                  </option>
                ))}
              </select>
              <div className="glass-inset grid grid-cols-2 rounded-xl p-1" role="group" aria-label="查看范围">
                <button
                  type="button"
                  onClick={() => setMobileView('day')}
                  className={`${mobileView === 'day' ? 'nav-tab-active' : 'nav-tab'} min-h-11`}
                  aria-pressed={mobileView === 'day'}
                >
                  当天
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView('week')}
                  className={`${mobileView === 'week' ? 'nav-tab-active' : 'nav-tab'} min-h-11`}
                  aria-pressed={mobileView === 'week'}
                >
                  一周
                </button>
              </div>
            </div>

            {mobileView === 'day' && (
              <>
                <div className="overview-day-tabs flex gap-1 overflow-x-auto pb-1">
                  {WEEKDAY_NAMES.map((name, index) => {
                    const date = addDays(weekStart, index);
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setMobileDay(index)}
                        className={`${mobileDay === index ? 'nav-tab-active' : 'nav-tab'} min-h-11`}
                      >
                        {name} {fmtMD(date)}
                      </button>
                    );
                  })}
                </div>
                <div className="card overflow-hidden">
                  <div className="border-b border-border bg-page/40 px-3 py-2 text-center text-xs text-ink-muted">
                    {WEEKDAY_NAMES[mobileDay]} {fmtMD(addDays(weekStart, mobileDay))} · 08:00 - 21:00
                  </div>
                  {mobileTeacher && (
                    <TeacherDayCell
                      teacher={mobileTeacher}
                      date={addDays(weekStart, mobileDay)}
                      tall
                      onCellClick={(teacherId, date, time) => setCreateInitial({ teacherId, date, startTime: time })}
                      onLessonClick={(lesson) => setEditLesson(lesson)}
                    />
                  )}
                </div>
              </>
            )}

            {mobileView === 'week' && mobileTeacher && (
              <div className="space-y-2">
                {WEEKDAY_NAMES.map((name, index) => {
                  const date = addDays(weekStart, index);
                  return (
                    <section key={date} className="card overflow-hidden">
                      <div className="flex items-center justify-between border-b border-border bg-page/40 px-3 py-2">
                        <span className="text-sm font-medium text-ink">{name}</span>
                        <span className={`text-xs ${date === todayStr() ? 'font-semibold text-primary-dark' : 'text-ink-tertiary'}`}>
                          {fmtMD(date)}
                        </span>
                      </div>
                      <TeacherDayCell
                        teacher={mobileTeacher}
                        date={date}
                        tall
                        onCellClick={(teacherId, lessonDate, time) => setCreateInitial({ teacherId, date: lessonDate, startTime: time })}
                        onLessonClick={(lesson) => setEditLesson(lesson)}
                      />
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {data && data.teachers.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-ink-muted">
          没有教师数据，先去基础数据里添加教师
        </p>
      )}

      {/* 快速建课（点空白格） */}
      {createInitial && (
        <LessonFormModal
          mode="create"
          initial={createInitial}
          campusId={campusId}
          onClose={() => setCreateInitial(null)}
          onSaved={reload}
        />
      )}

      {/* 调课 / 取消（点课块） */}
      {editLesson && (
        <LessonFormModal
          mode="edit"
          lesson={editLesson}
          campusId={campusId}
          onClose={() => setEditLesson(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
