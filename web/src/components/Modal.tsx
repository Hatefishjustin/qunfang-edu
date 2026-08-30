// 简单弹窗组件：遮罩 + 居中卡片
import type { ReactNode } from 'react';

export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="modal-glass max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="app-modal-title" className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="btn-ghost min-h-9 px-2.5 py-1.5 text-ink-tertiary hover:text-ink"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
