import React, { useEffect } from 'react';
import { ArrowRight, Layers, X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';

interface MovedWidgetToastProps {
  onSelectTab: (tabId: string) => void;
}

export const MovedWidgetToast: React.FC<MovedWidgetToastProps> = ({ onSelectTab }) => {
  const movedWidgetToast = useDashboardStore((s) => s.movedWidgetToast);
  const dismissMovedWidgetToast = useDashboardStore((s) => s.dismissMovedWidgetToast);

  useEffect(() => {
    if (!movedWidgetToast) return;
    const timer = window.setTimeout(() => {
      dismissMovedWidgetToast();
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [movedWidgetToast, dismissMovedWidgetToast]);

  if (!movedWidgetToast) return null;

  return (
    <div
      data-no-drag="true"
      className="ambiently-toast-enter-down fixed top-4 inset-x-0 mx-auto w-fit max-w-[92vw] z-[9998] pointer-events-auto"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-emerald-500/40 shadow-2xl shadow-emerald-950/50 text-white select-none ring-1 ring-emerald-400/20">
        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
          <Layers className="w-4 h-4" />
        </div>

        <div className="text-xs text-gray-100 truncate max-w-[260px] sm:max-w-sm">
          Moved <span className="font-bold text-white">"{movedWidgetToast.widgetTitle}"</span> to{' '}
          <span className="font-bold text-emerald-300">{movedWidgetToast.targetTabName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          <button
            type="button"
            onClick={() => {
              const targetId = movedWidgetToast.targetTabId;
              dismissMovedWidgetToast();
              onSelectTab(targetId);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-900/40 transition-all cursor-pointer"
          >
            <span>Go to {movedWidgetToast.targetTabName}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={dismissMovedWidgetToast}
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
