import React from 'react';
import { Trash2 } from 'lucide-react';
import type { DashboardWidget, StickyNoteItem } from '../../types/dashboard';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { StickyNotesWidget } from '../widgets/StickyNotesWidget';
import { CalendarWidget } from '../widgets/CalendarWidget';
import { RssWidget } from '../widgets/RssWidget';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';

interface BentoGridProps {
  widgets: DashboardWidget[];
  notes: StickyNoteItem[];
  dockPaddingClass: string;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
}

export const BentoGrid: React.FC<BentoGridProps> = ({
  widgets,
  notes,
  dockPaddingClass,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onRemoveWidget,
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
            className="group relative rounded-2xl bg-gray-900/60 backdrop-blur-md border border-gray-800/80 p-4 flex flex-col justify-between overflow-hidden shadow-lg transition-all hover:border-gray-700/80"
          >
            {/* Widget Remove Trigger on Hover */}
            {onRemoveWidget && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveWidget(widget.id);
                }}
                title="Remove widget from dashboard"
                className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 text-gray-400 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Real Interactive Widget Renderers */}
            {widget.type === 'weather' ? (
              <WeatherWidget
                locationName={widget.config?.locationName}
                latitude={widget.config?.latitude}
                longitude={widget.config?.longitude}
                unit={widget.config?.unit || 'F'}
              />
            ) : widget.type === 'clock' ? (
              <ClockWidget
                clockFace={widget.config?.clockFace || 'digital'}
                showSeconds={widget.config?.showSeconds ?? true}
              />
            ) : widget.type === 'clock_weather' ? (
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
              <RssWidget feedUrl={widget.config?.feedUrl} />
            ) : widget.type === 'photo_frame' ? (
              <PhotoFrameWidget
                initialStyle={widget.config?.displayStyle || 'ken_burns'}
                rotationIntervalSec={widget.config?.rotationIntervalSec || 15}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
