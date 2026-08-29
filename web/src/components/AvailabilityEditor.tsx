// 可用时间编辑器（教师自报 / 管理员代管共用）：
// 周几 + 起止时间 + 类型，保存时整表替换（PUT 全量覆盖）
import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { useApiData } from '../hooks/useApiData';
import { useToast } from './Toast';
import { WEEKDAY_NAMES } from '../types';
import type { AvailabilityRule } from '../types';

type RuleDraft = { weekday: number; start_time: string; end_time: string; kind: string };

export default function AvailabilityEditor({
  teacherId,
  onCancel,
  onSaved,
}: {
  teacherId: number;
  /** 有值时显示取消按钮（弹窗场景） */
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const { data, loading } = useApiData<AvailabilityRule[]>(`/api/teachers/${teacherId}/availability`);
  const [drafts, setDrafts] = useState<RuleDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  // 首次加载后把接口数据复制为可编辑草稿
  const rules = drafts ?? (data ?? []).map((r) => ({ ...r }));
  const setRules = (next: RuleDraft[]) => setDrafts(next);

  function updateRule(i: number, patch: Partial<RuleDraft>) {
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    for (const r of rules) {
      if (!r.start_time || !r.end_time || r.start_time >= r.end_time) {
        showToast('每条规则需要有效起止时间（开始早于结束）', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      await api.put(`/api/teachers/${teacherId}/availability`, { rules });
      showToast('可用时间已保存');
      onSaved?.();
      if (onCancel) onCancel();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/50">加载中…</p>;

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="rounded-lg bg-primary-bg px-3 py-2 text-sm text-ink/50">
          还没有申报时间。添加规则后，排课时就能看到这位老师什么时候有空。
        </p>
      )}
      {rules.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select
            value={r.weekday}
            onChange={(e) => updateRule(i, { weekday: Number(e.target.value) })}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          >
            {WEEKDAY_NAMES.map((n, idx) => (
              <option key={idx} value={idx}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={r.start_time}
            onChange={(e) => updateRule(i, { start_time: e.target.value })}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
          <span className="text-ink/40">–</span>
          <input
            type="time"
            value={r.end_time}
            onChange={(e) => updateRule(i, { end_time: e.target.value })}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          />
          <select
            value={r.kind}
            onChange={(e) => updateRule(i, { kind: e.target.value })}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-sm"
          >
            <option value="available">可上课</option>
            <option value="unavailable">不可上课</option>
          </select>
          <button
            onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
            className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
            aria-label="删除此条"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          setRules([...rules, { weekday: 0, start_time: '09:00', end_time: '12:00', kind: 'available' }])
        }
        className="mt-2 w-full rounded-lg border border-dashed border-black/20 py-2 text-sm text-ink/60 hover:border-primary hover:text-primary"
      >
        + 添加时段
      </button>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
          >
            取消
          </button>
        )}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
