// 学员管理：CRUD（软删）+ 搜索 + 详情（家长/报班/课时卡）
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import type { Student } from '../../types';

type StudentDetail = Student & {
  created_at: string;
  parents: { id: number; name: string; relation: string | null; user_id: number | null }[];
  enrollments: {
    class_id: number;
    class_name: string;
    course_name: string;
    enrolled_at: string;
  }[];
  cards: {
    id: number;
    course_id: number;
    title: string | null;
    total_lessons: number;
    used_lessons: number;
    status: string;
    valid_until: string | null;
  }[];
};

export default function StudentsPage() {
  const { campusId } = useManage();
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApiData<Student[]>(
    `/api/students?${new URLSearchParams({
      ...(campusId !== null ? { campus_id: String(campusId) } : {}),
      ...(search ? { search } : {}),
    }).toString()}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<
    { mode: 'create' | 'edit'; student?: Student } | { mode: 'detail'; studentId: number } | null
  >(null);
  const [form, setForm] = useState({ name: '', grade: '', birth_date: '', note: '' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('学员姓名不能为空', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        grade: form.grade || null,
        birth_date: form.birth_date || null,
        note: form.note || null,
        ...(campusId !== null ? { campus_id: campusId } : {}),
      };
      if (modal?.mode === 'create') {
        await api.post('/api/students', payload);
        showToast('学员创建成功');
      } else if (modal?.mode === 'edit' && modal.student) {
        await api.patch(`/api/students/${modal.student.id}`, payload);
        showToast('学员信息已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: Student) {
    if (!window.confirm(`确定删除学员「${s.name}」吗？历史课表与课时流水仍可追溯。`)) return;
    try {
      await api.del(`/api/students/${s.id}`);
      showToast('学员已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">学员管理</h1>
          <p className="mt-1 text-sm text-ink/50">共 {data?.length ?? 0} 名学员</p>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名…"
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => {
              setForm({ name: '', grade: '', birth_date: '', note: '' });
              setModal({ mode: 'create' });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            + 新建学员
          </button>
        </div>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">年级</th>
              <th className="px-4 py-3 font-medium">家长</th>
              <th className="px-4 py-3 font-medium">在读班级</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                <td className="px-4 py-3 text-ink/70">{s.grade ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{s.parent_names ?? '—'}</td>
                <td className="px-4 py-3 text-ink/70">{s.class_count} 个</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => setModal({ mode: 'detail', studentId: s.id })}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    详情
                  </button>
                  <button
                    onClick={() => {
                      setForm({
                        name: s.name,
                        grade: s.grade ?? '',
                        birth_date: s.birth_date ?? '',
                        note: s.note ?? '',
                      });
                      setModal({ mode: 'edit', student: s });
                    }}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleDelete(s)}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink/40">
                  {search ? '没有匹配的学员' : '暂无学员'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 详情弹窗 */}
      {modal?.mode === 'detail' && <StudentDetailModal studentId={modal.studentId} onClose={() => setModal(null)} />}

      {/* 新建 / 编辑弹窗 */}
      {modal && (modal.mode === 'create' || modal.mode === 'edit') && (
        <Modal
          title={modal.mode === 'create' ? '新建学员' : `编辑学员 · ${modal.student?.name}`}
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
              年级（选填）
              <input
                type="text"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                placeholder="如：三年级"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              出生日期（选填）
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              备注（选填）
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
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

// ---------- 学员详情 ----------
function StudentDetailModal({ studentId, onClose }: { studentId: number; onClose: () => void }) {
  const { data, loading, error } = useApiData<StudentDetail>(`/api/students/${studentId}`);

  return (
    <Modal title={`学员详情 · ${data?.name ?? ''}`} onClose={onClose}>
      {loading && <p className="text-sm text-ink/50">加载中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-primary-bg p-3">
            <p className="font-medium text-ink">
              {data.name}
              {data.grade ? ` · ${data.grade}` : ''}
            </p>
            <p className="mt-1 text-xs text-ink/50">
              {data.birth_date ? `出生 ${data.birth_date}` : ''}
              {data.note ? ` · ${data.note}` : ''}
            </p>
          </div>

          <div>
            <p className="mb-1.5 font-medium text-ink">家长（{data.parents.length}）</p>
            {data.parents.length === 0 ? (
              <p className="text-xs text-ink/40">未关联，去"家长"页添加</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.parents.map((p) => (
                  <span key={p.id} className="rounded-full bg-primary-light/20 px-2.5 py-1 text-xs text-ink">
                    {p.name}
                    {p.relation ? ` · ${p.relation}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 font-medium text-ink">在读班级（{data.enrollments.length}）</p>
            {data.enrollments.length === 0 ? (
              <p className="text-xs text-ink/40">未报班，去"班级"页报班</p>
            ) : (
              <ul className="space-y-1">
                {data.enrollments.map((e) => (
                  <li key={e.class_id} className="rounded-lg border border-black/5 px-3 py-2">
                    <span className="text-ink">{e.class_name}</span>
                    <span className="ml-2 text-xs text-ink/50">{e.course_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 font-medium text-ink">课时卡（{data.cards.length}）</p>
            {data.cards.length === 0 ? (
              <p className="text-xs text-ink/40">暂无课时卡（售课功能将在后续里程碑开放）</p>
            ) : (
              <ul className="space-y-1">
                {data.cards.map((card) => (
                  <li key={card.id} className="rounded-lg border border-black/5 px-3 py-2">
                    <span className="text-ink">{card.title ?? '课时卡'}</span>
                    <span className="ml-2 text-xs text-ink/50">
                      剩余 {card.total_lessons - card.used_lessons} / {card.total_lessons} 节
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
