// 通用页面骨架：顶部导航（品牌 / 当前用户 / 退出）+ 内容区
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types';
import NotificationButton from './NotificationButton';
import { brandMark, brandName } from '../config/brand';

export default function Layout({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-design-shell flex min-h-screen flex-col">
      <header className="app-design-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl">
              {brandMark}
            </div>
            <div className="leading-tight">
              <p className="font-bold text-ink">{brandName}</p>
              <p className="text-xs text-ink-tertiary">
                {user ? ROLE_LABELS[user.role] : ''}
                {user?.campusId === null && user?.role === 'super_admin' ? ' · 全局' : ''}
              </p>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-secondary sm:inline">{user.name}</span>
              <NotificationButton />
              <button
                onClick={() => void logout()}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                退出
              </button>
            </div>
          )}
        </div>
        {nav && (
          <nav aria-label="页面主导航" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">{nav}</nav>
        )}
      </header>
      <main className="app-design-main mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
