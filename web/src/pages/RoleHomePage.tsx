// 角色分流首页：总管理员进管理后台，排课老师进校区管理区，其他角色显示待开放提示
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types';
import Layout from '../components/Layout';

export default function RoleHomePage() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  if (user.role === 'campus_admin') {
    return <Navigate to="/schedule" replace />;
  }

  if (user.role === 'teacher') {
    return <Navigate to="/teacher" replace />;
  }

  if (user.role === 'parent') {
    return <Navigate to="/parent" replace />;
  }

  if (user.role === 'student') {
    return <Navigate to="/student" replace />;
  }

  return (
    <Layout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="brand-mark mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl">
          群
        </div>
        <h1 className="text-lg font-semibold text-ink">欢迎你，{user.name}</h1>
        <p className="mt-2 text-sm text-ink-tertiary">
          你的角色是「{ROLE_LABELS[user.role]}」，专属工作台将在后续里程碑开放
        </p>
        <Link to="/login" className="btn-secondary mt-6">
          返回登录页
        </Link>
      </div>
    </Layout>
  );
}
