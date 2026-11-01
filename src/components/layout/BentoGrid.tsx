import React, { useRef, useState } from 'react';
import { Trash2, GripVertical, ArrowLeftRight } from 'lucide-react';
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
  onUpdateWidgetPosition?: (
    widgetId: string,
    gridPos: DashboardWidget['gridPos'],
    freeformPos?: DashboardWidget['freeformPos']
  ) => void;
}

function isOverlapping(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export const BentoGrid: React.FC<BentoGridProps> = ({
  widgets,
  notes,
  dockPaddingClass,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onRemoveWidget,
  onUpdateWidgetPosition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [targetPos, setTargetPos] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  );
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent, widget: DashboardWidget) => {
    if (!containerRef.current || !onUpdateWidgetPosition) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cellW = rect.width / 12;
    const cellH = rect.height / 8;

    const widgetLeft = widget.gridPos.x * cellW;
    const widgetTop = widget.gridPos.y * cellH;

    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    setDraggingId(widget.id);
    setTargetPos({ ...widget.gridPos });
    setDragOffset({
      x: containerX - widgetLeft,
      y: containerY - widgetTop,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cellW = rect.width / 12;
    const cellH = rect.height / 8;

    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    const activeWidget = widgets.find((w) => w.id === draggingId);
    if (!activeWidget) return;

    // Calculate candidate target grid column and row
    const candidateX = Math.round((containerX - dragOffset.x) / cellW);
    const candidateY = Math.round((containerY - dragOffset.y) / cellH);

    const clampedX = Math.max(0, Math.min(12 - activeWidget.gridPos.w, candidateX));
    const clampedY = Math.max(0, Math.min(8 - activeWidget.gridPos.h, candidateY));

    setTargetPos({
      x: clampedX,
      y: clampedY,
      w: activeWidget.gridPos.w,
      h: activeWidget.gridPos.h,
    });
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e && e.currentTarget && e.pointerId !== undefined) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (draggingId && targetPos && onUpdateWidgetPosition) {
      const activeWidget = widgets.find((w) => w.id === draggingId);
      if (activeWidget) {
        const origPos = { ...activeWidget.gridPos };

        // Check if candidate position is different from original
        if (origPos.x !== targetPos.x || origPos.y !== targetPos.y) {
          // Find overlapping widget to swap with
          const overlapping = widgets.find(
            (w) => w.id !== draggingId && isOverlapping(targetPos, w.gridPos)
          );

          if (overlapping) {
            // Swap positions between the two widgets
            onUpdateWidgetPosition(overlapping.id, {
              ...overlapping.gridPos,
              x: origPos.x,
              y: origPos.y,
            });
            onUpdateWidgetPosition(activeWidget.id, {
              ...activeWidget.gridPos,
              x: targetPos.x,
              y: targetPos.y,
            });
          } else {
            // Move into open grid space
            onUpdateWidgetPosition(activeWidget.id, {
              ...activeWidget.gridPos,
              x: targetPos.x,
              y: targetPos.y,
            });
          }
        }
      }
    }

    setDraggingId(null);
    setTargetPos(null);
  };

  // Quick adjacent swap helper (ideal for tablets / mobile)
  const handleQuickSwapNext = (widget: DashboardWidget) => {
    if (!onUpdateWidgetPosition) return;
    const otherWidgets = widgets.filter((w) => w.id !== widget.id);
    if (otherWidgets.length === 0) return;

    // Find next widget in reading order
    const nextWidget =
      otherWidgets.find((w) => w.gridPos.x > widget.gridPos.x || w.gridPos.y > widget.gridPos.y) ||
      otherWidgets[0];

    if (nextWidget) {
      const tempPos = { ...widget.gridPos };
      onUpdateWidgetPosition(widget.id, { ...widget.gridPos, x: nextWidget.gridPos.x, y: nextWidget.gridPos.y });
      onUpdateWidgetPosition(nextWidget.id, { ...nextWidget.gridPos, x: tempPos.x, y: tempPos.y });
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        touchAction: 'none',
        WebkitTouchCallout: 'none',
      }}
      className={`relative w-full h-screen overflow-hidden grid grid-cols-12 grid-rows-8 gap-4 p-4 touch-none select-none ${dockPaddingClass}`}
    >
      {/* Target Drop Zone Highlight Preview */}
      {draggingId && targetPos && (
        <div
          style={{
            gridColumnStart: targetPos.x + 1,
            gridColumnEnd: `span ${targetPos.w}`,
            gridRowStart: targetPos.y + 1,
            gridRowEnd: `span ${targetPos.h}`,
          }}
          className="rounded-2xl border-2 border-dashed border-blue-400 bg-blue-500/10 pointer-events-none z-10 transition-all duration-75 flex items-center justify-center text-blue-300 text-xs font-mono font-bold"
        >
          Drop to Place / Swap
        </div>
      )}

      {widgets.map((widget) => {
        const { x, y, w, h } = widget.gridPos;
        const isDragging = draggingId === widget.id;

        return (
          <div
            key={widget.id}
            style={{
              gridColumnStart: x + 1,
              gridColumnEnd: `span ${w}`,
              gridRowStart: y + 1,
              gridRowEnd: `span ${h}`,
              zIndex: isDragging ? 50 : 1,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              transition: isDragging ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
            }}
            className={`group relative rounded-2xl bg-gray-900/60 backdrop-blur-md border border-gray-800/80 p-4 flex flex-col justify-between overflow-hidden shadow-lg transition-all ${
              isDragging
                ? 'ring-2 ring-blue-500 shadow-2xl scale-[1.02] opacity-90'
                : 'hover:border-gray-700/80'
            }`}
          >
            {/* Top Tile Controls: Drag Handle & Quick Swap */}
            {onUpdateWidgetPosition && (
              <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                {/* Hold / Drag Grip */}
                <button
                  type="button"
                  onPointerDown={(e) => handlePointerDown(e, widget)}
                  title="Hold & drag to move or swap tile on the grid"
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-sm border border-white/10 cursor-grab active:cursor-grabbing touch-none transition-all"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </button>

                {/* Quick Swap Pill */}
                <button
                  type="button"
                  onClick={() => handleQuickSwapNext(widget)}
                  title="Quick-swap position with next tile"
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-blue-600/60 text-gray-400 hover:text-blue-300 backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Widget Remove Trigger on Hover */}
            {onRemoveWidget && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveWidget(widget.id);
                }}
                title="Remove widget from dashboard"
                className="absolute top-2.5 right-2.5 z-20 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 text-gray-400 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
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
