// 总管理员后台布局：导航 Tab（看板 / 校区管理 / 用户管理）
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ChangePasswordButton } from '../../components/ChangePasswordModal';

const TABS = [
  { to: '/admin', label: '看板', end: true },
  { to: '/admin/campuses', label: '校区管理' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/schedule/teachers', label: '排课中心 ›' },
  { to: '/manage/teachers', label: '基础数据 ›' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-primary-bg">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              群
            </div>
            <p className="font-bold text-ink">群芳教育 · 管理后台</p>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-ink/70 sm:inline">{user.name}</span>
              <ChangePasswordButton />
              <button
                onClick={() => void logout()}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-ink/70 hover:bg-black/5"
              >
                退出
              </button>
            </div>
          )}
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
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
        <Outlet />
      </main>
    </div>
  );
}
