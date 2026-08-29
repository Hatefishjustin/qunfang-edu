// 家长/学生端 · 课时卡：余额进度条 + 流水明细（只读）
import { useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { CARD_STATUS_LABELS, LEDGER_REASON_LABELS } from '../../types';
import type { MyCard } from '../../types';

export default function FamilyCardsPage() {
  const { data: cards, loading, error } = useApiData<MyCard[]>('/api/me/cards');
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">课时卡</h1>
      <p className="mb-6 text-sm text-ink-tertiary">每张卡的剩余课时与变动记录</p>

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}
      {cards && cards.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-sm text-ink-muted">
          还没有课时卡，请联系校区老师购课
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards?.map((card) => {
          const pct = Math.min(100, (card.used_lessons / card.total_lessons) * 100);
          const open = expanded === card.id;
          return (
            <div key={card.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink">
                    {card.course_name}
                    {card.student_name ? <span className="ml-1 text-sm text-ink-muted">· {card.student_name}</span> : null}
                  </p>
                  {card.title && <p className="mt-0.5 text-xs text-ink-muted">{card.title}</p>}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    card.status === 'active' && !card.expired
                      ? 'badge-primary'
                      : 'badge-muted'
                  }`}
                >
                  {card.expired && card.status === 'active' ? '已过期' : CARD_STATUS_LABELS[card.status]}
                </span>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-primary">
                    {card.balance}
                    <span className="ml-1 text-sm font-normal text-ink-muted">/ {card.total_lessons} 节</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {card.valid_until ? `有效期至 ${card.valid_until}` : '长期有效'}
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <button
                onClick={() => setExpanded(open ? null : card.id)}
                className="mt-3 w-full rounded-xl border border-border py-1.5 text-sm text-ink-tertiary hover:bg-border-light"
              >
                {open ? '收起流水' : '查看流水'}
              </button>

              {open && (
                <div className="mt-3 space-y-1.5">
                  {card.ledger.length === 0 && (
                    <p className="py-2 text-center text-xs text-ink-muted">暂无记录</p>
                  )}
                  {card.ledger.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-xl bg-page/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-ink">{LEDGER_REASON_LABELS[entry.reason]}</p>
                        <p className="text-xs text-ink-muted">
                          {entry.created_at.slice(0, 16).replace('T', ' ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${entry.change > 0 ? 'text-primary' : 'text-error'}`}>
                          {entry.change > 0 ? '+' : ''}
                          {entry.change}
                        </p>
                        <p className="text-xs text-ink-muted">余 {entry.balance_after}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
