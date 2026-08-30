import { CalendarClock, CalendarX2 } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
} from '../../types';
import type { ScheduleRequest, ScheduleRequestStatus } from '../../types';
import { useToast } from '../../components/Toast';

const STATUS_CLASS: Record<ScheduleRequestStatus, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
  cancelled: 'badge-muted',
};

export default function FamilyRequestsPage() {
  const { data, loading, error, reload } = useApiData<ScheduleRequest[]>('/api/schedule-requests');
  const { showToast } = useToast();

  async function cancel(request: ScheduleRequest) {
    if (!window.confirm('确定取消这条申请吗？')) return;
    try {
      await api.patch(`/api/schedule-requests/${request.id}/cancel`, {});
      showToast('申请已取消');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '取消失败', 'error');
    }
  }

  return (
    <div className="mobile-liquid-page">
      <div className="mb-5">
        <p className="glass-label mb-2 inline-flex rounded-full px-3 py-1 text-[11px] font-medium text-primary">课程服务</p>
        <h1 className="text-xl font-bold text-ink">我的申请</h1>
        <p className="mt-1 text-sm text-ink-tertiary">查看调课与请假处理进度</p>
      </div>

      {loading && <p className="text-sm text-ink-muted">加载中…</p>}
      {error && <p className="text-sm text-error">{error}</p>}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <div className="empty-state">暂时没有申请记录，可从课表中的课程提交申请</div>
      )}

      <div className="space-y-3">
        {data?.map((request) => (
          <article key={request.id} className="card p-4">
            <div className="flex items-start gap-3">
              <div className="glass-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                {request.request_type === 'leave'
                  ? <CalendarX2 size={19} aria-hidden="true" />
                  : <CalendarClock size={19} aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{REQUEST_TYPE_LABELS[request.request_type]}申请</h2>
                  <span className={STATUS_CLASS[request.status]}>{REQUEST_STATUS_LABELS[request.status]}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">
                  {request.course_name ?? request.class_name ?? '课程'} · {request.student_name ?? '学员'}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  原安排 {request.lesson_date} {request.lesson_start}-{request.lesson_end}
                </p>
                {request.request_type === 'reschedule' && request.requested_date && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    期望 {request.requested_date} {request.requested_start}-{request.requested_end}
                  </p>
                )}
              </div>
            </div>

            <div className="glass-inset mt-3 rounded-xl px-3 py-2 text-sm text-ink-secondary">
              {request.reason}
            </div>
            {request.review_note && (
              <p className="mt-2 text-xs text-ink-tertiary">
                审批备注：{request.review_note}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between text-[11px] text-ink-muted">
              <span>{request.created_at.slice(0, 16)}</span>
              {request.status === 'pending' && (
                <button type="button" onClick={() => void cancel(request)} className="btn-ghost px-3 py-1.5 text-xs">
                  取消申请
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

