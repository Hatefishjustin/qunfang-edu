import { Check, Clock3, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { useApiData } from '../../hooks/useApiData';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
} from '../../types';
import type { ScheduleRequest, ScheduleRequestStatus } from '../../types';
import { useSchedule } from './ScheduleLayout';

const STATUS_CLASS: Record<ScheduleRequestStatus, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
  cancelled: 'badge-muted',
};

type ReviewState = { request: ScheduleRequest; action: 'approve' | 'reject' };

export default function ScheduleRequestsPage() {
  const { campusId, isSuperAdmin } = useSchedule();
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const [review, setReview] = useState<ReviewState | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (isSuperAdmin && campusId !== null) params.set('campus_id', String(campusId));
    if (status === 'pending') params.set('status', 'pending');
    return `/api/schedule-requests?${params.toString()}`;
  }, [campusId, isSuperAdmin, status]);
  const { data, loading, error, reload } = useApiData<ScheduleRequest[]>(query);

  function beginReview(request: ScheduleRequest, action: 'approve' | 'reject') {
    setNote('');
    setReview({ request, action });
  }

  async function submitReview() {
    if (!review) return;
    setSaving(true);
    try {
      await api.patch(`/api/schedule-requests/${review.request.id}/review`, {
        action: review.action,
        review_note: note.trim() || null,
      });
      showToast(review.action === 'approve' ? '申请已批准' : '申请已驳回');
      setReview(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '审批失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="glass-label mb-2 inline-flex rounded-full px-3 py-1 text-[11px] font-medium text-primary">教务协同</p>
          <h1 className="text-2xl font-bold text-ink">申请审批</h1>
          <p className="mt-1 text-sm text-ink-tertiary">处理家长和学生提交的调课、请假申请</p>
        </div>
        <div className="glass-inset flex rounded-xl p-1" role="group" aria-label="申请筛选">
          <button type="button" onClick={() => setStatus('pending')} className={status === 'pending' ? 'nav-tab-active' : 'nav-tab'}>
            待审批
          </button>
          <button type="button" onClick={() => setStatus('all')} className={status === 'all' ? 'nav-tab-active' : 'nav-tab'}>
            全部记录
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-ink-muted">加载中…</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <div className="empty-state">{status === 'pending' ? '当前没有待审批申请' : '暂无申请记录'}</div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {data?.map((request) => (
          <article key={request.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{REQUEST_TYPE_LABELS[request.request_type]} · {request.student_name ?? '学员'}</h2>
                  <span className={STATUS_CLASS[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">{request.course_name ?? request.class_name ?? '课程'}</p>
              </div>
              <div className="glass-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                <Clock3 size={19} aria-hidden="true" />
              </div>
            </div>

            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="glass-inset rounded-xl px-3 py-2">
                <dt className="text-xs text-ink-muted">原安排</dt>
                <dd className="mt-0.5 text-ink">{request.lesson_date} {request.lesson_start}-{request.lesson_end}</dd>
              </div>
              <div className="glass-inset rounded-xl px-3 py-2">
                <dt className="text-xs text-ink-muted">申请人</dt>
                <dd className="mt-0.5 text-ink">{request.requester_name ?? '未知'} · {request.created_at.slice(0, 16)}</dd>
              </div>
            </dl>
            {request.request_type === 'reschedule' && request.requested_date && (
              <p className="mt-3 text-sm font-medium text-primary">
                期望调整为 {request.requested_date} {request.requested_start}-{request.requested_end}
              </p>
            )}
            <p className="mt-3 rounded-xl border border-border/70 px-3 py-2 text-sm leading-6 text-ink-secondary">
              {request.reason}
            </p>
            {request.review_note && (
              <p className="mt-2 text-xs text-ink-tertiary">审批备注：{request.review_note}</p>
            )}

            {request.status === 'pending' && (
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => beginReview(request, 'reject')} className="btn-secondary inline-flex items-center gap-1.5">
                  <X size={15} aria-hidden="true" />
                  驳回
                </button>
                <button type="button" onClick={() => beginReview(request, 'approve')} className="btn-primary inline-flex items-center gap-1.5">
                  <Check size={15} aria-hidden="true" />
                  批准
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {review && (
        <Modal title={review.action === 'approve' ? '批准申请' : '驳回申请'} onClose={() => setReview(null)}>
          <div className="space-y-4">
            <div className="glass-inset rounded-xl p-3 text-sm text-ink-secondary">
              <p className="font-medium text-ink">{REQUEST_TYPE_LABELS[review.request.request_type]} · {review.request.student_name}</p>
              <p className="mt-1">{review.request.course_name ?? review.request.class_name} · {review.request.lesson_date} {review.request.lesson_start}-{review.request.lesson_end}</p>
            </div>
            {review.action === 'approve' && review.request.request_type === 'reschedule' && (
              <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm text-primary-dark">
                批准后会先检查老师、教室和不可用时段；无冲突才会修改课表。
              </p>
            )}
            <label className="block text-sm font-medium text-ink-secondary">
              审批备注（选填）
              <textarea
                name="review_note"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={500}
                className="input mt-1.5"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReview(null)} className="btn-secondary">取消</button>
              <button type="button" onClick={() => void submitReview()} disabled={saving} className={review.action === 'approve' ? 'btn-primary' : 'btn-danger'}>
                {saving ? '处理中…' : '确认'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
