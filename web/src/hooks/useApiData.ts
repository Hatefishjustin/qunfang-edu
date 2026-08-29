// 轻量数据获取 Hook：加载 / 出错 / 手动刷新
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

export function useApiData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : '网络异常，请稍后重试');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, reload };
}
