import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudOff, RotateCw, X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useSyncRefusal } from '../../hooks/useSyncRefusal';
import { pushToCloud } from '../../services/supabase';
import type { SyncRefusal } from '../../services/syncRefusal';

interface SyncRefusedBannerProps {
  /** False on the phone view, which has no dock */
  withDock?: boolean;
}

/** Says so when the cloud refuses some of this board's changes because the board is full. */
export const SyncRefusedBanner: React.FC<SyncRefusedBannerProps> = ({ withDock = true }) => {
  const refusal = useSyncRefusal();
  const isNightMode = useDashboardStore((s) => s.settings.nightModeEnabled);
  const dockAtBottom = useDashboardStore((s) => withDock && s.settings.dockPosition === 'bottom');
  // Hidden until the board syncs again; a later refusal shows it again
  const [hiddenRefusal, setHiddenRefusal] = useState<SyncRefusal | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    const { settings, tabs, widgets, notes } = useDashboardStore.getState();
    await pushToCloud(settings, tabs, widgets, notes);
    setIsRetrying(false);
  };

  const show = refusal !== null && refusal !== hiddenRefusal && !isNightMode;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className={`fixed ${dockAtBottom ? 'bottom-24' : 'bottom-4'} inset-x-0 mx-auto w-fit max-w-[92vw] z-[9990] pointer-events-auto`}
          role="status"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-rose-500/40 shadow-2xl shadow-rose-950/40 text-white select-none ring-1 ring-rose-400/20">
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/30 shrink-0">
              <CloudOff className="w-4 h-4" />
            </div>

            <div className="flex flex-col gap-0.5 flex-1 min-w-[12rem] pr-1">
              <span className="text-xs font-bold text-gray-100">Some changes aren't syncing</span>
              <span className="text-[11px] text-gray-400">
                {refusal.message} They're saved on this device. Remove uploaded images or wallpapers you
                don't need, and they'll sync again.
              </span>
            </div>

            {/* On a narrow screen these wrap below the text */}
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-60 active:scale-95 text-gray-950 font-bold text-xs shadow-md shadow-rose-500/20 transition-all cursor-pointer"
                title="Send this device's changes again"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Try again</span>
              </button>

              <button
                type="button"
                onClick={() => setHiddenRefusal(refusal)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                title="Hide until the board syncs again"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
