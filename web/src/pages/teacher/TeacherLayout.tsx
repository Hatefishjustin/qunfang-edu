// 教师端布局：我的课表 / 可用时间（点名将在 M5 开放）
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ChangePasswordButton } from '../../components/ChangePasswordModal';

const TABS = [
  { to: '/teacher', label: '我的课表', end: true },
  { to: '/teacher/availability', label: '可用时间' },
];

export default function TeacherLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="mobile-liquid-shell flex min-h-screen flex-col">
      <header className="mobile-liquid-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl">
              群
            </div>
            <p className="font-bold text-ink">群芳教育 · 教师端</p>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-secondary sm:inline">{user.name}</span>
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
        <nav aria-label="教师端主导航" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => (isActive ? 'nav-tab-active' : 'nav-tab')}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-design-main mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
