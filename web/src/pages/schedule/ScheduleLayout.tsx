// 排课区布局（super_admin / campus_admin 共用）：
// super_admin 顶部校区切换；周选择器全局共享；子页面通过 useSchedule() 读取
import { useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import WeekPicker from '../../components/WeekPicker';
import { ChangePasswordButton } from '../../components/ChangePasswordModal';
import NotificationButton from '../../components/NotificationButton';
import { mondayOf, todayStr } from '../../util/date';
import type { Campus } from '../../types';
import { brandMark, brandTitle } from '../../config/brand';

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/schedule', label: '校区看板', end: true },
  { to: '/schedule/teachers', label: '忙闲总览' },
  { to: '/schedule/calendar', label: '排课周历' },
  { to: '/schedule/requests', label: '申请审批' },
];

export type ScheduleContext = {
  /** 当前校区筛选：super_admin 选中的（null=全部）；campus_admin 固定本校区 */
  campusId: number | null;
  isSuperAdmin: boolean;
  /** 当前查看的周（周一日期） */
  weekStart: string;
  setWeekStart: (d: string) => void;
};

export function useSchedule(): ScheduleContext {
  return useOutletContext<ScheduleContext>();
}

export default function ScheduleLayout() {
  const { user, logout } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { data: campuses } = useApiData<Campus[]>(isSuperAdmin ? '/api/campuses' : null);

  const [campusId, setCampusId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(mondayOf(todayStr()));
  // super_admin 未手动切换时，默认选中第一个校区
  const effectiveCampusId = isSuperAdmin
    ? (campusId ?? campuses?.[0]?.id ?? null)
    : (user?.campusId ?? null);

  return (
    <div className="app-design-shell flex min-h-screen flex-col">
      <header className="app-design-header">
        <div className="app-design-header-row app-design-header-row-dense mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="app-design-brand flex items-center gap-2.5">
            <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl">
              {brandMark}
            </div>
            <p className="font-bold text-ink">{brandTitle('排课中心')}</p>
          </div>
          <div className="app-design-actions flex items-center gap-2">
            {isSuperAdmin && (
              <select
                value={effectiveCampusId ?? ''}
                onChange={(e) => setCampusId(e.target.value ? Number(e.target.value) : null)}
                className="select w-auto py-1.5 text-xs"
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
                <span className="hidden text-sm text-ink-secondary sm:inline">{user.name}</span>
                <NotificationButton />
                <ChangePasswordButton />
                <button
                  onClick={() => void logout()}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  退出
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-2">
          <nav aria-label="排课中心主导航" className="flex gap-1 overflow-x-auto">
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
            <NavLink to="/manage/teachers" className="nav-tab">
              基础数据 ›
            </NavLink>
          </nav>
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
        </div>
      </header>
      <main className="app-design-main mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet
          context={{ campusId: effectiveCampusId, isSuperAdmin, weekStart, setWeekStart } satisfies ScheduleContext}
        />
      </main>
    </div>
  );
}
