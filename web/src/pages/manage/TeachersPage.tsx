// 教师管理：列表 / 新建 / 编辑 / 软删 / 可用时间编辑
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import AvailabilityEditor from '../../components/AvailabilityEditor';
import { useManage } from './ManageLayout';
import type { Teacher } from '../../types';

// ---------- 主页面 ----------
export default function TeachersPage() {
  const { campusId } = useManage();
  const { data, loading, error, reload } = useApiData<Teacher[]>(
    `/api/teachers${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; teacher: Teacher }
    | { mode: 'availability'; teacher: Teacher }
    | null
  >(null);
  const [form, setForm] = useState({ name: '', phone: '', subject: '', password: '' });
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({ name: '', phone: '', subject: '', password: '' });
    setModal({ mode: 'create' });
  }

  function openEdit(t: Teacher) {
    setForm({ name: t.name, phone: t.phone, subject: t.subject ?? '', password: '' });
    setModal({ mode: 'edit', teacher: t });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      showToast('姓名和手机号不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await api.post('/api/teachers', {
          name: form.name,
          phone: form.phone,
          subject: form.subject,
          ...(form.password ? { password: form.password } : {}),
          ...(campusId !== null ? { campus_id: campusId } : {}),
        });
        showToast('教师创建成功');
      } else if (modal?.mode === 'edit') {
        await api.patch(`/api/teachers/${modal.teacher.id}/profile`, {
          name: form.name,
          phone: form.phone,
          subject: form.subject,
        });
        showToast('教师信息已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Teacher) {
    if (!window.confirm(`确定删除教师「${t.name}」吗？其账号将被停用。`)) return;
    try {
      await api.del(`/api/teachers/${t.id}`);
      showToast('教师已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">教师管理</h1>
          <p className="mt-1 text-sm text-ink/50">
            共 {data?.length ?? 0} 位教师 · 负荷为本周已排课次数
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 新建教师
        </button>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">手机号</th>
              <th className="px-4 py-3 font-medium">科目</th>
              <th className="px-4 py-3 font-medium">可用时段</th>
              <th className="px-4 py-3 font-medium">本周负荷</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">
                  {t.name}
                  {t.status === 'disabled' && (
                    <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      已禁用
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink/70">{t.phone}</td>
                <td className="px-4 py-3 text-ink/70">{t.subject ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{t.rule_count} 条</td>
                <td className="px-4 py-3 text-ink/70">{t.week_load} 节</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => setModal({ mode: 'availability', teacher: t })}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    可用时间
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleDelete(t)}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink/40">
                  暂无教师
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新建 / 编辑弹窗 */}
      {modal && (modal.mode === 'create' || modal.mode === 'edit') && (
        <Modal
          title={modal.mode === 'create' ? '新建教师' : `编辑教师 · ${modal.teacher.name}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              姓名
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              手机号（登录账号）
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              主教学科（选填）
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="如：美术"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            {modal.mode === 'create' && (
              <label className="block text-sm font-medium text-ink">
                初始密码（选填，默认 Passw0rd!）
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 可用时间弹窗 */}
      {modal?.mode === 'availability' && (
        <Modal title={`可用时间 · ${modal.teacher.name}`} onClose={() => setModal(null)}>
          <AvailabilityEditor
            teacherId={modal.teacher.id}
            onCancel={() => setModal(null)}
            onSaved={reload}
          />
        </Modal>
      )}
    </div>
  );
}
