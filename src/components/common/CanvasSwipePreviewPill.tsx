import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CanvasSwipePreviewState } from '../../utils/canvasSwipe';

interface CanvasSwipePreviewPillProps {
  preview: CanvasSwipePreviewState | null;
}

export const CanvasSwipePreviewPill: React.FC<CanvasSwipePreviewPillProps> = ({ preview }) => {
  if (!preview || typeof document === 'undefined') return null;

  const isNext = preview.direction === 'next';
  const offsetPx = Math.round((1 - preview.progress) * 16);
  const translateX = isNext ? offsetPx : -offsetPx;

  return createPortal(
    <div
      aria-live="polite"
      style={{
        transform: `translate3d(${translateX}px, -50%, 0)`,
      }}
      className={`pointer-events-none select-none fixed top-1/2 z-[65] ${
        isNext ? 'right-3 sm:right-5' : 'left-3 sm:left-5'
      }`}
    >
      <div
        className={`relative overflow-hidden min-w-[148px] max-w-[220px] rounded-2xl border backdrop-blur-xl shadow-2xl px-3.5 py-2.5 transition-colors duration-150 ${
          preview.armed
            ? 'border-emerald-400/60 bg-gray-950/95 text-white'
            : 'border-gray-700/80 bg-gray-950/88 text-gray-100'
        }`}
      >
        <div
          className={`flex items-center gap-2.5 ${
            isNext ? 'flex-row-reverse text-right' : 'flex-row text-left'
          }`}
        >
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
              preview.armed
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                : 'bg-blue-500/15 border-blue-400/35 text-blue-300'
            }`}
          >
            {isNext ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                preview.armed ? 'text-emerald-300' : 'text-gray-400'
              }`}
            >
              {preview.armed
                ? 'Release to switch'
                : isNext
                  ? 'Next canvas'
                  : 'Previous canvas'}
            </div>
            <div className="text-xs font-bold text-white truncate">
              {preview.targetTabName}
            </div>
          </div>
        </div>

        <div className="mt-2 h-1 w-full rounded-full bg-gray-800/90 overflow-hidden">
          <div
            style={{ width: `${Math.round(preview.progress * 100)}%` }}
            className={`h-full rounded-full transition-colors duration-150 ${
              preview.armed ? 'bg-emerald-400' : 'bg-blue-400'
            }`}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
