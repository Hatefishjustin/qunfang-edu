// 家长管理：CRUD（软删）+ 关联学员（多对多）
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useManage } from './ManageLayout';
import type { Parent, Student } from '../../types';

export default function ParentsPage() {
  const { campusId } = useManage();
  const { data, loading, error, reload } = useApiData<Parent[]>(
    `/api/parents${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { data: students } = useApiData<Student[]>(
    `/api/students${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );
  const { showToast } = useToast();

  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; parent?: Parent } | null>(null);
  const [form, setForm] = useState({
    name: '',
    relation: '',
    phone: '',
    password: '',
    student_ids: [] as number[],
  });
  const [saving, setSaving] = useState(false);

  function toggleStudent(id: number) {
    setForm((f) => ({
      ...f,
      student_ids: f.student_ids.includes(id)
        ? f.student_ids.filter((x) => x !== id)
        : [...f.student_ids, id],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('家长姓名不能为空', 'error');
      return;
    }
    if (modal?.mode === 'create' && form.phone && !/^\d{6,20}$/.test(form.phone)) {
      showToast('手机号格式不正确', 'error');
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === 'create') {
        await api.post('/api/parents', {
          name: form.name,
          relation: form.relation || null,
          phone: form.phone || null,
          ...(form.password ? { password: form.password } : {}),
          student_ids: form.student_ids,
          ...(campusId !== null ? { campus_id: campusId } : {}),
        });
        showToast('家长创建成功');
      } else if (modal?.mode === 'edit' && modal.parent) {
        await api.patch(`/api/parents/${modal.parent.id}`, {
          name: form.name,
          relation: form.relation || null,
          student_ids: form.student_ids,
        });
        showToast('家长信息已更新');
      }
      setModal(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Parent) {
    if (!window.confirm(`确定删除家长「${p.name}」吗？`)) return;
    try {
      await api.del(`/api/parents/${p.id}`);
      showToast('家长已删除');
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">家长管理</h1>
          <p className="mt-1 text-sm text-ink-tertiary">共 {data?.length ?? 0} 名家长</p>
        </div>
        <button
          onClick={() => {
            setForm({ name: '', relation: '', phone: '', password: '', student_ids: [] });
            setModal({ mode: 'create' });
          }}
          className="btn-primary"
        >
          + 新建家长
        </button>
      </div>

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}

      <div className="table-container">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">关系</th>
              <th className="px-4 py-3 font-medium">手机号（账号）</th>
              <th className="px-4 py-3 font-medium">孩子</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3 text-ink-secondary">{p.relation ?? '—'}</td>
                <td className="px-4 py-3 text-ink-secondary">{p.phone ?? '未开通登录'}</td>
                <td className="px-4 py-3 text-ink-secondary">{p.student_names ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setForm({
                        name: p.name,
                        relation: p.relation ?? '',
                        phone: '',
                        password: '',
                        // 当前关联的学员需要反查：通过 student_names 无法拿到 id，先置空由用户勾选
                        student_ids: [],
                      });
                      setModal({ mode: 'edit', parent: p });
                    }}
                    className="mr-1.5 btn-secondary"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void handleDelete(p)}
                    className="btn-danger"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                  暂无家长
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? '新建家长' : `编辑家长 · ${modal.parent?.name}`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              姓名
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              关系（选填）
              <select
                value={form.relation}
                onChange={(e) => setForm({ ...form, relation: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-border px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">未指定</option>
                <option value="父亲">父亲</option>
                <option value="母亲">母亲</option>
                <option value="其他">其他</option>
              </select>
            </label>

            {modal.mode === 'create' && (
              <>
                <label className="block text-sm font-medium text-ink">
                  手机号（选填，填写即开通登录账号）
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="11 位手机号"
                    className="input mt-1.5"
                  />
                </label>
                {form.phone && (
                  <label className="block text-sm font-medium text-ink">
                    初始密码（选填，默认 Passw0rd!）
                    <input
                      type="text"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="input mt-1.5"
                    />
                  </label>
                )}
              </>
            )}

            <div className="text-sm font-medium text-ink">
              关联孩子（可多选）
              {students && students.length > 0 ? (
                <div className="mt-2 grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto">
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        checked={form.student_ids.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        className="accent-primary"
                      />
                      {s.name}
                      {s.grade ? <span className="text-xs text-ink-muted">{s.grade}</span> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">本校区还没有学员，先去"学员"页添加</p>
              )}
            </div>

            {modal.mode === 'edit' && (
              <p className="rounded-xl bg-page px-3 py-2 text-xs text-ink-tertiary">
                注意：保存后关联关系将按上面的勾选整表替换（不勾=解除全部关联）。
              </p>
            )}

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
