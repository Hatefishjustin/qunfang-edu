// 总管理员 · 校区管理：增删改查
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import type { Campus } from '../../types';

type CampusForm = { name: string; address: string; phone: string };

const EMPTY_FORM: CampusForm = { name: '', address: '', phone: '' };

export default function CampusesPage() {
  const { data, loading, error, reload } = useApiData<Campus[]>('/api/campuses');
  const { showToast } = useToast();

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; id?: number } | null>(null);
  const [form, setForm] = useState<CampusForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm(EMPTY_FORM);
    setModal({ mode: 'create' });
  }

  function openEdit(c: Campus) {
    setForm({ name: c.name, address: c.address ?? '', phone: c.phone ?? '' });
    setModal({ mode: 'edit', id: c.id });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('校区名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await api.post('/api/campuses', form);
        showToast('校区创建成功');
      } else if (modal?.mode === 'edit' && modal.id !== undefined) {
        await api.patch(`/api/campuses/${modal.id}`, form);
        showToast('校区已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Campus) {
    if (!window.confirm(`确定删除校区「${c.name}」吗？删除后不可恢复。`)) return;
    try {
      await api.del(`/api/campuses/${c.id}`);
      showToast('校区已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">校区管理</h1>
          <p className="mt-1 text-sm text-ink/50">共 {data?.length ?? 0} 个校区</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 新建校区
        </button>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">校区</th>
              <th className="px-4 py-3 font-medium">地址</th>
              <th className="px-4 py-3 font-medium">电话</th>
              <th className="px-4 py-3 font-medium">教师 / 学员 / 班级</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-ink/70">{c.address ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">
                  {c.teacher_count} / {c.student_count} / {c.class_count}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(c)}
                    className="mr-2 rounded-lg border border-black/10 px-3 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleDelete(c)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink/40">
                  暂无校区
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? '新建校区' : '编辑校区'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              校区名称
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：阳光广场校区"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              地址（选填）
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              电话（选填）
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
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
    </div>
  );
}
