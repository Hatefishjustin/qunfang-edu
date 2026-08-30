// 总管理员 · 全局看板：各校区数据概览卡片
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import type { Campus } from '../../types';

export default function AdminDashboard() {
  const { data, loading, error } = useApiData<Campus[]>('/api/campuses');

  const stats = {
    campuses: data?.length ?? 0,
    teachers: data?.reduce((sum, c) => sum + (c.teacher_count ?? 0), 0) ?? 0,
    students: data?.reduce((sum, c) => sum + (c.student_count ?? 0), 0) ?? 0,
    classes: data?.reduce((sum, c) => sum + (c.class_count ?? 0), 0) ?? 0,
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-glass-hero -mt-2 mb-8 px-6 py-9 sm:px-10 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <span className="admin-kicker text-[10px] font-semibold uppercase tracking-[0.16em]">今日 · 经营概览</span>
              <h1 className="admin-display-title mt-4 text-3xl font-semibold text-ink sm:text-4xl">全局看板</h1>
              <p className="mt-3 text-sm text-ink-secondary">各校区经营概览，点击卡片查看该校区账号</p>
            </div>
            <div className="glass-orb flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-primary-dark">
              管
            </div>
          </div>
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass-stat-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">校区总数</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.campuses}</p>
          </div>
          <div className="glass-stat-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">在职教师</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.teachers}</p>
          </div>
          <div className="glass-stat-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">在读学员</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.students}</p>
          </div>
          <div className="glass-stat-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">进行中班级</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.classes}</p>
          </div>
        </div>
      )}

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}
      {data && data.length === 0 && (
        <div className="empty-state">
          还没有校区，先去
          <Link to="/admin/campuses" className="mx-1 font-medium text-primary underline">
            校区管理
          </Link>
          创建一个吧
        </div>
      )}

      <h2 className="mb-5 text-xl font-semibold text-ink">校区概览</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((campus) => (
          <Link
            key={campus.id}
            to={`/admin/users?campus_id=${campus.id}`}
            className="card-interactive p-5"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">{campus.name}</h2>
                <p className="mt-1 text-xs text-ink-muted">{campus.address ?? '地址未填写'}</p>
              </div>
              <span className="badge-primary shrink-0">运营中</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="glass-inset rounded-2xl py-2.5">
                <p className="text-lg font-bold text-primary">{campus.teacher_count}</p>
                <p className="text-xs text-ink-tertiary">教师</p>
              </div>
              <div className="glass-inset rounded-2xl py-2.5">
                <p className="text-lg font-bold text-primary">{campus.student_count}</p>
                <p className="text-xs text-ink-tertiary">学员</p>
              </div>
              <div className="glass-inset rounded-2xl py-2.5">
                <p className="text-lg font-bold text-primary">{campus.class_count}</p>
                <p className="text-xs text-ink-tertiary">班级</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
