import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/login/LoginPage';
import RoleHomePage from './pages/RoleHomePage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import CampusesPage from './pages/admin/CampusesPage';
import UsersPage from './pages/admin/UsersPage';
import ManageLayout from './pages/manage/ManageLayout';
import TeachersPage from './pages/manage/TeachersPage';
import ClassesPage from './pages/manage/ClassesPage';
import StudentsPage from './pages/manage/StudentsPage';
import ParentsPage from './pages/manage/ParentsPage';
import CoursesPage from './pages/manage/CoursesPage';
import RoomsPage from './pages/manage/RoomsPage';
import CardsPage from './pages/manage/CardsPage';
import ScheduleLayout from './pages/schedule/ScheduleLayout';
import TeachersOverviewPage from './pages/schedule/TeachersOverviewPage';
import CalendarPage from './pages/schedule/CalendarPage';
import DashboardPage from './pages/schedule/DashboardPage';
import TeacherLayout from './pages/teacher/TeacherLayout';
import MySchedulePage from './pages/teacher/MySchedulePage';
import AvailabilityPage from './pages/teacher/AvailabilityPage';
import CheckinPage from './pages/checkin/CheckinPage';
import FamilyLayout from './pages/family/FamilyLayout';
import FamilySchedulePage from './pages/family/FamilySchedulePage';
import FamilyCardsPage from './pages/family/FamilyCardsPage';

/** 未登录跳转登录页；会话恢复期间显示加载 */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="app-design-shell flex min-h-screen items-center justify-center text-ink-tertiary">
        <div className="flex items-center gap-2">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          加载中…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** 角色限制：非指定角色显示无权限提示 */
function RequireRole({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <div className="app-design-shell flex min-h-screen items-center justify-center px-4 text-center">
        <div className="card-elevated max-w-sm p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-soft text-2xl text-warning">
            ✕
          </div>
          <p className="text-lg font-semibold text-ink">没有访问权限</p>
          <p className="mt-2 text-sm text-ink-tertiary">当前账号角色无权查看此页面</p>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RoleHomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRole roles={['super_admin']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="campuses" element={<CampusesPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route
        path="/manage"
        element={
          <RequireRole roles={['super_admin', 'campus_admin']}>
            <ManageLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="/manage/teachers" replace />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="parents" element={<ParentsPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="cards" element={<CardsPage />} />
      </Route>
      <Route
        path="/schedule"
        element={
          <RequireRole roles={['super_admin', 'campus_admin']}>
            <ScheduleLayout />
          </RequireRole>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="teachers" element={<TeachersOverviewPage />} />
        <Route path="calendar" element={<CalendarPage />} />
      </Route>
      <Route
        path="/teacher"
        element={
          <RequireRole roles={['teacher']}>
            <TeacherLayout />
          </RequireRole>
        }
      >
        <Route index element={<MySchedulePage />} />
        <Route path="availability" element={<AvailabilityPage />} />
      </Route>
      <Route
        path="/checkin/:lessonId"
        element={
          <RequireRole roles={['super_admin', 'campus_admin', 'teacher']}>
            <CheckinPage />
          </RequireRole>
        }
      />
      <Route
        path="/parent"
        element={
          <RequireRole roles={['parent']}>
            <FamilyLayout title="家长端" />
          </RequireRole>
        }
      >
        <Route index element={<FamilySchedulePage />} />
        <Route path="cards" element={<FamilyCardsPage />} />
      </Route>
      <Route
        path="/student"
        element={
          <RequireRole roles={['student']}>
            <FamilyLayout title="学生端" />
          </RequireRole>
        }
      >
        <Route index element={<FamilySchedulePage />} />
        <Route path="cards" element={<FamilyCardsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
