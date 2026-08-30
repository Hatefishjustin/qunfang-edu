import { CalendarClock, CalendarX2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { MyLesson, ScheduleRequestType } from '../types';
import { addDays, todayStr } from '../util/date';
import Modal from './Modal';
import { useToast } from './Toast';

export default function ScheduleRequestModal({
  lesson,
  studentId,
  onClose,
  onSubmitted,
}: {
  lesson: MyLesson;
  studentId: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { showToast } = useToast();
  const [type, setType] = useState<ScheduleRequestType>('reschedule');
  const [reason, setReason] = useState('');
  const [requestedDate, setRequestedDate] = useState(
    lesson.date >= todayStr() ? addDays(lesson.date, 7) : todayStr(),
  );
  const [requestedStart, setRequestedStart] = useState(lesson.start_time);
  const [requestedEnd, setRequestedEnd] = useState(lesson.end_time);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      showToast('请填写申请原因', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/schedule-requests', {
        lesson_id: lesson.id,
        student_id: studentId,
        request_type: type,
        reason: reason.trim(),
        requested_date: type === 'reschedule' ? requestedDate : null,
        requested_start: type === 'reschedule' ? requestedStart : null,
        requested_end: type === 'reschedule' ? requestedEnd : null,
      });
      showToast(`${type === 'leave' ? '请假' : '调课'}申请已提交`);
      onSubmitted();
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '提交失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="课程申请" onClose={onClose}>
      <div className="space-y-4">
        <div className="glass-inset rounded-xl p-3 text-sm">
          <p className="font-medium text-ink">{lesson.course_name ?? lesson.class_name ?? '课程'}</p>
          <p className="mt-1 text-xs text-ink-tertiary">
            {lesson.date} · {lesson.start_time}-{lesson.end_time} · {lesson.teacher_name ?? '待定老师'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="申请类型">
          <button
            type="button"
            onClick={() => setType('reschedule')}
            className={type === 'reschedule' ? 'request-type-active' : 'request-type'}
          >
            <CalendarClock size={18} aria-hidden="true" />
            调课
          </button>
          <button
            type="button"
            onClick={() => setType('leave')}
            className={type === 'leave' ? 'request-type-active' : 'request-type'}
          >
            <CalendarX2 size={18} aria-hidden="true" />
            请假
          </button>
        </div>

        {type === 'reschedule' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-ink-secondary sm:col-span-3">
              期望日期
              <input
                type="date"
                name="requested_date"
                autoComplete="off"
                min={todayStr()}
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
                className="input mt-1.5"
              />
            </label>
            <label className="text-sm font-medium text-ink-secondary">
              开始
              <input
                type="time"
                name="requested_start"
                autoComplete="off"
                value={requestedStart}
                onChange={(event) => setRequestedStart(event.target.value)}
                className="input mt-1.5"
              />
            </label>
            <label className="text-sm font-medium text-ink-secondary">
              结束
              <input
                type="time"
                name="requested_end"
                autoComplete="off"
                value={requestedEnd}
                onChange={(event) => setRequestedEnd(event.target.value)}
                className="input mt-1.5"
              />
            </label>
          </div>
        )}

        <label className="block text-sm font-medium text-ink-secondary">
          {type === 'leave' ? '请假原因' : '调课原因'}
          <textarea
            name="request_reason"
            autoComplete="off"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={500}
            className="input mt-1.5"
            placeholder={type === 'leave' ? '请说明请假原因…' : '请说明原因和方便的时间…'}
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">取消</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? '提交中…' : '提交申请'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
