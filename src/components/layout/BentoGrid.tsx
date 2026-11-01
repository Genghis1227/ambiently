import React from 'react';
import type { DashboardWidget } from '../../types/dashboard';

interface BentoGridProps {
  widgets: DashboardWidget[];
  dockPaddingClass: string;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ widgets, dockPaddingClass }) => {
  return (
    <div
      className={`w-full h-screen overflow-hidden grid grid-cols-12 grid-rows-8 gap-4 p-4 ${dockPaddingClass}`}
    >
      {widgets.map((widget) => {
        const { x, y, w, h } = widget.gridPos;

        return (
          <div
            key={widget.id}
            style={{
              gridColumnStart: x + 1,
              gridColumnEnd: `span ${w}`,
              gridRowStart: y + 1,
              gridRowEnd: `span ${h}`,
            }}
            className="rounded-2xl bg-gray-900/60 backdrop-blur-md border border-gray-800/80 p-5 flex flex-col justify-between overflow-hidden shadow-lg transition-all hover:border-gray-700/80"
          >
            {/* Widget Header */}
            <div className="flex items-center justify-between border-b border-gray-800/60 pb-3 mb-3">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">
                {widget.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 font-mono">
                {widget.type}
              </span>
            </div>

            {/* Widget Placeholder Content for Phase 1 */}
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl bg-gray-950/40 border border-gray-800/40">
              <span className="text-2xl mb-1">
                {widget.type === 'clock_weather'
                  ? '⛅ 12:45 PM'
                  : widget.type === 'sticky_notes'
                  ? '📝 Reminders'
                  : widget.type === 'photo_frame'
                  ? '🖼️ Photo Frame'
                  : '⏳ Countdown'}
              </span>
              <p className="text-xs text-gray-500 max-w-[200px]">
                {widget.type === 'clock_weather'
                  ? 'Austin, TX • 72°F Partly Cloudy'
                  : widget.type === 'sticky_notes'
                  ? 'Checklists & quick notes'
                  : widget.type === 'photo_frame'
                  ? 'Ambient photo feed'
                  : 'December 25, 2026'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
