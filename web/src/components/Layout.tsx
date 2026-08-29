// 通用页面骨架：顶部导航（品牌 / 当前用户 / 退出）+ 内容区
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types';

export default function Layout({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              群
            </div>
            <div className="leading-tight">
              <p className="font-bold text-ink">群芳教育</p>
              <p className="text-xs text-ink-tertiary">
                {user ? ROLE_LABELS[user.role] : ''}
                {user?.campusId === null && user?.role === 'super_admin' ? ' · 全局' : ''}
              </p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-secondary sm:inline">{user.name}</span>
              <button
                onClick={() => void logout()}
                className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-ink-secondary transition-colors hover:border-primary/30 hover:bg-primary-bg hover:text-primary"
              >
                退出
              </button>
            </div>
          )}
        </div>
        {nav && (
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">{nav}</nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
