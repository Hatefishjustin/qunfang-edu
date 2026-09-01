// 家长端 / 学生端共用布局：课表 + 课时卡两个 Tab
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ChangePasswordButton } from '../../components/ChangePasswordModal';
import NotificationButton from '../../components/NotificationButton';
import { brandMark, brandTitle } from '../../config/brand';

export default function FamilyLayout({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const base = user?.role === 'parent' ? '/parent' : '/student';

  return (
    <div className="mobile-liquid-shell flex min-h-screen flex-col">
      <header className="mobile-liquid-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl">
              {brandMark}
            </div>
            <p className="font-bold text-ink">{brandTitle(title)}</p>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-secondary sm:inline">{user.name}</span>
              <NotificationButton />
              <ChangePasswordButton />
              <button
                onClick={() => void logout()}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                退出
              </button>
            </div>
          )}
        </div>
        <nav aria-label={`${title}主导航`} className="family-liquid-nav mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          <NavLink to={base} end className={({ isActive }) => (isActive ? 'nav-tab-active' : 'nav-tab')}>
            课表
          </NavLink>
          <NavLink to={`${base}/cards`} className={({ isActive }) => (isActive ? 'nav-tab-active' : 'nav-tab')}>
            课时卡
          </NavLink>
          <NavLink to={`${base}/requests`} className={({ isActive }) => (isActive ? 'nav-tab-active' : 'nav-tab')}>
            申请
          </NavLink>
        </nav>
      </header>
      <main className="app-design-main mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
