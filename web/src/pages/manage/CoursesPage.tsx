// 课程科目管理：CRUD（super_admin 可建全校区通用课程）
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import type { Course } from '../../types';

/** 课程日历色板（8 色低饱和） */
const PALETTE = [
  '#7c9a6e', '#6e8d9a', '#9a6e8d', '#8d9a6e',
  '#6e9a8d', '#9a8d6e', '#8d6e9a', '#6e9a7c',
];

export default function CoursesPage() {
  const { campusId, isSuperAdmin } = useManage();
  const { data, loading, error, reload } = useApiData<Course[]>(
    `/api/courses${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; course?: Course } | null>(null);
  const [form, setForm] = useState({ name: '', duration: '90', color: PALETTE[0] });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('课程名称不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        default_duration_min: Number(form.duration) || 90,
        color: form.color,
        // super_admin 在"全部校区"视图下创建的课程为全校区通用
        ...(isSuperAdmin ? { campus_id: campusId } : {}),
      };
      if (modal?.mode === 'create') {
        await api.post('/api/courses', payload);
        showToast('课程创建成功');
      } else if (modal?.mode === 'edit' && modal.course) {
        await api.patch(`/api/courses/${modal.course.id}`, payload);
        showToast('课程已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course: Course) {
    if (!window.confirm(`确定删除课程「${course.name}」吗？`)) return;
    try {
      await api.del(`/api/courses/${course.id}`);
      showToast('课程已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">课程管理</h1>
          <p className="mt-1 text-sm text-ink/50">
            共 {data?.length ?? 0} 个科目
            {isSuperAdmin && campusId === null ? ' · 当前视图创建的课程为全校区通用' : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setForm({ name: '', duration: '90', color: PALETTE[0] });
            setModal({ mode: 'create' });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 新建课程
        </button>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((course) => (
          <div
            key={course.id}
            className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
            style={{ borderLeft: `4px solid ${course.color ?? PALETTE[0]}` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-ink">{course.name}</h2>
                <p className="mt-0.5 text-xs text-ink/50">
                  默认 {course.default_duration_min} 分钟
                  {course.campus_id === null ? ' · 全校区通用' : ''}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setForm({
                      name: course.name,
                      duration: String(course.default_duration_min),
                      color: course.color ?? PALETTE[0],
                    });
                    setModal({ mode: 'edit', course });
                  }}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                >
                  编辑
                </button>
                <button
                  onClick={() => void handleDelete(course)}
                  className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? '新建课程' : `编辑课程 · ${modal.course?.name}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              课程名称
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：少儿美术"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              默认时长（分钟）
              <input
                type="number"
                min="30"
                step="15"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="text-sm font-medium text-ink">
              日历颜色
              <div className="mt-2 flex flex-wrap gap-2">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, color })}
                    className={`h-8 w-8 rounded-lg transition-transform ${
                      form.color === color ? 'scale-110 ring-2 ring-ink/30' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`选择颜色 ${color}`}
                  />
                ))}
              </div>
            </div>
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
