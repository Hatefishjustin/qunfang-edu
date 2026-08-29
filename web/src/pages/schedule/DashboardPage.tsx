// 校区看板：今日/本周课次、进行中班级、本周点名完成率 + 今日课程列表
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { useSchedule } from './ScheduleLayout';
import { fmtCN } from '../../util/date';
import type { Dashboard } from '../../types';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function StatCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-tertiary">{label}</p>
      <p className="mt-2 text-3xl font-bold text-primary">
        {value}
        {suffix && <span className="ml-1 text-base font-medium text-ink-tertiary">{suffix}</span>}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { campusId } = useSchedule();
  const { data, loading, error } = useApiData<Dashboard>(
    `/api/stats/dashboard${campusId !== null ? `?campus_id=${campusId}` : ''}`,
  );

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-ink">校区看板</h1>
      <p className="mb-6 text-sm text-ink-tertiary">
        {data ? `${fmtCN(data.date)} ${WEEKDAYS[(new Date(`${data.date}T00:00:00`).getDay() + 6) % 7]} 的运营概览` : '今日运营概览'}
      </p>

      {loading && <p className="text-ink-tertiary">加载中…</p>}
      {error && <p className="text-error">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="今日课次" value={data.today_lessons} suffix="节" />
            <StatCard label="本周课次" value={data.week_lessons} suffix="节" />
            <StatCard label="进行中班级" value={data.active_classes} suffix="个" />
            <StatCard
              label="本周点名完成率"
              value={data.checkin_rate === null ? '—' : data.checkin_rate}
              suffix={data.checkin_rate === null ? undefined : '%'}
            />
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">今日课程（{data.today_list.length}）</h2>
          {data.today_list.length === 0 ? (
            <div className="empty-state">
              今天没有排课，休息日快乐
            </div>
          ) : (
            <div className="table-container">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-4 py-3 font-medium">时间</th>
                    <th className="px-4 py-3 font-medium">班级</th>
                    <th className="px-4 py-3 font-medium">教师</th>
                    <th className="px-4 py-3 font-medium">教室</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.today_list.map((l) => (
                    <tr key={l.id} className="table-row">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">
                        {l.start_time.slice(0, 5)}–{l.end_time.slice(0, 5)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {l.course_color && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: l.course_color }}
                            />
                          )}
                          {l.class_name ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{l.teacher_name ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-secondary">{l.room_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {l.status === 'done' ? (
                          <span className="badge-primary">
                            已点名
                          </span>
                        ) : (
                          <span className="badge-warning">
                            待上课
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/checkin/${l.id}`}
                          className="btn-secondary"
                        >
                          {l.status === 'done' ? '查看点名' : '去点名'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
