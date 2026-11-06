import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RotateCw, X } from 'lucide-react';
import { useUpdateChecker } from '../../services/updateChecker';

export const UpdateNotificationBanner: React.FC = () => {
  const { isUpdateAvailable, isDismissed, latestVersion, applyUpdate, dismissUpdate } =
    useUpdateChecker();

  const show = isUpdateAvailable && !isDismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="fixed top-4 inset-x-0 mx-auto w-fit max-w-[92vw] z-[9999] pointer-events-auto"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/50 text-white select-none ring-1 ring-cyan-400/20">
            {/* Pulsing Icon */}
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shrink-0">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>

            {/* Version Text */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0 pr-1">
              <span className="text-xs font-bold text-gray-100">
                New version available
              </span>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 w-fit">
                v{latestVersion}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <button
                type="button"
                onClick={applyUpdate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer"
                title="Refresh and load latest updates"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Refresh Now</span>
              </button>

              <button
                type="button"
                onClick={dismissUpdate}
                className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                title="Dismiss for now"
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
