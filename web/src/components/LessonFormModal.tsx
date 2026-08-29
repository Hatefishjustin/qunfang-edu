// 建课 / 调课弹窗：
// - create 模式：单次 | 按周批量 两个 Tab（HANDOFF 7.2）
// - edit 模式：调课（改日期/时间/老师/教室）+ 取消课
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { useToast } from './Toast';
import Modal from './Modal';
import { timeToMin } from './WeekGrid';
import { WEEKDAY_NAMES } from '../types';
import type { ClassItem, Lesson, Room, Teacher } from '../types';
import { todayStr, weekdayOf } from '../util/date';

export type LessonFormInitial = {
  classId?: number;
  teacherId?: number;
  date?: string;
  startTime?: string;
};

function addMinutes(t: string, min: number): string {
  const total = Math.min(24 * 60 - 1, timeToMin(t) + min);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function LessonFormModal({
  mode,
  lesson,
  initial,
  campusId,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  /** edit 模式的目标课 */
  lesson?: Lesson;
  /** create 模式的预填（点空白格快速建课） */
  initial?: LessonFormInitial;
  /** create 时班级下拉的校区筛选（null=全部） */
  campusId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'single' | 'batch'>('single');
  const [saving, setSaving] = useState(false);

  // 数据范围：edit 用课的校区；create 用传入校区（可 null=全部，选了班级后再按班级校区过滤老师/教室）
  const listCampus = mode === 'edit' ? (lesson?.campus_id ?? null) : campusId;
  const suffix = listCampus !== null ? `?campus_id=${listCampus}` : '';
  const { data: classes } = useApiData<ClassItem[]>(`/api/classes${suffix}`);
  const { data: teachers } = useApiData<Teacher[]>(`/api/teachers${suffix}`);
  const { data: rooms } = useApiData<Room[]>(`/api/rooms${suffix}`);

  // ---------- 表单状态 ----------
  const today = todayStr();
  const [form, setForm] = useState({
    classId: mode === 'edit' ? (lesson?.class_id ?? 0) : (initial?.classId ?? 0),
    teacherId: mode === 'edit' ? (lesson?.teacher_id ?? 0) : (initial?.teacherId ?? 0),
    roomId: mode === 'edit' ? (lesson?.room_id ?? 0) : 0, // 0 = 不指定
    date: mode === 'edit' ? (lesson?.date ?? today) : (initial?.date ?? today),
    startTime: mode === 'edit' ? (lesson?.start_time ?? '09:00') : (initial?.startTime ?? '09:00'),
    endTime: mode === 'edit' ? (lesson?.end_time ?? '10:30') : addMinutes(initial?.startTime ?? '09:00', 90),
    note: mode === 'edit' ? (lesson?.note ?? '') : '',
    weekday: weekdayOf(mode === 'edit' ? (lesson?.date ?? today) : (initial?.date ?? today)),
    startDate: mode === 'edit' ? (lesson?.date ?? today) : (initial?.date ?? today),
    weeks: 16,
    force: false,
  });

  // 选中班级 → 老师和教室只能选该班级校区的
  const selectedClass = classes?.find((cl) => cl.id === form.classId);
  const classCampus = selectedClass?.campus_id ?? null;
  const teacherOptions = (teachers ?? []).filter((t) => classCampus === null || t.campus_id === classCampus);
  const roomOptions = (rooms ?? []).filter((r) => classCampus === null || r.campus_id === classCampus);
  const lessonCampus = mode === 'edit' ? lesson?.campus_id : null;
  const editTeachers =
    mode === 'edit' ? (teachers ?? []).filter((t) => t.campus_id === lessonCampus) : teacherOptions;
  const editRooms = mode === 'edit' ? (rooms ?? []).filter((r) => r.campus_id === lessonCampus) : roomOptions;
  const finalTeacherOptions = mode === 'edit' ? editTeachers : teacherOptions;
  const finalRoomOptions = mode === 'edit' ? editRooms : roomOptions;

  // ---------- 提交 ----------
  async function submitSingle() {
    if (!form.classId) return showToast('请选择班级', 'error');
    if (!form.teacherId) return showToast('请选择老师', 'error');
    if (form.endTime <= form.startTime) return showToast('结束时间需晚于开始时间', 'error');
    setSaving(true);
    try {
      await api.post('/api/lessons', {
        class_id: form.classId,
        teacher_id: form.teacherId,
        room_id: form.roomId === 0 ? null : form.roomId,
        date: form.date,
        start_time: form.startTime,
        end_time: form.endTime,
        note: form.note || null,
        force: form.force,
      });
      showToast('课已创建');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function submitBatch() {
    if (!form.classId) return showToast('请选择班级', 'error');
    if (!form.teacherId) return showToast('请选择老师', 'error');
    if (form.endTime <= form.startTime) return showToast('结束时间需晚于开始时间', 'error');
    if (form.weeks < 1 || form.weeks > 52) return showToast('周数需在 1～52 之间', 'error');
    setSaving(true);
    try {
      const r = await api.post<{ created: number }>('/api/lessons/batch', {
        class_id: form.classId,
        teacher_id: form.teacherId,
        room_id: form.roomId === 0 ? null : form.roomId,
        weekday: form.weekday,
        start_time: form.startTime,
        end_time: form.endTime,
        start_date: form.startDate,
        weeks: form.weeks,
        note: form.note || null,
        force: form.force,
      });
      showToast(`已批量创建 ${r.created} 节课`);
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!lesson) return;
    if (!form.teacherId) return showToast('请选择老师', 'error');
    if (form.endTime <= form.startTime) return showToast('结束时间需晚于开始时间', 'error');
    setSaving(true);
    try {
      await api.patch(`/api/lessons/${lesson.id}`, {
        teacher_id: form.teacherId,
        room_id: form.roomId === 0 ? null : form.roomId,
        date: form.date,
        start_time: form.startTime,
        end_time: form.endTime,
        note: form.note || null,
      });
      showToast('调课成功');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function cancelLesson() {
    if (!lesson) return;
    if (!window.confirm(`确定取消这节课吗？（${lesson.class_name} ${lesson.date} ${lesson.start_time}）`)) return;
    setSaving(true);
    try {
      await api.del(`/api/lessons/${lesson.id}`);
      showToast('课已取消');
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '取消失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'edit') void submitEdit();
    else if (tab === 'single') void submitSingle();
    else void submitBatch();
  }

  // ---------- 渲染 ----------
  const inputCls =
    'mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <Modal
      title={mode === 'edit' ? `调课 · ${lesson?.class_name ?? ''}` : '新建课'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tab 切换（仅 create） */}
        {mode === 'create' && (
          <div className="flex gap-1 rounded-lg bg-black/5 p-1">
            {(
              [
                ['single', '单次建课'],
                ['batch', '按周批量'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === k ? 'bg-white text-primary shadow-sm' : 'text-ink/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 班级 */}
        {mode === 'edit' ? (
          <div className="rounded-lg bg-primary-bg px-3 py-2 text-sm text-ink/70">
            班级：{lesson?.class_name}
            {lesson?.course_name ? `（${lesson.course_name}）` : ''}
          </div>
        ) : (
          <label className="block text-sm font-medium text-ink">
            班级
            <select
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: Number(e.target.value), teacherId: 0, roomId: 0 })}
              className={inputCls}
            >
              <option value={0}>请选择班级</option>
              {(classes ?? []).map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name}
                  {cl.course_name ? `（${cl.course_name}）` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* 老师 */}
        <label className="block text-sm font-medium text-ink">
          老师
          <select
            value={form.teacherId}
            onChange={(e) => setForm({ ...form, teacherId: Number(e.target.value) })}
            className={inputCls}
          >
            <option value={0}>请选择老师</option>
            {finalTeacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.subject ? `（${t.subject}）` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* 教室 */}
        <label className="block text-sm font-medium text-ink">
          教室（可不指定）
          <select
            value={form.roomId}
            onChange={(e) => setForm({ ...form, roomId: Number(e.target.value) })}
            className={inputCls}
          >
            <option value={0}>不指定教室</option>
            {finalRoomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        {mode === 'create' && tab === 'batch' ? (
          <>
            {/* 批量：星期几 + 起始日期 + 周数 */}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-ink">
                星期几
                <select
                  value={form.weekday}
                  onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                  className={inputCls}
                >
                  {WEEKDAY_NAMES.map((n, i) => (
                    <option key={i} value={i}>
                      每{n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                周数
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={form.weeks}
                  onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })}
                  className={inputCls}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-ink">
              起始日期
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className={inputCls}
              />
            </label>
          </>
        ) : (
          <label className="block text-sm font-medium text-ink">
            日期
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-ink">
            开始时间
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            结束时间
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-ink">
          备注（选填）
          <input
            type="text"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputCls}
          />
        </label>

        {mode === 'create' && (
          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={form.force}
              onChange={(e) => setForm({ ...form, force: e.target.checked })}
              className="mt-0.5"
            />
            强制排课（老师申报「不可上课」的时段也允许排课）
          </label>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {mode === 'edit' && lesson ? (
            <button
              type="button"
              onClick={() => void cancelLesson()}
              disabled={saving}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              取消这节课
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
            >
              关闭
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? '保存中…' : mode === 'edit' ? '保存调课' : '创建'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
