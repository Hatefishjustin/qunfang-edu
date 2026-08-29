// 总管理员 · 用户管理：账号列表 / 创建 / 重置密码 / 禁用启用
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useApiData } from '../../hooks/useApiData';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { ROLE_LABELS } from '../../types';
import type { Campus, Role, UserItem, UserList } from '../../types';

const ALL_ROLES: { value: Role; label: string }[] = [
  { value: 'super_admin', label: '总管理员' },
  { value: 'campus_admin', label: '排课老师' },
  { value: 'teacher', label: '上课老师' },
  { value: 'parent', label: '家长' },
  { value: 'student', label: '学生' },
];

export default function UsersPage() {
  const [searchParams] = useSearchParams();
  const campusFilter = searchParams.get('campus_id') ?? '';

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (role) query.set('role', role);
  if (status) query.set('status', status);
  if (campusFilter) query.set('campus_id', campusFilter);
  query.set('page', String(page));

  const { data, loading, error, reload } = useApiData<UserList>(`/api/users?${query}`);
  const { data: campuses } = useApiData<Campus[]>('/api/campuses');
  const { showToast } = useToast();

  // 创建账号表单
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: 'teacher' as Role,
    campus_id: campusFilter || '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  // 重置密码 / 编辑
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/users', {
        name: form.name,
        phone: form.phone,
        role: form.role,
        campus_id: form.role === 'super_admin' ? null : Number(form.campus_id) || null,
        ...(form.password ? { password: form.password } : {}),
      });
      showToast('账号创建成功，初始密码已设置');
      setCreating(false);
      setForm({ name: '', phone: '', role: 'teacher', campus_id: campusFilter || '', password: '' });
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 6) {
      showToast('密码至少 6 位', 'error');
      return;
    }
    try {
      await api.patch(`/api/users/${resetTarget.id}`, { password: newPassword });
      showToast(`已重置 ${resetTarget.name} 的密码`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '重置失败', 'error');
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await api.patch(`/api/users/${editTarget.id}`, editForm);
      showToast('已保存');
      setEditTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '保存失败', 'error');
    }
  }

  async function toggleStatus(u: UserItem) {
    const action = u.status === 'active' ? '禁用' : '启用';
    if (!window.confirm(`确定${action}「${u.name}」的账号吗？`)) return;
    try {
      await api.patch(`/api/users/${u.id}`, {
        status: u.status === 'active' ? 'disabled' : 'active',
      });
      showToast(`已${action}该账号`);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `${action}失败`, 'error');
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">用户管理</h1>
          <p className="mt-1 text-sm text-ink/50">
            共 {data?.total ?? 0} 个账号
            {campusFilter
              ? ` · 筛选：${campuses?.find((c) => String(c.id) === campusFilter)?.name ?? '指定校区'}`
              : ''}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          + 创建账号
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">全部角色</option>
          {ALL_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="disabled">已禁用</option>
        </select>
      </div>

      {loading && <p className="text-ink/50">加载中…</p>}
      {error && <p className="text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-black/5 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">手机号</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">校区</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-b border-black/5 last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                <td className="px-4 py-3 text-ink/70">{u.phone}</td>
                <td className="px-4 py-3 text-ink/70">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3 text-ink/70">{u.campus_name ?? '全局'}</td>
                <td className="px-4 py-3">
                  {u.status === 'active' ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      正常
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      已禁用
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      setEditTarget(u);
                      setEditForm({ name: u.name, phone: u.phone });
                    }}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      setResetTarget(u);
                      setNewPassword('');
                    }}
                    className="mr-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs text-ink/70 hover:bg-black/5"
                  >
                    重置密码
                  </button>
                  <button
                    onClick={() => void toggleStatus(u)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      u.status === 'active'
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    {u.status === 'active' ? '禁用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink/40">
                  没有符合条件的账号
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {data && data.total > data.pageSize && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-ink/70 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-ink/60">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-ink/70 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* 创建账号弹窗 */}
      {creating && (
        <Modal title="创建账号" onClose={() => setCreating(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
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
                placeholder="11 位手机号"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              角色
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {form.role !== 'super_admin' && (
              <label className="block text-sm font-medium text-ink">
                所属校区
                <select
                  value={form.campus_id}
                  onChange={(e) => setForm({ ...form, campus_id: e.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="">请选择校区</option>
                  {campuses?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium text-ink">
              初始密码（选填，默认 Passw0rd!）
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Passw0rd!"
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 重置密码弹窗 */}
      {resetTarget && (
        <Modal title={`重置密码 · ${resetTarget.name}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              新密码（至少 6 位）
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                确认重置
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 编辑弹窗 */}
      {editTarget && (
        <Modal title={`编辑账号 · ${editTarget.name}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              姓名
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              手机号
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm text-ink/70 hover:bg-black/5"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                保存
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
