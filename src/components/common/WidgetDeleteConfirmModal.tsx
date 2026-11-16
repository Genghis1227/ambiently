import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';

export interface WidgetDeleteConfirmModalProps {
  isOpen: boolean;
  widgetTitle: string;
  canvasName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const WidgetDeleteConfirmModal: React.FC<WidgetDeleteConfirmModalProps> = ({
  isOpen,
  widgetTitle,
  canvasName,
  onConfirm,
  onCancel,
}) => {
  const backdropHandlers = useMemo(() => createBackdropDismissHandlers(onCancel), [onCancel]);

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
      aria-labelledby="widget-delete-confirm-title"
      data-no-drag="true"
      {...backdropHandlers}
      className="fixed inset-0 z-[115] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[#11161f] border border-slate-700/70 shadow-2xl overflow-hidden text-slate-100 cursor-default"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 id="widget-delete-confirm-title" className="text-sm font-semibold text-slate-100">
              Remove Widget?
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel removing widget"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs leading-relaxed text-slate-300">
            Remove <span className="font-semibold text-white">"{widgetTitle}"</span> from{' '}
            <span className="font-semibold text-white">"{canvasName}"</span>? Its tile
            configuration will be deleted.
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Widget</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
