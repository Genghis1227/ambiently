import React, { useRef, useState } from 'react';
import type { StickyNoteItem, DashboardWidget } from '../../types/dashboard';
import { CheckSquare, Square, Pin, Plus, Trash2, Clock, X, Maximize2, Minimize2 } from 'lucide-react';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { CalendarWidget } from '../widgets/CalendarWidget';
import { RssWidget } from '../widgets/RssWidget';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';

interface CorkboardProps {
  notes: StickyNoteItem[];
  widgets?: DashboardWidget[];
  dockPaddingClass: string;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onUpdateWidgetPos?: (widgetId: string, gridPos: any, freeformPos: NonNullable<DashboardWidget['freeformPos']>) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onOpenAddWidget?: () => void;
}

const COLOR_PALETTE = [
  '#fef08a', // Amber/Yellow
  '#bbf7d0', // Emerald/Green
  '#bae6fd', // Sky/Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#fed7aa', // Orange
];

export const Corkboard: React.FC<CorkboardProps> = ({
  notes,
  widgets = [],
  dockPaddingClass,
  onUpdateNotePos,
  onUpdateWidgetPos,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onRemoveWidget,
  onOpenAddWidget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'note' | 'widget'>('note');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Quick Note Modal / Creator on Corkboard
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newItemText, setNewItemText] = useState('');

  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: { xRatio: number; yRatio: number }
  ) => {
    // Prevent drag when clicking buttons, inputs, links, or interactive elements
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    const currentX = (pos?.xRatio ?? 0.1) * rect.width;
    const currentY = (pos?.yRatio ?? 0.1) * rect.height;

    setDraggingId(id);
    setDraggingType(type);
    setDragOffset({
      x: containerX - currentX,
      y: containerY - currentY,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(rect.width - 150, containerX - dragOffset.x));
    const newY = Math.max(0, Math.min(rect.height - 150, containerY - dragOffset.y));

    if (draggingType === 'note') {
      const note = notes.find((n) => n.id === draggingId);
      if (!note || !note.freeformPos) return;

      onUpdateNotePos(draggingId, {
        ...note.freeformPos,
        xRatio: newX / rect.width,
        yRatio: newY / rect.height,
      });
    } else if (draggingType === 'widget' && onUpdateWidgetPos) {
      const widget = widgets.find((w) => w.id === draggingId);
      if (!widget || !widget.freeformPos) return;

      onUpdateWidgetPos(draggingId, widget.gridPos, {
        ...widget.freeformPos,
        xRatio: newX / rect.width,
        yRatio: newY / rect.height,
      });
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e && e.currentTarget && e.pointerId !== undefined) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
    setDraggingId(null);
  };

  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    setChecklistItems([
      ...checklistItems,
      { id: Date.now().toString(), text: newItemText.trim(), done: false },
    ]);
    setNewItemText('');
  };

  const handleCreateNote = () => {
    if (!newTitle.trim() && !newContent.trim() && checklistItems.length === 0) return;

    onAddNote({
      title: newTitle.trim() || undefined,
      content: newContent,
      isChecklist,
      checklistItems: isChecklist ? checklistItems : undefined,
      bgColor: selectedColor,
      freeformPos: {
        xRatio: 0.2 + Math.random() * 0.3,
        yRatio: 0.2 + Math.random() * 0.3,
        wRatio: 0.28,
        hRatio: 0.35,
        zIndex: 20,
        rotation: Math.floor(Math.random() * 6) - 3,
      },
    });

    setIsCreatorOpen(false);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setChecklistItems([]);
  };

  const toggleChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const activeNotes = notes.filter((n) => !n.archivedAt);

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
      className={`relative w-full h-screen overflow-hidden select-none touch-none bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px] ${dockPaddingClass}`}
    >
      {/* Floating Action Buttons on Corkboard */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        {onOpenAddWidget && (
          <button
            onClick={onOpenAddWidget}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-gray-900/90 hover:bg-gray-800 text-xs font-semibold text-gray-200 border border-gray-700 shadow-xl backdrop-blur-md transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Tile</span>
          </button>
        )}
        <button
          onClick={() => setIsCreatorOpen(true)}
          className="flex items-center gap-2 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-xl shadow-blue-500/25 transition-all cursor-pointer"
        >
          <Pin className="w-3.5 h-3.5" />
          <span>Pin New Note</span>
        </button>
      </div>

      {/* Render Freeform Widgets on Corkboard */}
      {widgets.map((widget) => {
        const pos = widget.freeformPos || {
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.35,
          hRatio: 0.45,
          zIndex: 5,
          rotation: 0,
        };

        const isFullScreen = Boolean(pos.isFullScreen);
        const isDragging = draggingId === widget.id;
        return (
          <div
            key={widget.id}
            onPointerDown={(e) => !isFullScreen && handlePointerDown(e, widget.id, 'widget', pos)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={
              isFullScreen
                ? {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: isDragging ? 50 : (pos.zIndex || 1),
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                  }
                : {
                    position: 'absolute',
                    left: `${pos.xRatio * 100}%`,
                    top: `${pos.yRatio * 100}%`,
                    width: `${Math.max(280, pos.wRatio * 1000)}px`,
                    minHeight: '220px',
                    transform: `rotate(${pos.rotation}deg) ${isDragging ? 'scale(1.02)' : 'scale(1)'}`,
                    zIndex: isDragging ? 50 : pos.zIndex,
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s, transform 0.15s ease-out',
                  }
            }
            className={`group ${
              isFullScreen
                ? 'rounded-none border-0 p-0 overflow-hidden'
                : 'rounded-2xl border border-gray-800/90 p-4'
            } bg-gray-900/80 backdrop-blur-md shadow-2xl text-white cursor-grab active:cursor-grabbing touch-none select-none transition-shadow ${
              isDragging ? 'ring-2 ring-blue-500 shadow-blue-500/20' : 'hover:shadow-blue-500/10'
            } flex flex-col justify-between`}
          >
            {/* Red Visual Pushpin (hidden when maximized) */}
            {!isFullScreen && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none z-10">
                <div className="w-5 h-5 rounded-full bg-red-600 shadow-md border-2 border-red-700/60" />
              </div>
            )}

            {/* Top Right Widget Controls: Maximize/Restore & Remove */}
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onUpdateWidgetPos && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isFullScreen) {
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        xRatio: 0.1,
                        yRatio: 0.1,
                        wRatio: 0.45,
                        hRatio: 0.5,
                        rotation: 0,
                        isFullScreen: false,
                      });
                    } else {
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        xRatio: 0,
                        yRatio: 0,
                        wRatio: 1,
                        hRatio: 1,
                        rotation: 0,
                        isFullScreen: true,
                      });
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={isFullScreen ? 'Restore card size' : 'Fill full screen / canvas'}
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                >
                  {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              )}

              {onRemoveWidget && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWidget(widget.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Remove widget"
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 text-gray-400 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Widget Inner Renderers */}
            <div className="w-full h-full flex flex-col justify-between">
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
          </div>
        );
      })}

      {/* Render All Freeform Notes */}
      {activeNotes.map((note) => {
        const pos = note.freeformPos || {
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.28,
          hRatio: 0.35,
          zIndex: 1,
          rotation: 0,
        };

        const isDragging = draggingId === note.id;
        return (
          <div
            key={note.id}
            onPointerDown={(e) => handlePointerDown(e, note.id, 'note', pos)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'absolute',
              left: `${pos.xRatio * 100}%`,
              top: `${pos.yRatio * 100}%`,
              width: `${Math.max(240, pos.wRatio * 1000)}px`,
              transform: `rotate(${pos.rotation}deg) ${isDragging ? 'scale(1.04)' : 'scale(1)'}`,
              backgroundColor: note.bgColor || '#fef08a',
              zIndex: isDragging ? 50 : pos.zIndex,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              transition: isDragging ? 'none' : 'box-shadow 0.2s, transform 0.15s ease-out',
            }}
            className={`group rounded-2xl p-5 shadow-2xl text-gray-900 cursor-grab active:cursor-grabbing border border-black/10 touch-none select-none transition-shadow ${
              isDragging ? 'ring-2 ring-blue-500/70 shadow-2xl' : 'hover:shadow-yellow-500/10'
            } flex flex-col justify-between`}
          >
            {/* Red Visual Pushpin */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-red-600 shadow-md border-2 border-red-700/60" />
            </div>

            <div>
              {/* Note Title */}
              {note.title && (
                <div className="font-bold text-sm mb-2 flex items-center justify-between border-b border-black/10 pb-1.5">
                  <span className="truncate">{note.title}</span>
                  <div className="flex items-center gap-1.5">
                    {note.expiresAt && (
                      <span className="text-[10px] text-gray-700 bg-black/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                      </span>
                    )}
                    <Pin className="w-3.5 h-3.5 text-gray-700/60" />
                  </div>
                </div>
              )}

              {/* Note Content / Checklist */}
              {note.isChecklist && note.checklistItems ? (
                <div className="space-y-2 mt-2">
                  {note.checklistItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklistItem(note, item.id)}
                      className="flex items-center gap-2 text-xs w-full text-left hover:opacity-80 transition-opacity"
                    >
                      {item.done ? (
                        <CheckSquare className="w-4 h-4 text-emerald-800 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-700 shrink-0" />
                      )}
                      <span className={item.done ? 'line-through opacity-50' : 'font-medium'}>
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
              )}
            </div>

            {/* Note Bottom Actions */}
            <div className="flex items-center justify-end pt-2 border-t border-black/10 mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-700 hover:bg-black/10 transition-all cursor-pointer"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Creator Modal for Family Board */}
      {isCreatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-sm font-bold text-white">Pin Note to Family Board</span>
              <button
                onClick={() => setIsCreatorOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Color Palette Picker */}
            <div className="flex items-center gap-2">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    selectedColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'opacity-70'
                  }`}
                />
              ))}
            </div>

            {/* Format Toggle: Message vs Checklist */}
            <div className="flex rounded-lg bg-gray-950 p-1 border border-gray-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setIsChecklist(false)}
                className={`flex-1 py-1.5 rounded-md text-center transition-all ${
                  !isChecklist ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Text Note
              </button>
              <button
                type="button"
                onClick={() => setIsChecklist(true)}
                className={`flex-1 py-1.5 rounded-md text-center transition-all ${
                  isChecklist ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Checklist
              </button>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Title (optional)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />

              {!isChecklist ? (
                <textarea
                  placeholder="Write your note message here..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add checklist item..."
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                      className="flex-1 rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddChecklistItem}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {checklistItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs text-gray-300 bg-gray-950/60 p-1.5 rounded-lg border border-gray-800"
                      >
                        <span className="truncate">{item.text}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setChecklistItems(checklistItems.filter((i) => i.id !== item.id))
                          }
                          className="text-gray-500 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateNote}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
            >
              Pin Note to Board
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
