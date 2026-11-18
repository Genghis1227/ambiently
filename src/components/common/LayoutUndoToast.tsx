import React, { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';

const isApplePlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
};

export const LayoutUndoToast: React.FC = () => {
  const layoutUndoToast = useDashboardStore((s) => s.layoutUndoToast);
  const dismissLayoutUndoToast = useDashboardStore((s) => s.dismissLayoutUndoToast);
  const undoLayoutChange = useDashboardStore((s) => s.undoLayoutChange);

  useEffect(() => {
    if (!layoutUndoToast) return;
    const timer = window.setTimeout(() => {
      dismissLayoutUndoToast();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [layoutUndoToast, dismissLayoutUndoToast]);

  if (!layoutUndoToast) return null;

  const shortcutHint = isApplePlatform() ? '⌘Z' : 'Ctrl+Z';

  return (
    <div
      data-no-drag="true"
      data-no-canvas-swipe="true"
      className="ambiently-toast-enter-down fixed top-4 inset-x-0 mx-auto w-fit max-w-[92vw] z-[9998] pointer-events-auto"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-amber-500/40 shadow-2xl shadow-amber-950/40 text-white select-none ring-1 ring-amber-400/20">
        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
          <RotateCcw className="w-4 h-4" />
        </div>

        <div className="text-xs text-gray-100 truncate max-w-[230px] sm:max-w-sm">
          {layoutUndoToast.label}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          <button
            type="button"
            onClick={() => {
              void undoLayoutChange(layoutUndoToast.tabId);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-bold text-xs shadow-md shadow-amber-900/30 transition-all cursor-pointer"
          >
            <span>Undo</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-black/15 text-gray-900">
              {shortcutHint}
            </kbd>
          </button>

          <button
            type="button"
            onClick={dismissLayoutUndoToast}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
