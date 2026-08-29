// 全局 Toast 提示：成功 / 失败统一从这里弹出
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type ToastItem = { id: number; message: string; type: 'success' | 'error' };

type ToastContextValue = {
  showToast: (message: string, type?: 'success' | 'error') => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, type }]);
    // 3 秒后自动消失
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
              t.type === 'success' ? 'bg-primary' : 'bg-red-600'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
