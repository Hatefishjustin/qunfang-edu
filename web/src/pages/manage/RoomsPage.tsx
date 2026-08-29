// 教室管理：简单 CRUD
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import type { Room } from '../../types';

export default function RoomsPage() {
  const { campusId } = useManage();
  const { data, loading, error, reload } = useApiData<Room[]>(
    `/api/rooms${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; room?: Room } | null>(null);
  const [form, setForm] = useState({ name: '', capacity: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('教室名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await api.post('/api/rooms', {
          name: form.name,
          capacity: form.capacity ? Number(form.capacity) : null,
          ...(campusId !== null ? { campus_id: campusId } : {}),
        });
        showToast('教室创建成功');
      } else if (modal?.mode === 'edit' && modal.room) {
        await api.patch(`/api/rooms/${modal.room.id}`, {
          name: form.name,
          capacity: form.capacity ? Number(form.capacity) : null,
        });
        showToast('教室已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: Room) {
    if (!window.confirm(`确定删除教室「${r.name}」吗？`)) return;
    try {
      await api.del(`/api/rooms/${r.id}`);
      showToast('教室已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">教室管理</h1>
          <p className="mt-1 text-sm text-ink/50">共 {data?.length ?? 0} 间教室</p>
        </div>
        <button
          onClick={() => {
            setForm({ name: '', capacity: '' });
            setModal({ mode: 'create' });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 新建教室
        </button>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">教室</th>
              <th className="px-4 py-3 font-medium">容纳人数</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3 text-ink/70">{r.capacity ?? '不限'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setForm({ name: r.name, capacity: r.capacity ? String(r.capacity) : '' });
                      setModal({ mode: 'edit', room: r });
                    }}
                    className="mr-2 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleDelete(r)}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-ink/40">
                  暂无教室
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? '新建教室' : '编辑教室'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              教室名称
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：美术教室A"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              容纳人数（选填）
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
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
