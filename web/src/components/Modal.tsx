// 简单弹窗组件：遮罩 + 居中卡片
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-hidden p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭弹窗"
      />
      <div
        className="modal-glass relative z-10 grid max-h-[calc(100dvh-1.5rem)] w-full max-w-md grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl sm:max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
          <h2 id="app-modal-title" className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost min-h-9 px-2.5 py-1.5 text-ink-tertiary hover:text-ink"
            aria-label="关闭"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
