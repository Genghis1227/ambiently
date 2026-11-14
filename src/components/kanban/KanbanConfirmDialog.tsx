import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

export interface KanbanConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const KanbanConfirmDialog: React.FC<KanbanConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete Permanently',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[115] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[#11161f] border border-slate-700/70 shadow-2xl overflow-hidden text-slate-100"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-4 h-4 ${
                destructive ? 'text-[#b5838d]' : 'text-[#c99b66]'
              }`}
            />
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-slate-300">{message}</p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer ${
                destructive
                  ? 'bg-[#9c5a67] hover:bg-[#b5838d]'
                  : 'bg-[#6b8f71] hover:bg-[#5c7d62]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
