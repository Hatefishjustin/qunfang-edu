// 课时卡管理：售课（建卡+流水）/ 卡列表 / 手工调整 / 流水查询
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import { CARD_STATUS_LABELS, LEDGER_REASON_LABELS } from '../../types';
import type { Course, HourCard, LedgerEntry, Student } from '../../types';

export default function CardsPage() {
  const { campusId } = useManage();
  const suffix = campusId !== null ? `?campus_id=${campusId}` : '';
  const { data: cards, loading, error, reload } = useApiData<HourCard[]>(`/api/cards${suffix}`);
  const { data: students } = useApiData<Student[]>(`/api/students${suffix}`);
  const { data: courses } = useApiData<Course[]>(`/api/courses${suffix}`);
  const { showToast } = useToast();

  const [sellOpen, setSellOpen] = useState(false);
  const [adjustCard, setAdjustCard] = useState<HourCard | null>(null);
  const [ledgerCard, setLedgerCard] = useState<HourCard | null>(null);

  // 售课表单
  const [form, setForm] = useState({ studentId: 0, courseId: 0, lessons: 20, validUntil: '', title: '' });
  const [saving, setSaving] = useState(false);

  // 调整表单
  const [adjustForm, setAdjustForm] = useState({ change: '', note: '' });

  async function submitSell(e: FormEvent) {
    e.preventDefault();
    if (!form.studentId) return showToast('请选择学员', 'error');
    if (!form.courseId) return showToast('请选择科目', 'error');
    if (form.lessons < 1) return showToast('课时数需为正整数', 'error');
    setSaving(true);
    try {
      await api.post('/api/cards', {
        student_id: form.studentId,
        course_id: form.courseId,
        total_lessons: form.lessons,
        valid_until: form.validUntil || null,
        title: form.title || null,
      });
      showToast('售课成功，课时卡已创建');
      setSellOpen(false);
      setForm({ studentId: 0, courseId: 0, lessons: 20, validUntil: '', title: '' });
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '售课失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjustCard) return;
    const change = Number(adjustForm.change);
    if (!Number.isInteger(change) || change === 0) return showToast('调整数量需为非零整数', 'error');
    if (!adjustForm.note.trim()) return showToast('调整必须填写备注', 'error');
    setSaving(true);
    try {
      await api.post(`/api/cards/${adjustCard.id}/adjust`, {
        change,
        note: adjustForm.note,
      });
      showToast('调整成功，已记入流水');
      setAdjustCard(null);
      setAdjustForm({ change: '', note: '' });
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '调整失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    'mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">课时卡管理</h1>
          <p className="mt-1 text-sm text-ink/50">
            共 {cards?.length ?? 0} 张卡 · 每笔变动都有流水记录
          </p>
        </div>
        <button
          onClick={() => setSellOpen(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 售课
        </button>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">学员</th>
              <th className="px-4 py-3 font-medium">科目</th>
              <th className="px-4 py-3 font-medium">剩余 / 总课时</th>
              <th className="px-4 py-3 font-medium">进度</th>
              <th className="px-4 py-3 font-medium">有效期</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {cards?.map((card) => {
              const balance = card.total_lessons - card.used_lessons;
              return (
                <tr key={card.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{card.student_name}</td>
                  <td className="px-4 py-3 text-ink/70">{card.course_name}</td>
                  <td className="px-4 py-3 text-ink/70">
                    <span className="font-semibold text-primary">{balance}</span> / {card.total_lessons}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, (card.used_lessons / card.total_lessons) * 100)}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{card.valid_until ?? '长期'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink/60">
                      {CARD_STATUS_LABELS[card.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => setLedgerCard(card)}
                      className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                    >
                      流水
                    </button>
                    <button
                      onClick={() => {
                        setAdjustCard(card);
                        setAdjustForm({ change: '', note: '' });
                      }}
                      className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                    >
                      调整
                    </button>
                  </td>
                </tr>
              );
            })}
            {cards?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink/40">
                  还没有课时卡，点右上角「售课」创建第一张
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 售课弹窗 */}
      {sellOpen && (
        <Modal title="售课（创建课时卡）" onClose={() => setSellOpen(false)}>
          <form onSubmit={submitSell} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              学员
              <select
                value={form.studentId}
                onChange={(e) => setForm({ ...form, studentId: Number(e.target.value) })}
                className={inputCls}
              >
                <option value={0}>请选择学员</option>
                {(students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.grade ? `（${s.grade}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-ink">
              科目（课程）
              <select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: Number(e.target.value) })}
                className={inputCls}
              >
                <option value={0}>请选择科目</option>
                {(courses ?? []).map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-ink">
                课时数
                <input
                  type="number"
                  min={1}
                  value={form.lessons}
                  onChange={(e) => setForm({ ...form, lessons: Number(e.target.value) })}
                  className={inputCls}
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                有效期至（选填）
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  className={inputCls}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-ink">
              备注（选填，如「90分钟课 x 20节」）
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={inputCls}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSellOpen(false)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? '创建中…' : '创建课时卡'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 调整弹窗 */}
      {adjustCard && (
        <Modal
          title={`课时调整 · ${adjustCard.student_name}（${adjustCard.course_name}）`}
          onClose={() => setAdjustCard(null)}
        >
          <p className="mb-3 rounded-lg bg-primary-bg px-3 py-2 text-sm text-ink/60">
            当前剩余 {adjustCard.total_lessons - adjustCard.used_lessons} / {adjustCard.total_lessons} 节。
            正数增加（如赠送），负数减少（如纠错）。
          </p>
          <form onSubmit={submitAdjust} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              调整数（±N）
              <input
                type="number"
                value={adjustForm.change}
                onChange={(e) => setAdjustForm({ ...adjustForm, change: e.target.value })}
                placeholder="如 2 或 -1"
                className={inputCls}
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              备注（必填）
              <input
                type="text"
                value={adjustForm.note}
                onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                placeholder="调整原因"
                className={inputCls}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustCard(null)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? '提交中…' : '确认调整'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 流水弹窗 */}
      {ledgerCard && (
        <LedgerModal card={ledgerCard} onClose={() => setLedgerCard(null)} />
      )}
    </div>
  );
}

// ---------- 流水弹窗 ----------
function LedgerModal({ card, onClose }: { card: HourCard; onClose: () => void }) {
  const { data, loading, error } = useApiData<LedgerEntry[]>(`/api/cards/${card.id}/ledger`);

  return (
    <Modal
      title={`课时流水 · ${card.student_name}（${card.course_name}）`}
      onClose={onClose}
    >
      {loading && <p className="text-sm text-ink/50">加载中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && data.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-ink/40">暂无流水记录</p>
      )}
      {data && data.length > 0 && (
        <div className="space-y-1.5">
          {data.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-black/5 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-ink">{LEDGER_REASON_LABELS[entry.reason]}</p>
                <p className="text-xs text-ink/40">
                  {entry.created_at.slice(0, 16).replace('T', ' ')}
                  {entry.operator_name ? ` · ${entry.operator_name}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-semibold ${
                    entry.change > 0 ? 'text-primary' : 'text-red-600'
                  }`}
                >
                  {entry.change > 0 ? '+' : ''}
                  {entry.change}
                </p>
                <p className="text-xs text-ink/40">余 {entry.balance_after}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
