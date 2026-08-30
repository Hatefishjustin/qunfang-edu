// 点名页：本节课学员列表，逐人 到课/缺勤/请假，一次提交（自动扣课）
// teacher 只能点自己的课；campus_admin / super_admin 可代点任意本校区（super 全局）课
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import LessonContentModal from '../../components/LessonContentModal';
import { ATTENDANCE_LABELS } from '../../types';
import type { AttendanceStatus, CheckinData } from '../../types';
import { fmtCN, weekdayOf } from '../../util/date';
import { WEEKDAY_NAMES } from '../../types';

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'absent', 'leave'];
const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-primary text-white border-primary',
  absent: 'bg-error text-white border-error',
  leave: 'bg-warning text-white border-warning',
};

export default function CheckinPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data, loading, error, reload } = useApiData<CheckinData>(
    lessonId ? `/api/lessons/${lessonId}/attendance` : null,
  );

  // 本地勾选状态：student_id → status
  const [picks, setPicks] = useState<Record<number, AttendanceStatus>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const lesson = data?.lesson;
  const done = lesson?.status === 'done';

  async function submit() {
    if (!data) return;
    const students = data.students;
    if (students.some((s) => !picks[s.id])) {
      showToast('请给每位学员选择到课状态', 'error');
      return;
    }
    if (!window.confirm('确认提交点名？到课的学员将自动扣除 1 节课时。')) return;
    setSubmitting(true);
    try {
      const r = await api.post<{ present: number; absent: number; leave: number; no_card: number[] }>(
        `/api/lessons/${lessonId}/attendance`,
        { records: students.map((s) => ({ student_id: s.id, status: picks[s.id] })) },
      );
      const noCardNote =
        r.no_card.length > 0 ? `；${r.no_card.length} 人无可用课时卡（未扣课）` : '';
      showToast(`点名完成：到课 ${r.present}、缺勤 ${r.absent}、请假 ${r.leave}${noCardNote}`);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="app-design-shell flex min-h-screen items-center justify-center text-ink-tertiary">加载中…</p>;
  if (error) return <p className="app-design-shell flex min-h-screen items-center justify-center text-error">{error}</p>;
  if (!data || !lesson) return <p className="app-design-shell flex min-h-screen items-center justify-center text-ink-tertiary">未找到这节课</p>;

  return (
    <div className="app-design-shell standalone-page-content min-h-screen px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">点名</h1>
          <p className="mt-1 text-sm text-ink-tertiary">
            {lesson.class_name} · {fmtCN(lesson.date)} {WEEKDAY_NAMES[weekdayOf(lesson.date)]}{' '}
            {lesson.start_time}–{lesson.end_time} · {lesson.teacher_name}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowContent(true)}
            className="btn-secondary px-3 py-1.5 text-sm text-primary"
          >
            课堂内容
          </button>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            返回
          </button>
        </div>
      </div>

      {showContent && lessonId && (
        <LessonContentModal lessonId={Number(lessonId)} onClose={() => setShowContent(false)} />
      )}

      {done && (
        <p className="mb-4 rounded-xl bg-page px-3 py-2 text-sm text-ink-secondary">
          这节课已完成点名（如下为提交结果）。
        </p>
      )}

      <div className="card overflow-hidden">
        {data.students.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            这个班还没有学员，先去<Link to="/manage/classes" className="text-primary underline">班级管理</Link>报班
          </p>
        )}
        {data.students.map((s) => {
          // 已完成：显示提交结果；未完成：显示本地勾选
          const current = done ? (s.attendance?.status ?? null) : (picks[s.id] ?? null);
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-0"
            >
              <div>
                <p className="font-medium text-ink">
                  {s.name}
                  {s.grade ? <span className="ml-1 text-xs text-ink-muted">{s.grade}</span> : null}
                </p>
                <p className="text-xs text-ink-muted">
                  该科目剩余 {s.balance} 节
                  {s.attendance?.deducted ? ' · 本次已扣 1 节' : ''}
                </p>
              </div>
              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map((st) => (
                  <button
                    key={st}
                    disabled={done}
                    onClick={() => setPicks({ ...picks, [s.id]: st })}
                    className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                      current === st
                        ? STATUS_STYLES[st]
                        : 'border-border text-ink-tertiary hover:bg-border-light'
                    } ${done ? 'cursor-default' : ''}`}
                  >
                    {ATTENDANCE_LABELS[st]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {!done && data.students.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="btn-primary disabled:opacity-60"
          >
            {submitting ? '提交中…' : '提交点名'}
          </button>
        </div>
      )}
    </div>
  );
}
