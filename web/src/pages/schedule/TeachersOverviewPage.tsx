// 教师忙闲总览（核心页）：一屏看全老师的空闲/不可用/已排课
// 桌面：行=老师 × 列=7 天迷你时间轴；移动端：老师下拉 + 星期切换单日视图
import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { TeacherDayCell, TeacherGrid } from '../../components/WeekGrid';
import LessonFormModal from '../../components/LessonFormModal';
import { useSchedule } from './ScheduleLayout';
import { WEEKDAY_NAMES } from '../../types';
import type { Lesson, OverviewData } from '../../types';
import { addDays, fmtMD } from '../../util/date';

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

  // 移动端单日视图的选择状态
  const [mobileTeacherId, setMobileTeacherId] = useState<number | null>(null);
  const [mobileDay, setMobileDay] = useState(0);
  const mobileTeacher = data?.teachers.find((t) => t.id === mobileTeacherId) ?? data?.teachers[0] ?? null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">教师忙闲总览</h1>
          <p className="mt-1 text-sm text-ink/50">点空白处快速建课 · 点色块调课/取消</p>
        </div>
        {/* 图例 */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink/50">
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
            <span className="h-2.5 w-4 rounded-sm border border-black/10 bg-white" />
            未申报
          </span>
        </div>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

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

      {/* 移动端：老师下拉 + 星期切换，单老师单日 */}
      <div className="md:hidden">
        {data && (
          <div className="space-y-3">
            <select
              value={mobileTeacher?.id ?? ''}
              onChange={(e) => setMobileTeacherId(Number(e.target.value))}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.subject ? `（${t.subject}）` : ''}
                </option>
              ))}
            </select>
            <div className="flex gap-1 overflow-x-auto">
              {WEEKDAY_NAMES.map((n, i) => {
                const date = addDays(weekStart, i);
                return (
                  <button
                    key={i}
                    onClick={() => setMobileDay(i)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                      mobileDay === i ? 'bg-primary text-white' : 'bg-white text-ink/60'
                    }`}
                  >
                    {n} {fmtMD(date)}
                  </button>
                );
              })}
            </div>
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-black/5 bg-primary-bg/40 px-3 py-2 text-center text-xs text-ink/40">
                08:00 – 21:00
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
          </div>
        )}
      </div>

      {data && data.teachers.length === 0 && !loading && (
        <p className="rounded-2xl border border-dashed border-black/10 bg-white p-10 text-center text-sm text-ink/40">
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
