import { Bell, CheckCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { NotificationItem, NotificationList } from '../types';

function notificationTime(value: string): string {
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export default function NotificationButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList>({ items: [], unread_count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<NotificationList>('/api/notifications?limit=30');
      setData(next);
      setError(null);
    } catch {
      setError('通知加载失败');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    await refresh();
    setLoading(false);
  }

  async function read(item: NotificationItem) {
    if (!item.read_at) {
      await api.patch(`/api/notifications/${item.id}/read`, {});
      setData((current) => ({
        unread_count: Math.max(0, current.unread_count - 1),
        items: current.items.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry,
        ),
      }));
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  async function readAll() {
    await api.post('/api/notifications/read-all', {});
    setData((current) => ({
      unread_count: 0,
      items: current.items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    }));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        className="notification-trigger relative flex h-9 w-9 items-center justify-center rounded-xl"
        aria-label={data.unread_count > 0 ? `通知，${data.unread_count} 条未读` : '通知'}
        title="通知"
      >
        <Bell size={17} strokeWidth={1.9} aria-hidden="true" />
        {data.unread_count > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {data.unread_count > 99 ? '99+' : data.unread_count}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default"
            onClick={() => setOpen(false)}
            aria-label="关闭通知"
          />
          <section
            className="notification-panel fixed right-3 top-16 z-[80] flex max-h-[calc(100dvh-5rem)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-panel-title"
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <div>
                <h2 id="notification-panel-title" className="font-semibold text-ink">通知</h2>
                <p className="text-xs text-ink-muted">{data.unread_count} 条未读</p>
              </div>
              <div className="flex items-center gap-1">
                {data.unread_count > 0 && (
                  <button
                    type="button"
                    onClick={() => void readAll()}
                    className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
                    aria-label="全部标记已读"
                    title="全部标记已读"
                  >
                    <CheckCheck size={17} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost flex h-9 w-9 items-center justify-center p-0"
                  aria-label="关闭"
                  title="关闭"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading && <p className="px-3 py-6 text-center text-sm text-ink-muted" aria-live="polite">加载中…</p>}
              {!loading && error && <p className="px-3 py-6 text-center text-sm text-error" role="alert">{error}</p>}
              {!loading && !error && data.items.length === 0 && (
                <p className="px-3 py-10 text-center text-sm text-ink-muted">暂时没有新通知</p>
              )}
              {!loading && !error && data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void read(item)}
                  className="notification-item flex w-full gap-3 rounded-xl px-3 py-3 text-left"
                  data-unread={item.read_at ? 'false' : 'true'}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{item.title}</span>
                      <span className="shrink-0 text-[10px] text-ink-muted">{notificationTime(item.created_at)}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-ink-tertiary">{item.content}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
