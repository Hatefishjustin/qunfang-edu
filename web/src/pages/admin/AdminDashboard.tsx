// 总管理员 · 全局看板：各校区数据概览卡片
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import type { Campus } from '../../types';

export default function AdminDashboard() {
  const { data, loading, error } = useApiData<Campus[]>('/api/campuses');

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">全局看板</h1>
      <p className="mb-6 text-sm text-ink-tertiary">各校区经营概览，点击卡片查看该校区账号</p>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((campus) => (
          <Link
            key={campus.id}
            to={`/admin/users?campus_id=${campus.id}`}
            className="card-interactive p-5"
          >
            <h2 className="font-semibold text-ink">{campus.name}</h2>
            <p className="mt-1 text-xs text-ink-muted">{campus.address ?? '地址未填写'}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-page py-2">
                <p className="text-lg font-bold text-primary">{campus.teacher_count}</p>
                <p className="text-xs text-ink-tertiary">教师</p>
              </div>
              <div className="rounded-xl bg-page py-2">
                <p className="text-lg font-bold text-primary">{campus.student_count}</p>
                <p className="text-xs text-ink-tertiary">学员</p>
              </div>
              <div className="rounded-xl bg-page py-2">
                <p className="text-lg font-bold text-primary">{campus.class_count}</p>
                <p className="text-xs text-ink-tertiary">进行中班级</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
