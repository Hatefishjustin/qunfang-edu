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
    <div>
      <div className="hero-gradient -mx-4 -mt-6 mb-6 px-4 py-8 sm:-mx-4 sm:px-4 lg:-mx-4 lg:px-4">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-serif text-3xl font-normal tracking-tight text-ink">全局看板</h1>
              <p className="mt-2 text-sm text-ink-tertiary">各校区经营概览，点击卡片查看该校区账号</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-dark shadow-sm">
              管
            </div>
          </div>
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">校区总数</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.campuses}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">在职教师</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.teachers}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-tertiary">在读学员</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{stats.students}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
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

      <h2 className="mb-4 font-serif text-lg font-normal text-ink">校区概览</h2>
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
              <div className="rounded-2xl bg-border-light py-2.5">
                <p className="text-lg font-bold text-primary">{campus.teacher_count}</p>
                <p className="text-xs text-ink-tertiary">教师</p>
              </div>
              <div className="rounded-2xl bg-border-light py-2.5">
                <p className="text-lg font-bold text-primary">{campus.student_count}</p>
                <p className="text-xs text-ink-tertiary">学员</p>
              </div>
              <div className="rounded-2xl bg-border-light py-2.5">
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
