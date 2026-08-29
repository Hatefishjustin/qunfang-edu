// 管理区布局（super_admin / campus_admin 共用）：
// super_admin 顶部多一个校区切换器，所有子页面通过 useManage() 读取
import { useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { ChangePasswordButton } from '../../components/ChangePasswordModal';
import type { Campus } from '../../types';

const TABS = [
  { to: '/manage/teachers', label: '教师' },
  { to: '/manage/classes', label: '班级' },
  { to: '/manage/students', label: '学员' },
  { to: '/manage/parents', label: '家长' },
  { to: '/manage/courses', label: '课程' },
  { to: '/manage/rooms', label: '教室' },
  { to: '/manage/cards', label: '课时卡' },
  { to: '/schedule/teachers', label: '排课中心 ›' },
];

export type ManageContext = {
  /** 当前校区筛选：super_admin 选中的（null=全部）；campus_admin 固定本校区 */
  campusId: number | null;
  isSuperAdmin: boolean;
};

export function useManage(): ManageContext {
  return useOutletContext<ManageContext>();
}

export default function ManageLayout() {
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { data: campuses } = useApiData<Campus[]>(isSuperAdmin ? '/api/campuses' : null);

  const [campusId, setCampusId] = useState<number | null>(null);
  // super_admin 未手动切换时，默认选中第一个校区
  const effectiveCampusId = isSuperAdmin
    ? (campusId ?? campuses?.[0]?.id ?? null)
    : (user?.campusId ?? null);

  return (
    <div className="flex min-h-screen flex-col bg-primary-bg">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              群
            </div>
            <p className="font-bold text-ink">群芳教育 · 校区管理</p>
          </div>
          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <select
                value={effectiveCampusId ?? ''}
                onChange={(e) => setCampusId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">全部校区</option>
                {campuses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {user && (
              <>
                <span className="hidden text-sm text-ink/70 sm:inline">{user.name}</span>
                <ChangePasswordButton />
                <button
                  onClick={() => void logout()}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5"
                >
                  退出
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary text-white' : 'text-ink/60 hover:bg-black/5'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet context={{ campusId: effectiveCampusId, isSuperAdmin } satisfies ManageContext} />
      </main>
    </div>
  );
}
