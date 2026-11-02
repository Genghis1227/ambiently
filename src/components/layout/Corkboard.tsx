import React, { useRef, useState } from 'react';
import type { StickyNoteItem, DashboardWidget } from '../../types/dashboard';
import {
  CheckSquare,
  Square,
  Pin,
  Plus,
  Trash2,
  Clock,
  X,
  Maximize2,
  Minimize2,
  Settings,
  Archive,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { CalendarWidget } from '../widgets/CalendarWidget';
import { RssWidget } from '../widgets/RssWidget';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';
import { StickyNotesWidget } from '../widgets/StickyNotesWidget';
import { WidgetSettingsModal } from '../widgets/WidgetSettingsModal';
import { PhotoSourcesModal } from '../photos/PhotoSourcesModal';

interface CorkboardProps {
  notes: StickyNoteItem[];
  widgets?: DashboardWidget[];
  dockPaddingClass: string;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onUpdateWidgetPos?: (widgetId: string, gridPos: any, freeformPos: NonNullable<DashboardWidget['freeformPos']>) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onOpenAddWidget?: () => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
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
  onPermanentlyDeleteNote,
  onRemoveWidget,
  onOpenAddWidget,
  onUpdateWidget,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'note' | 'widget'>('note');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [photoSourcesTargetWidget, setPhotoSourcesTargetWidget] = useState<DashboardWidget | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);

  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingType, setResizingType] = useState<'note' | 'widget'>('widget');
  const [resizeStart, setResizeStart] = useState<{ startX: number; startY: number; startW: number; startH: number }>({
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  // Quick Note Modal / Creator on Corkboard
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [expiryOption, setExpiryOption] = useState<'permanent' | '1day' | '3days' | 'custom'>('permanent');
  const [customExpiry, setCustomExpiry] = useState('');

  const getNextZIndex = () => {
    const widgetMax = widgets.reduce((m, w) => Math.max(m, w.freeformPos?.zIndex || 1), 1);
    const noteMax = notes.reduce((m, n) => Math.max(m, n.freeformPos?.zIndex || 1), 1);
    return Math.min(45, Math.max(widgetMax, noteMax) + 1);
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    setResizingId(id);
    setResizingType(type);
    setResizeStart({
      startX: e.clientX,
      startY: e.clientY,
      startW: pos?.wRatio ?? 0.35,
      startH: pos?.hRatio ?? 0.45,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    // Prevent drag when clicking buttons, inputs, links, or interactive elements
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    const currentX = (pos?.xRatio ?? 0.1) * rect.width;
    const currentY = (pos?.yRatio ?? 0.1) * rect.height;

    // Bring card to front on interaction
    const nextZ = getNextZIndex();
    if (type === 'note' && pos) {
      onUpdateNotePos(id, { ...pos, zIndex: nextZ });
    } else if (type === 'widget' && pos && onUpdateWidgetPos) {
      const w = widgets.find((item) => item.id === id);
      if (w) {
        onUpdateWidgetPos(id, w.gridPos, { ...pos, zIndex: nextZ });
      }
    }

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
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // 1. Resizing in progress
    if (resizingId) {
      const deltaX = e.clientX - resizeStart.startX;
      const deltaY = e.clientY - resizeStart.startY;
      const deltaWRatio = deltaX / rect.width;
      const deltaHRatio = deltaY / rect.height;

      if (resizingType === 'widget' && onUpdateWidgetPos) {
        const widget = widgets.find((w) => w.id === resizingId);
        if (!widget || !widget.freeformPos) return;

        const maxW = 1.0 - widget.freeformPos.xRatio;
        const maxH = 1.0 - widget.freeformPos.yRatio;

        const newW = Math.max(0.18, Math.min(maxW, resizeStart.startW + deltaWRatio));
        const newH = Math.max(0.18, Math.min(maxH, resizeStart.startH + deltaHRatio));

        onUpdateWidgetPos(widget.id, widget.gridPos, {
          ...widget.freeformPos,
          wRatio: newW,
          hRatio: newH,
        });
      } else if (resizingType === 'note') {
        const note = notes.find((n) => n.id === resizingId);
        if (!note || !note.freeformPos) return;

        const maxW = 1.0 - note.freeformPos.xRatio;
        const maxH = 1.0 - note.freeformPos.yRatio;

        const newW = Math.max(0.18, Math.min(maxW, resizeStart.startW + deltaWRatio));
        const newH = Math.max(0.18, Math.min(maxH, resizeStart.startH + deltaHRatio));

        onUpdateNotePos(note.id, {
          ...note.freeformPos,
          wRatio: newW,
          hRatio: newH,
        });
      }
      return;
    }

    // 2. Dragging in progress
    if (!draggingId) return;

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
    setResizingId(null);
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

    let expiresAt: string | null = null;
    if (expiryOption === '1day') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '3days') {
      expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    }

    onAddNote({
      title: newTitle.trim() || undefined,
      content: newContent,
      isChecklist,
      checklistItems: isChecklist ? checklistItems : undefined,
      bgColor: selectedColor,
      expiresAt,
      freeformPos: {
        xRatio: 0.2 + Math.random() * 0.3,
        yRatio: 0.2 + Math.random() * 0.3,
        wRatio: 0.28,
        hRatio: 0.35,
        zIndex: getNextZIndex(),
        rotation: Math.floor(Math.random() * 6) - 3,
      },
    });

    setIsCreatorOpen(false);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setChecklistItems([]);
    setExpiryOption('permanent');
    setCustomExpiry('');
  };

  const toggleChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const now = new Date();
  const activeNotes = notes.filter((n) => {
    if (n.archivedAt) return false;
    if (n.expiresAt && new Date(n.expiresAt) <= now) return false;
    return true;
  });

  const trashNotes = notes.filter((n) => {
    if (n.archivedAt) return true;
    if (n.expiresAt && new Date(n.expiresAt) <= now) return true;
    return false;
  });

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
        {trashNotes.length > 0 && (
          <button
            onClick={() => setIsTrashOpen(true)}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-gray-900/90 hover:bg-gray-800 text-xs font-semibold text-amber-300 border border-amber-500/30 shadow-xl backdrop-blur-md transition-all cursor-pointer"
            title="View expired or archived sticky notes"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Trash ({trashNotes.length})</span>
          </button>
        )}
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
                    zIndex: isDragging || resizingId === widget.id ? 50 : (pos.zIndex || 1),
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                  }
                : {
                    position: 'absolute',
                    left: `${pos.xRatio * 100}%`,
                    top: `${pos.yRatio * 100}%`,
                    width: `${pos.wRatio * 100}%`,
                    height: `${pos.hRatio * 100}%`,
                    minWidth: '260px',
                    minHeight: '200px',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    transform: `rotate(${pos.rotation}deg) ${isDragging ? 'scale(1.02)' : 'scale(1)'}`,
                    zIndex: isDragging || resizingId === widget.id ? 50 : pos.zIndex,
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                    transition: isDragging || resizingId === widget.id ? 'none' : 'box-shadow 0.2s, transform 0.15s ease-out',
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

            {/* Top Right Widget Controls: Tilt, Settings, Maximize/Restore & Remove */}
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isFullScreen && onUpdateWidgetPos && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        rotation: Math.max(-15, (pos.rotation || 0) - 2),
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Tilt counter-clockwise"
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        rotation: Math.min(15, (pos.rotation || 0) + 2),
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Tilt clockwise"
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </>
              )}
              {onUpdateWidget && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingWidget(widget);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Configure tile title and settings"
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-sm border border-white/10 transition-all cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
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

            {/* Bottom Right Resize Handle */}
            {!isFullScreen && (
              <div
                onPointerDown={(e) => handleResizePointerDown(e, widget.id, 'widget', pos)}
                title="Drag to resize tile"
                className="absolute bottom-1 right-1 p-1.5 cursor-nwse-resize z-20 opacity-40 group-hover:opacity-100 hover:opacity-100 touch-none text-gray-400 hover:text-white transition-opacity"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="6" cy="10" r="1.5" />
                  <circle cx="10" cy="6" r="1.5" />
                  <circle cx="2" cy="10" r="1.5" />
                  <circle cx="6" cy="6" r="1.5" />
                  <circle cx="10" cy="2" r="1.5" />
                </svg>
              </div>
            )}

            {/* Widget Inner Renderers */}
            <div className="w-full h-full flex flex-col justify-between overflow-hidden">
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
                  clockFace={widget.config?.clockFace || widget.config?.face || 'digital'}
                />
              ) : widget.type === 'countdown' ? (
                <CountdownWidget
                  eventName={widget.title || widget.config?.eventName}
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
                  customPhotos={widget.config?.customPhotos}
                  initialSourceLabel={widget.config?.sourceLabel}
                  onUpdateConfig={(updates) => {
                    if (onUpdateWidget) {
                      onUpdateWidget(widget.id, {
                        config: { ...widget.config, ...updates },
                      });
                    }
                  }}
                />
              ) : widget.type === 'sticky_notes' ? (
                <StickyNotesWidget
                  notes={notes}
                  onAddNote={onAddNote}
                  onUpdateNote={onUpdateNote}
                  onDeleteNote={onDeleteNote}
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
        const isExpiringSoon =
          note.expiresAt &&
          new Date(note.expiresAt).getTime() - now.getTime() < 12 * 60 * 60 * 1000;

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
              width: `${pos.wRatio * 100}%`,
              height: pos.hRatio ? `${pos.hRatio * 100}%` : 'auto',
              minWidth: '220px',
              minHeight: '160px',
              maxWidth: '100%',
              maxHeight: '100%',
              transform: `rotate(${pos.rotation}deg) ${isDragging ? 'scale(1.04)' : 'scale(1)'}`,
              backgroundColor: note.bgColor || '#fef08a',
              zIndex: isDragging || resizingId === note.id ? 50 : pos.zIndex,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              transition: isDragging || resizingId === note.id ? 'none' : 'box-shadow 0.2s, transform 0.15s ease-out',
            }}
            className={`group rounded-2xl p-5 shadow-2xl text-gray-900 cursor-grab active:cursor-grabbing border border-black/10 touch-none select-none transition-shadow ${
              isDragging
                ? 'ring-2 ring-blue-500/70 shadow-2xl'
                : isExpiringSoon
                ? 'ring-2 ring-amber-500 shadow-amber-500/20'
                : 'hover:shadow-yellow-500/10'
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
                      <span
                        title={`Expires: ${new Date(note.expiresAt).toLocaleString()}`}
                        className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          isExpiringSoon ? 'bg-amber-500/30 text-amber-950 font-bold' : 'bg-black/10 text-gray-700'
                        }`}
                      >
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

            {/* Note Bottom Actions: Tilt & Archive/Delete */}
            <div className="flex items-center justify-between pt-2 border-t border-black/10 mt-2 opacity-50 group-hover:opacity-100 transition-opacity pr-4">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateNotePos(note.id, {
                      ...pos,
                      rotation: Math.max(-15, (pos.rotation || 0) - 2),
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded text-gray-700 hover:bg-black/10 transition-all cursor-pointer"
                  title="Tilt counter-clockwise"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateNotePos(note.id, {
                      ...pos,
                      rotation: 0,
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-700 hover:bg-black/10 transition-all cursor-pointer"
                  title="Straighten note (0°)"
                >
                  0°
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateNotePos(note.id, {
                      ...pos,
                      rotation: Math.min(15, (pos.rotation || 0) + 2),
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded text-gray-700 hover:bg-black/10 transition-all cursor-pointer"
                  title="Tilt clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-700 hover:bg-black/10 transition-all cursor-pointer"
                title="Archive note to Trash"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom Right Resize Handle for Sticky Note */}
            <div
              onPointerDown={(e) => handleResizePointerDown(e, note.id, 'note', pos)}
              title="Drag to resize note"
              className="absolute bottom-1 right-1 p-1.5 cursor-nwse-resize z-20 opacity-40 group-hover:opacity-100 hover:opacity-100 touch-none text-gray-700 hover:text-black transition-opacity"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="6" cy="10" r="1.5" />
                <circle cx="10" cy="6" r="1.5" />
                <circle cx="2" cy="10" r="1.5" />
                <circle cx="6" cy="6" r="1.5" />
                <circle cx="10" cy="2" r="1.5" />
              </svg>
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

            {/* Color Palette Picker & Expiration Selector */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      selectedColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'opacity-70'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <select
                  value={expiryOption}
                  onChange={(e) => setExpiryOption(e.target.value as any)}
                  className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none"
                >
                  <option value="permanent">Permanent</option>
                  <option value="1day">Expire 24h</option>
                  <option value="3days">Expire 3d</option>
                  <option value="custom">Custom Date</option>
                </select>
              </div>
            </div>

            {expiryOption === 'custom' && (
              <input
                type="datetime-local"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white"
              />
            )}

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

      {/* Trash / Archive Recovery Drawer Modal */}
      {isTrashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">
                  Archived & Expired Notes ({trashNotes.length})
                </span>
              </div>
              <button
                onClick={() => setIsTrashOpen(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {trashNotes.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">
                  Trash is empty.
                </div>
              ) : (
                trashNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl bg-gray-950 border border-gray-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: note.bgColor || '#fef08a' }}
                        />
                        <span className="text-xs font-bold text-white truncate">
                          {note.title || note.content || 'Checklist Note'}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {note.expiresAt && new Date(note.expiresAt) <= now
                          ? `Expired on ${new Date(note.expiresAt).toLocaleDateString()}`
                          : 'Archived'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNote(note.id, { archivedAt: null, expiresAt: null })
                        }
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold cursor-pointer transition-all"
                      >
                        Restore
                      </button>
                      {onPermanentlyDeleteNote && (
                        <button
                          type="button"
                          onClick={() => onPermanentlyDeleteNote(note.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tile Settings & Configuration Modal */}
      {editingWidget && (
        <WidgetSettingsModal
          isOpen={editingWidget !== null}
          onClose={() => setEditingWidget(null)}
          widget={editingWidget}
          onSave={(widgetId, updates) => {
            if (onUpdateWidget) {
              onUpdateWidget(widgetId, updates);
            }
          }}
          onOpenPhotoSources={() => {
            setPhotoSourcesTargetWidget(editingWidget);
          }}
        />
      )}

      {/* Per-Widget Photo Sources Hub opened from Tile Settings */}
      <PhotoSourcesModal
        isOpen={photoSourcesTargetWidget !== null}
        onClose={() => setPhotoSourcesTargetWidget(null)}
        currentStyle={photoSourcesTargetWidget?.config?.displayStyle || 'ken_burns'}
        onStyleChange={(newStyle) => {
          if (photoSourcesTargetWidget && onUpdateWidget) {
            onUpdateWidget(photoSourcesTargetWidget.id, {
              config: { ...photoSourcesTargetWidget.config, displayStyle: newStyle },
            });
          }
        }}
        rotationIntervalSec={photoSourcesTargetWidget?.config?.rotationIntervalSec || 15}
        onRotationIntervalChange={(newSec) => {
          if (photoSourcesTargetWidget && onUpdateWidget) {
            onUpdateWidget(photoSourcesTargetWidget.id, {
              config: { ...photoSourcesTargetWidget.config, rotationIntervalSec: newSec },
            });
          }
        }}
        onPhotosLoaded={(newPhotos, sourceName) => {
          if (photoSourcesTargetWidget && onUpdateWidget && newPhotos.length > 0) {
            onUpdateWidget(photoSourcesTargetWidget.id, {
              config: {
                ...photoSourcesTargetWidget.config,
                customPhotos: newPhotos,
                sourceLabel: sourceName,
              },
            });
          }
        }}
      />
    </div>
  );
};
