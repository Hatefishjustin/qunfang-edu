// 班级管理：CRUD（删除=归档）+ 学员报班/退班
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import type { ClassItem, Course, EnrollmentItem, Student, Teacher } from '../../types';

// ---------- 班级学员管理弹窗 ----------
function EnrollmentsModal({
  cls,
  onClose,
  onChanged,
}: {
  cls: ClassItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data, loading, reload } = useApiData<EnrollmentItem[]>(
    `/api/classes/${cls.id}/enrollments`,
  );
  const { data: students } = useApiData<Student[]>('/api/students');
  const { showToast } = useToast();
  const [selected, setSelected] = useState('');

  async function enroll() {
    if (!selected) {
      showToast('请选择学员', 'error');
      return;
    }
    try {
      await api.post(`/api/classes/${cls.id}/enrollments`, { student_id: Number(selected) });
      showToast('报班成功');
      setSelected('');
      reload();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '报班失败', 'error');
    }
  }

  async function remove(studentId: number, name: string) {
    if (!window.confirm(`确定将「${name}」移出班级吗？`)) return;
    try {
      await api.del(`/api/classes/${cls.id}/enrollments/${studentId}`);
      showToast('已退班');
      reload();
      onChanged();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '退班失败', 'error');
    }
  }

  return (
    <Modal title={`班级学员 · ${cls.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 select"
          >
            <option value="">选择要报班的学员…</option>
            {students?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.grade ? `（${s.grade}）` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => void enroll()}
            className="btn-primary"
          >
            报班
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-ink-tertiary">加载中…</p>
        ) : (
          <div className="divide-y divide-black/5 rounded-xl border border-border">
            {data?.map((e) => (
              <div key={e.student_id} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-ink">{e.name}</p>
                  <p className="text-xs text-ink-muted">{e.grade ?? ''}</p>
                </div>
                <button
                  onClick={() => void remove(e.student_id, e.name)}
                  className="rounded-xl border border-error-bg px-2.5 py-1 text-xs text-error hover:bg-error-soft"
                >
                  退班
                </button>
              </div>
            ))}
            {data?.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">暂无学员</p>
            )}
          </div>
        )}
        <p className="text-xs text-ink-muted">
          已报 {data?.length ?? 0} / 容量 {cls.capacity} 人
        </p>
      </div>
    </Modal>
  );
}

// ---------- 主页面 ----------
export default function ClassesPage() {
  const { campusId } = useManage();
  const { data, loading, error, reload } = useApiData<ClassItem[]>(
    `/api/classes${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { data: courses } = useApiData<Course[]>(
    `/api/courses${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { data: teachers } = useApiData<Teacher[]>(
    `/api/teachers${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<
    { mode: 'create' | 'edit'; cls?: ClassItem } | { mode: 'students'; cls: ClassItem } | null
  >(null);
  const [form, setForm] = useState({ name: '', course_id: '', head_teacher_id: '', capacity: '12' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.course_id) {
      showToast('班级名称和课程不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        course_id: Number(form.course_id),
        head_teacher_id: form.head_teacher_id ? Number(form.head_teacher_id) : null,
        capacity: Number(form.capacity) || 12,
        ...(campusId !== null ? { campus_id: campusId } : {}),
      };
      if (modal?.mode === 'create') {
        await api.post('/api/classes', payload);
        showToast('班级创建成功');
      } else if (modal?.mode === 'edit' && modal.cls) {
        await api.patch(`/api/classes/${modal.cls.id}`, payload);
        showToast('班级已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(cls: ClassItem) {
    if (!window.confirm(`确定归档班级「${cls.name}」吗？归档后不再显示。`)) return;
    try {
      await api.del(`/api/classes/${cls.id}`);
      showToast('班级已归档');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '归档失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">班级管理</h1>
          <p className="mt-1 text-sm text-ink-tertiary">共 {data?.length ?? 0} 个进行中班级</p>
        </div>
        <button
          onClick={() => {
            setForm({ name: '', course_id: '', head_teacher_id: '', capacity: '12' });
            setModal({ mode: 'create' });
          }}
          className="btn-primary"
        >
          + 新建班级
        </button>
      </div>

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}

      <div className="table-container">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-4 py-3 font-medium">班级</th>
              <th className="px-4 py-3 font-medium">课程</th>
              <th className="px-4 py-3 font-medium">主班老师</th>
              <th className="px-4 py-3 font-medium">人数</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((cls) => (
              <tr key={cls.id} className="table-row">
                <td className="px-4 py-3">
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm align-middle"
                    style={{ backgroundColor: cls.course_color ?? '#7c9a6e' }}
                  />
                  <span className="font-medium text-ink">{cls.name}</span>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{cls.course_name ?? '—'}</td>
                <td className="px-4 py-3 text-ink-secondary">{cls.head_teacher_name ?? '未指定'}</td>
                <td className="px-4 py-3 text-ink-secondary">
                  {cls.enrolled_count} / {cls.capacity}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => setModal({ mode: 'students', cls })}
                    className="mr-1.5 btn-secondary"
                  >
                    学员
                  </button>
                  <button
                    onClick={() => {
                      setForm({
                        name: cls.name,
                        course_id: String(cls.course_id),
                        head_teacher_id: cls.head_teacher_id ? String(cls.head_teacher_id) : '',
                        capacity: String(cls.capacity),
                      });
                      setModal({ mode: 'edit', cls });
                    }}
                    className="mr-1.5 btn-secondary"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleArchive(cls)}
                    className="btn-danger"
                  >
                    归档
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                  暂无班级
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 学员管理弹窗 */}
      {modal?.mode === 'students' && (
        <EnrollmentsModal cls={modal.cls} onClose={() => setModal(null)} onChanged={reload} />
      )}

      {/* 新建 / 编辑弹窗 */}
      {modal && (modal.mode === 'create' || modal.mode === 'edit') && (
        <Modal
          title={modal.mode === 'create' ? '新建班级' : `编辑班级 · ${modal.cls?.name}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              班级名称
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：周六美术基础A班"
                className="input mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              课程
              <select
                value={form.course_id}
                onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">请选择课程</option>
                {courses?.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.name}
                    {co.campus_id === null ? '（通用）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-ink">
              主班老师（选填）
              <select
                value={form.head_teacher_id}
                onChange={(e) => setForm({ ...form, head_teacher_id: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">不指定</option>
                {teachers?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.subject ? `（${t.subject}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-ink">
              容量（人数上限）
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className="input mt-1.5"
              />
            </label>
            <p className="rounded-xl bg-page px-3 py-2 text-xs text-ink-tertiary">
              一对一课程 = 建容量为 1 的班级，只报 1 名学员即可。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:opacity-60"
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
