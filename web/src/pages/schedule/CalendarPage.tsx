// 排课周历：行=时段（30 分钟粒度）、列=周一~周日；点空白格/新建课按钮建课（单次/批量）
import { useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { WeekGrid, courseColor } from '../../components/WeekGrid';
import type { CalendarBlock } from '../../components/WeekGrid';
import LessonFormModal from '../../components/LessonFormModal';
import { useSchedule } from './ScheduleLayout';
import type { ClassItem, Lesson, Room, Teacher } from '../../types';
import { addDays } from '../../util/date';

export default function CalendarPage() {
  const { campusId, weekStart } = useSchedule();
  const [filterTeacher, setFilterTeacher] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterRoom, setFilterRoom] = useState('');

  const listSuffix = campusId !== null ? `?campus_id=${campusId}` : '';
  const { data: teachers } = useApiData<Teacher[]>(`/api/teachers${listSuffix}`);
  const { data: classes } = useApiData<ClassItem[]>(`/api/classes${listSuffix}`);
  const { data: rooms } = useApiData<Room[]>(`/api/rooms${listSuffix}`);

  // 课表查询（周范围 + 筛选）
  const query = useMemo(() => {
    const p = new URLSearchParams({ from: weekStart, to: addDays(weekStart, 6) });
    if (campusId !== null) p.set('campus_id', String(campusId));
    if (filterTeacher) p.set('teacher_id', filterTeacher);
    if (filterClass) p.set('class_id', filterClass);
    if (filterRoom) p.set('room_id', filterRoom);
    return p.toString();
  }, [weekStart, campusId, filterTeacher, filterClass, filterRoom]);
  const { data: lessons, loading, error, reload } = useApiData<Lesson[]>(`/api/lessons?${query}`);

  // 弹窗状态
  const [createInitial, setCreateInitial] = useState<{ date: string; startTime: string } | null>(null);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);

  const blocks: CalendarBlock[] = (lessons ?? []).map((l) => ({
    id: l.id,
    dayIndex: (new Date(`${l.date}T00:00:00`).getDay() + 6) % 7,
    startTime: l.start_time,
    endTime: l.end_time,
    color: courseColor(l.course_color, l.class_id),
    title: l.class_name ?? '',
    sub: `${l.start_time} ${l.teacher_name ?? ''}${l.room_name ? ` · ${l.room_name}` : ''}`,
  }));

  const blockToLesson = (block: CalendarBlock): Lesson | undefined =>
    (lessons ?? []).find((l) => l.id === block.id);

  const selectCls = 'rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">排课周历</h1>
        <button
          onClick={() => setCreateInitial({ date: weekStart, startTime: '09:00' })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 新建课
        </button>
      </div>

      {/* 筛选：老师 / 班级 / 教室 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)} className={selectCls}>
          <option value="">全部老师</option>
          {(teachers ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className={selectCls}>
          <option value="">全部班级</option>
          {(classes ?? []).map((cl) => (
            <option key={cl.id} value={cl.id}>
              {cl.name}
            </option>
          ))}
        </select>
        <select value={filterRoom} onChange={(e) => setFilterRoom(e.target.value)} className={selectCls}>
          <option value="">全部教室</option>
          {(rooms ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="mb-2 text-ink/50">加载中…</p>}
      {error && <p className="mb-2 text-red-600">{error}</p>}

      <WeekGrid
        weekStart={weekStart}
        blocks={blocks}
        onCellClick={(date, time) => setCreateInitial({ date, startTime: time })}
        onBlockClick={(block) => {
          const lesson = blockToLesson(block);
          if (lesson) setEditLesson(lesson);
        }}
      />
      <p className="mt-2 text-xs text-ink/40">
        共 {(lessons ?? []).length} 节课 · 点空白格快速建课，点课块调课/取消
      </p>

      {createInitial && (
        <LessonFormModal
          mode="create"
          initial={createInitial}
          campusId={campusId}
          onClose={() => setCreateInitial(null)}
          onSaved={reload}
        />
      )}

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
