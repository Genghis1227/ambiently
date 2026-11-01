import React from 'react';
import type { DashboardWidget, StickyNoteItem } from '../../types/dashboard';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { StickyNotesWidget } from '../widgets/StickyNotesWidget';
import { CalendarWidget } from '../widgets/CalendarWidget';
import { RssWidget } from '../widgets/RssWidget';

interface BentoGridProps {
  widgets: DashboardWidget[];
  notes: StickyNoteItem[];
  dockPaddingClass: string;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
}

export const BentoGrid: React.FC<BentoGridProps> = ({
  widgets,
  notes,
  dockPaddingClass,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}) => {
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
            className="rounded-2xl bg-gray-900/60 backdrop-blur-md border border-gray-800/80 p-4 flex flex-col justify-between overflow-hidden shadow-lg transition-all hover:border-gray-700/80"
          >
            {/* Real Interactive Widget Renderers */}
            {widget.type === 'clock_weather' ? (
              <ClockWeatherWidget
                locationName={widget.config?.locationName}
                latitude={widget.config?.latitude}
                longitude={widget.config?.longitude}
                unit={widget.config?.unit || 'F'}
                clockFace={widget.config?.face || 'digital'}
              />
            ) : widget.type === 'countdown' ? (
              <CountdownWidget
                eventName={widget.config?.eventName}
                targetDate={widget.config?.targetDate}
              />
            ) : widget.type === 'quotes' ? (
              <QuotesWidget />
            ) : widget.type === 'sticky_notes' ? (
              <StickyNotesWidget
                notes={notes}
                onAddNote={onAddNote}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
              />
            ) : widget.type === 'calendar' ? (
              <CalendarWidget
                sources={widget.config?.sources}
                defaultView={widget.config?.defaultView}
              />
            ) : widget.type === 'rss' ? (
              <RssWidget
                feedUrl={widget.config?.feedUrl}
                displayMode={widget.config?.displayMode}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl bg-gray-950/40 border border-gray-800/40">
                <span className="text-2xl mb-1">🖼️</span>
                <span className="text-xs font-semibold text-gray-300">{widget.title}</span>
                <p className="text-[11px] text-gray-500 mt-1">Photo frame scheduled for Phase 4</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
