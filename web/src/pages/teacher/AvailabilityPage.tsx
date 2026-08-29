// 教师端 · 可用时间申报：保存即生效（整表替换）
import { useAuth } from '../../context/AuthContext';
import AvailabilityEditor from '../../components/AvailabilityEditor';

export default function AvailabilityPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">我的可用时间</h1>
      <p className="mb-4 text-sm text-ink/50">
        申报你每周什么时间可以上课 / 不能上课，排课老师排课时会参照这份时间表。
      </p>
      <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
        {user && <AvailabilityEditor teacherId={user.id} />}
      </div>
    </div>
  );
}
