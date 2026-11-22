import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Clock, MapPin, ShieldAlert } from 'lucide-react';
import {
  getAlertBadgeColors,
  type WeatherAlert,
} from '../../services/weather';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';

function formatAlertTimestamp(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface WeatherAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: WeatherAlert[];
  locationName?: string;
}

export const WeatherAlertModal: React.FC<WeatherAlertModalProps> = ({
  isOpen,
  onClose,
  alerts,
  locationName,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || alerts.length === 0) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Active weather alerts"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
      {...createBackdropDismissHandlers(onClose)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden cursor-default animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3 bg-gray-950/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">
                Active Weather {alerts.length === 1 ? 'Alert' : `Alerts (${alerts.length})`}
              </h2>
              {locationName && (
                <p className="text-xs text-gray-400 truncate">
                  NOAA / National Weather Service • {locationName}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close weather alerts"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">
          {alerts.map((alert) => {
            const colors = getAlertBadgeColors(alert.severity, false);
            const effectiveLabel = formatAlertTimestamp(alert.effective);
            const expiresLabel = formatAlertTimestamp(alert.expires);
            return (
              <div
                key={alert.id}
                className="rounded-xl border border-gray-800 bg-gray-950/70 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${colors.icon}`} />
                    <h3 className="text-sm font-bold text-white">{alert.event}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.pill}`}
                    >
                      {alert.severity}
                    </span>
                    {alert.urgency && alert.urgency !== 'Unknown' && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                        {alert.urgency}
                      </span>
                    )}
                  </div>
                </div>

                {alert.headline && alert.headline !== alert.event && (
                  <p className="text-xs font-semibold text-gray-200 leading-relaxed">
                    {alert.headline}
                  </p>
                )}

                {(effectiveLabel || expiresLabel || alert.areaDesc) && (
                  <div className="flex flex-col gap-1 text-[11px] text-gray-400 bg-gray-900/70 rounded-lg px-3 py-2 border border-gray-800/80">
                    {(effectiveLabel || expiresLabel) && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span>
                          {effectiveLabel ? `Effective ${effectiveLabel}` : 'Active'}
                          {expiresLabel ? ` — Expires ${expiresLabel}` : ''}
                        </span>
                      </div>
                    )}
                    {alert.areaDesc && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                        <span>{alert.areaDesc}</span>
                      </div>
                    )}
                  </div>
                )}

                {alert.instruction && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100 leading-relaxed whitespace-pre-line">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      Safety Instructions
                    </span>
                    {alert.instruction}
                  </div>
                )}

                {alert.description && (
                  <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                    {alert.description}
                  </p>
                )}

                {alert.senderName && (
                  <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-800/60">
                    Issued by {alert.senderName}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-950/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-500">
            Zero-key official NWS GeoJSON feed (US locations)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
