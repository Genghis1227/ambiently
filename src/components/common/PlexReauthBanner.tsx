import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tv, X, ArrowRight } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { getPlexToken } from '../../services/plex';

interface PlexReauthBannerProps {
  onOpenPlexAuth: () => void;
}

export const PlexReauthBanner: React.FC<PlexReauthBannerProps> = ({ onOpenPlexAuth }) => {
  const settings = useDashboardStore((s) => s.settings);
  const widgets = useDashboardStore((s) => s.widgets);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('ambiently_plex_reauth_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  // Check if Plex is configured anywhere on this dashboard
  const isPlexConfigured = React.useMemo(() => {
    if (settings.commonPhotoSourceType === 'plex') return true;
    if (settings.commonPhotoSourceLabel?.toLowerCase().includes('plex')) return true;
    if (settings.commonPhotos?.some((p) => p.source === 'plex')) return true;
    return widgets.some(
      (w) =>
        w.type === 'photo_frame' &&
        (w.config?.sourceType === 'plex' ||
          w.config?.sourceLabel?.toLowerCase().includes('plex') ||
          w.config?.customPhotos?.some((p: any) => p.source === 'plex'))
    );
  }, [settings, widgets]);

  useEffect(() => {
    if (!isPlexConfigured) {
      setHasToken(true);
      return;
    }
    let isMounted = true;
    getPlexToken().then((token) => {
      if (isMounted) {
        setHasToken(Boolean(token));
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isPlexConfigured]);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('ambiently_plex_reauth_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  const show = isPlexConfigured && hasToken === false && !isDismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="fixed top-4 inset-x-0 mx-auto w-fit max-w-[92vw] z-[9990] pointer-events-auto"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-amber-500/40 shadow-2xl shadow-amber-950/40 text-white select-none ring-1 ring-amber-400/20">
            {/* TV Icon */}
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
              <Tv className="w-4 h-4 animate-pulse" />
            </div>

            {/* Information Text */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0 pr-1">
              <span className="text-xs font-bold text-gray-100">
                Plex Photos Configured
              </span>
              <span className="text-[11px] text-gray-400">
                Link this display to stream your library
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0 ml-1">
              <button
                type="button"
                onClick={onOpenPlexAuth}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                title="Pair this screen via 4-character PIN or QR code"
              >
                <span>Link Display</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
                title="Dismiss for this session"
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
