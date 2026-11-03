import React, { useRef, useState, useEffect } from 'react';
import type {
  StickyNoteItem,
  DashboardWidget,
  CanvasBackgroundTheme,
  DashboardTab,
} from '../../types/dashboard';
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
  Edit2,
  Layers,
} from 'lucide-react';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { WorldClockWidget } from '../widgets/WorldClockWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { TextBoxWidget } from '../widgets/TextBoxWidget';
import { CalendarWidget } from '../widgets/CalendarWidget';
import { RssWidget } from '../widgets/RssWidget';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';
import { StickyNotesWidget } from '../widgets/StickyNotesWidget';
import { MediaEmbedWidget } from '../widgets/MediaEmbedWidget';
import { WidgetSettingsModal } from '../widgets/WidgetSettingsModal';
import { PhotoSourcesModal } from '../photos/PhotoSourcesModal';
import { CANVAS_THEMES } from '../../data/canvasThemes';
import { findOpenCanvasSpot } from '../../utils/autoLayout';

interface CorkboardProps {
  notes: StickyNoteItem[];
  widgets?: DashboardWidget[];
  tabs?: DashboardTab[];
  activeTabId?: string;
  dockPaddingClass: string;
  backgroundTheme?: CanvasBackgroundTheme;
  customWallpaperUrl?: string;
  backgroundDimLevel?: number;
  hideNotes?: boolean;
  isCreatorOpen?: boolean;
  onOpenCreator?: () => void;
  onCloseCreator?: () => void;
  isTrashOpen?: boolean;
  onCloseTrash?: () => void;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onUpdateWidgetPos?: (widgetId: string, gridPos: any, freeformPos: NonNullable<DashboardWidget['freeformPos']>) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onOpenAddWidget?: () => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  onUpdateTab?: (tabId: string, updates: Partial<DashboardTab>) => void;
}

const COLOR_PALETTE = [
  '#fef08a', // Amber/Yellow
  '#bbf7d0', // Emerald/Green
  '#bae6fd', // Sky/Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#fed7aa', // Orange
];

const FONT_SIZE_CLASSES: Record<NonNullable<StickyNoteItem['fontSize']>, string> = {
  sm: 'text-[11px] leading-snug',
  base: 'text-xs leading-relaxed',
  lg: 'text-sm md:text-base leading-relaxed font-medium',
  xl: 'text-base md:text-xl leading-snug font-semibold',
};

export const Corkboard: React.FC<CorkboardProps> = ({
  notes,
  widgets = [],
  tabs = [],
  activeTabId = 'tab-corkboard',
  dockPaddingClass,
  backgroundTheme = 'midnight_dots',
  customWallpaperUrl,
  backgroundDimLevel = 45,
  hideNotes = false,
  isCreatorOpen = false,
  onOpenCreator,
  onCloseCreator,
  isTrashOpen = false,
  onCloseTrash,
  onUpdateNotePos,
  onUpdateWidgetPos,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onPermanentlyDeleteNote,
  onRemoveWidget,
  onOpenAddWidget,
  onUpdateWidget,
  onUpdateTab,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<'note' | 'widget'>('note');
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ xRatio: number; yRatio: number } | null>(null);
  const dragPosRef = useRef<{ xRatio: number; yRatio: number } | null>(null);
  const dragStartPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragTargetInitialPosRef = useRef<NonNullable<DashboardWidget['freeformPos']> | null>(null);
  const isDraggingRef = useRef(false);
  const nextZIndexRef = useRef(1);
  const lastTapRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const notesRef = useRef(notes);
  const widgetsRef = useRef(widgets);

  useEffect(() => {
    notesRef.current = notes;
    widgetsRef.current = widgets;
  }, [notes, widgets]);

  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [photoSourcesTargetWidget, setPhotoSourcesTargetWidget] = useState<DashboardWidget | null>(null);

  // Resizing state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizingType, setResizingType] = useState<'note' | 'widget'>('widget');
  const [resizeRatio, setResizeRatio] = useState<{ wRatio: number; hRatio: number } | null>(null);
  const resizeRatioRef = useRef<{ wRatio: number; hRatio: number } | null>(null);
  const [resizeStart, setResizeStart] = useState<{ startX: number; startY: number; startW: number; startH: number }>({
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  // Grab-and-Rotate state
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatingType, setRotatingType] = useState<'note' | 'widget'>('note');
  const [rotateAngle, setRotateAngle] = useState<number | null>(null);
  const rotateAngleRef = useRef<number | null>(null);
  const [rotateStart, setRotateStart] = useState<{
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  }>({
    centerX: 0,
    centerY: 0,
    startAngle: 0,
    startRotation: 0,
  });

  // Note Creator & Inline Editor Modal State
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [selectedFontSize, setSelectedFontSize] = useState<NonNullable<StickyNoteItem['fontSize']>>('base');
  const [selectedNoteTabId, setSelectedNoteTabId] = useState<string>(activeTabId);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [expiryOption, setExpiryOption] = useState<'permanent' | '1day' | '3days' | 'custom'>('permanent');
  const [customExpiry, setCustomExpiry] = useState('');
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);

  const getNextZIndex = () => {
    const widgetMax = widgets.reduce((m, w) => Math.max(m, w.freeformPos?.zIndex || 1), 1);
    const noteMax = notes.reduce((m, n) => Math.max(m, n.freeformPos?.zIndex || 1), 1);
    return Math.min(45, Math.max(widgetMax, noteMax) + 1);
  };

  const isCoveredByWidget = (
    notePos: { xRatio: number; yRatio: number; wRatio: number; hRatio?: number },
    widgetsList: DashboardWidget[]
  ): boolean => {
    const nW = notePos.wRatio || 0.26;
    const nH = notePos.hRatio || 0.3;
    const nArea = nW * nH;
    if (nArea <= 0) return true;

    for (const w of widgetsList) {
      const wp = w.freeformPos;
      if (!wp) continue;
      const wW = wp.wRatio || 0.35;
      const wH = wp.hRatio || 0.45;

      const xOverlap = Math.max(
        0,
        Math.min(notePos.xRatio + nW, wp.xRatio + wW) - Math.max(notePos.xRatio, wp.xRatio)
      );
      const yOverlap = Math.max(
        0,
        Math.min(notePos.yRatio + nH, wp.yRatio + wH) - Math.max(notePos.yRatio, wp.yRatio)
      );
      const overlapArea = xOverlap * yOverlap;

      // If a widget overlaps more than 50% of the note, it is considered covered
      if (overlapArea / nArea > 0.5) {
        return true;
      }
    }
    return false;
  };

  const handlePinNoteToCanvas = (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // Unhide notes on this canvas if currently hidden
    if (hideNotes && onUpdateTab && activeTabId) {
      onUpdateTab(activeTabId, { hideNotes: false });
    }

    const nextZ = getNextZIndex();
    let targetPos = note.freeformPos ? { ...note.freeformPos, zIndex: nextZ } : null;

    if (!targetPos || isCoveredByWidget(targetPos, widgets)) {
      const openSpot = findOpenCanvasSpot(
        [
          ...widgets.map((w) => w.freeformPos || { xRatio: 0.1, yRatio: 0.1, wRatio: 0.35, hRatio: 0.45 }),
          ...notes
            .filter((n) => n.id !== noteId && n.isPinnedToCanvas !== false)
            .map((n) => n.freeformPos || { xRatio: 0.1, yRatio: 0.1, wRatio: 0.26, hRatio: 0.3 }),
        ],
        targetPos?.wRatio || 0.26,
        targetPos?.hRatio || 0.3,
        targetPos?.rotation || 0
      );
      targetPos = {
        ...openSpot,
        zIndex: nextZ,
      };
    }

    onUpdateNote(noteId, {
      isPinnedToCanvas: true,
      freeformPos: targetPos,
    });

    setHighlightedNoteId(noteId);
    setTimeout(() => {
      setHighlightedNoteId(null);
    }, 2500);
  };

  const handleUnpinNoteFromCanvas = (noteId: string) => {
    onUpdateNote(noteId, { isPinnedToCanvas: false });
  };

  const openNoteEditorForExisting = (note: StickyNoteItem) => {
    setEditingNoteId(note.id);
    setNewTitle(note.title || '');
    setNewContent(note.content || '');
    setIsChecklist(Boolean(note.isChecklist));
    setChecklistItems(note.checklistItems ? [...note.checklistItems] : []);
    setSelectedColor(note.bgColor || COLOR_PALETTE[0]);
    setSelectedFontSize(note.fontSize || 'base');
    setSelectedNoteTabId(note.tabId || activeTabId);

    if (note.expiresAt) {
      setExpiryOption('custom');
      try {
        const d = new Date(note.expiresAt);
        const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setCustomExpiry(isoLocal);
      } catch {
        setCustomExpiry('');
      }
    } else {
      setExpiryOption('permanent');
      setCustomExpiry('');
    }
    onOpenCreator?.();
  };

  const resetNoteModal = () => {
    setEditingNoteId(null);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setChecklistItems([]);
    setSelectedColor(COLOR_PALETTE[0]);
    setSelectedFontSize('base');
    setSelectedNoteTabId(activeTabId);
    setExpiryOption('permanent');
    setCustomExpiry('');
    onCloseCreator?.();
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;

    const cardEl = (e.currentTarget as HTMLElement).closest('[data-canvas-card="true"]');
    const containerRect = containerRef.current.getBoundingClientRect();
    const cardRect = cardEl?.getBoundingClientRect();

    const fallbackWRatio = cardRect ? cardRect.width / containerRect.width : 0.26;
    const fallbackHRatio = cardRect ? cardRect.height / containerRect.height : 0.3;

    dragTargetInitialPosRef.current = pos || null;
    setResizingId(id);
    setResizingType(type);
    const initialW = pos?.wRatio ?? fallbackWRatio;
    const initialH = pos?.hRatio ?? fallbackHRatio;
    setResizeRatio({ wRatio: initialW, hRatio: initialH });
    resizeRatioRef.current = { wRatio: initialW, hRatio: initialH };
    setResizeStart({
      startX: e.clientX,
      startY: e.clientY,
      startW: initialW,
      startH: initialH,
    });

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleRotatePointerDown = (
    e: React.PointerEvent,
    id: string,
    type: 'note' | 'widget',
    pos?: NonNullable<DashboardWidget['freeformPos']>
  ) => {
    e.stopPropagation();
    const cardEl = (e.currentTarget as HTMLElement).closest('[data-canvas-card="true"]');
    if (!cardEl) return;

    const cardRect = cardEl.getBoundingClientRect();
    const centerX = cardRect.left + cardRect.width / 2;
    const centerY = cardRect.top + cardRect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

    dragTargetInitialPosRef.current = pos || null;
    setRotatingId(id);
    setRotatingType(type);
    const initialRot = pos?.rotation || 0;
    setRotateAngle(initialRot);
    rotateAngleRef.current = initialRot;
    setRotateStart({
      centerX,
      centerY,
      startAngle,
      startRotation: initialRot,
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
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"], [data-no-drag="true"]')) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    const currentX = (pos?.xRatio ?? 0.1) * rect.width;
    const currentY = (pos?.yRatio ?? 0.1) * rect.height;

    const nextZ = getNextZIndex();
    nextZIndexRef.current = nextZ;
    dragTargetInitialPosRef.current = pos || null;
    dragStartPointerRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;

    setDraggingId(id);
    setDraggingType(type);
    const initialOffset = {
      x: containerX - currentX,
      y: containerY - currentY,
    };
    setDragOffset(initialOffset);
    const initialPos = pos ? { xRatio: pos.xRatio, yRatio: pos.yRatio } : null;
    setDragPos(initialPos);
    dragPosRef.current = initialPos;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent | PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    // 1. Grab-and-Rotate in progress
    if (rotatingId) {
      if (e.cancelable) e.preventDefault();
      const currentAngle =
        Math.atan2(e.clientY - rotateStart.centerY, e.clientX - rotateStart.centerX) *
        (180 / Math.PI);
      let deltaAngle = currentAngle - rotateStart.startAngle;
      if (deltaAngle > 180) deltaAngle -= 360;
      if (deltaAngle < -180) deltaAngle += 360;

      let nextRotation = Math.round(rotateStart.startRotation + deltaAngle);
      if (Math.abs(nextRotation) <= 2.5) {
        nextRotation = 0;
      }
      nextRotation = Math.max(-60, Math.min(60, nextRotation));

      rotateAngleRef.current = nextRotation;
      setRotateAngle(nextRotation);
      return;
    }

    // 2. Resizing in progress
    if (resizingId) {
      if (e.cancelable) e.preventDefault();
      const deltaX = e.clientX - resizeStart.startX;
      const deltaY = e.clientY - resizeStart.startY;
      const deltaWRatio = deltaX / rect.width;
      const deltaHRatio = deltaY / rect.height;

      const minW = resizingType === 'widget' ? 0.14 : 0.08;
      const minH = resizingType === 'widget' ? 0.14 : 0.08;
      const initialPos = dragTargetInitialPosRef.current;
      const maxW = 1.0 - (initialPos?.xRatio || 0.1);
      const maxH = 1.0 - (initialPos?.yRatio || 0.1);

      const newW = Math.max(minW, Math.min(maxW, resizeStart.startW + deltaWRatio));
      const newH = Math.max(minH, Math.min(maxH, resizeStart.startH + deltaHRatio));

      resizeRatioRef.current = { wRatio: newW, hRatio: newH };
      setResizeRatio({ wRatio: newW, hRatio: newH });
      return;
    }

    // 3. Dragging in progress
    if (draggingId) {
      if (e.cancelable) e.preventDefault();
      const dist = Math.hypot(
        e.clientX - dragStartPointerRef.current.x,
        e.clientY - dragStartPointerRef.current.y
      );
      if (dist > 3) {
        isDraggingRef.current = true;
      }

      const containerX = e.clientX - rect.left;
      const containerY = e.clientY - rect.top;

      const newX = Math.max(0, Math.min(rect.width - 60, containerX - dragOffset.x));
      const newY = Math.max(0, Math.min(rect.height - 60, containerY - dragOffset.y));

      const nextXRatio = newX / rect.width;
      const nextYRatio = newY / rect.height;

      dragPosRef.current = { xRatio: nextXRatio, yRatio: nextYRatio };
      setDragPos({ xRatio: nextXRatio, yRatio: nextYRatio });
      return;
    }
  };

  const handlePointerUp = (e?: React.PointerEvent | PointerEvent) => {
    if (e && 'currentTarget' in e && (e as any).currentTarget && (e as any).pointerId !== undefined) {
      try {
        ((e as any).currentTarget as HTMLElement).releasePointerCapture((e as any).pointerId);
      } catch {}
    }

    // 1. Commit drag
    if (draggingId) {
      const finalPos = dragPosRef.current;
      const initialPos = dragTargetInitialPosRef.current;
      const targetZ = nextZIndexRef.current || (initialPos?.zIndex || 1);

      if (isDraggingRef.current && finalPos && initialPos) {
        if (draggingType === 'note') {
          onUpdateNotePos(draggingId, {
            ...initialPos,
            xRatio: finalPos.xRatio,
            yRatio: finalPos.yRatio,
            zIndex: targetZ,
          });
        } else if (draggingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === draggingId);
          if (widget) {
            onUpdateWidgetPos(draggingId, widget.gridPos, {
              ...initialPos,
              xRatio: finalPos.xRatio,
              yRatio: finalPos.yRatio,
              zIndex: targetZ,
            });
          }
        }
      } else if (initialPos && targetZ !== initialPos.zIndex) {
        if (draggingType === 'note') {
          onUpdateNotePos(draggingId, { ...initialPos, zIndex: targetZ });
        } else if (draggingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === draggingId);
          if (widget) {
            onUpdateWidgetPos(draggingId, widget.gridPos, { ...initialPos, zIndex: targetZ });
          }
        }
      }

      setDraggingId(null);
      setDragPos(null);
      dragPosRef.current = null;
      dragTargetInitialPosRef.current = null;
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    }

    // 2. Commit rotate
    if (rotatingId) {
      if (rotateAngleRef.current !== null) {
        const nextRotation = rotateAngleRef.current;
        if (rotatingType === 'note') {
          const note = notesRef.current.find((n) => n.id === rotatingId);
          if (note && note.freeformPos) {
            onUpdateNotePos(rotatingId, { ...note.freeformPos, rotation: nextRotation });
          }
        } else if (rotatingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === rotatingId);
          if (widget && widget.freeformPos) {
            onUpdateWidgetPos(rotatingId, widget.gridPos, { ...widget.freeformPos, rotation: nextRotation });
          }
        }
      }
      setRotatingId(null);
      setRotateAngle(null);
      rotateAngleRef.current = null;
    }

    // 3. Commit resize
    if (resizingId) {
      if (resizeRatioRef.current !== null) {
        const { wRatio, hRatio } = resizeRatioRef.current;
        if (resizingType === 'note') {
          const note = notesRef.current.find((n) => n.id === resizingId);
          if (note && note.freeformPos) {
            onUpdateNotePos(resizingId, { ...note.freeformPos, wRatio, hRatio });
          }
        } else if (resizingType === 'widget' && onUpdateWidgetPos) {
          const widget = widgetsRef.current.find((w) => w.id === resizingId);
          if (widget && widget.freeformPos) {
            onUpdateWidgetPos(resizingId, widget.gridPos, { ...widget.freeformPos, wRatio, hRatio });
          }
        }
      }
      setResizingId(null);
      setResizeRatio(null);
      resizeRatioRef.current = null;
    }
  };

  const handlePointerMoveRef = useRef(handlePointerMove);
  const handlePointerUpRef = useRef(handlePointerUp);

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
    handlePointerUpRef.current = handlePointerUp;
  });

  // Window-level Pointer Event Listeners (ensures gestures are never lost on mobile)
  useEffect(() => {
    if (!draggingId && !rotatingId && !resizingId) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      handlePointerMoveRef.current(e);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      handlePointerUpRef.current(e);
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [draggingId, rotatingId, resizingId]);

  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    setChecklistItems([
      ...checklistItems,
      { id: Date.now().toString(), text: newItemText.trim(), done: false },
    ]);
    setNewItemText('');
  };

  const handleSaveNoteModal = () => {
    if (!newTitle.trim() && !newContent.trim() && checklistItems.length === 0) return;

    let expiresAt: string | null = null;
    if (expiryOption === '1day') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '3days') {
      expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    }

    if (editingNoteId) {
      onUpdateNote(editingNoteId, {
        tabId: selectedNoteTabId || activeTabId,
        title: newTitle.trim() || undefined,
        content: newContent,
        isChecklist,
        checklistItems: isChecklist ? checklistItems : undefined,
        bgColor: selectedColor,
        fontSize: selectedFontSize,
        expiresAt,
      });
    } else {
      // Omit freeformPos so dashboardStore.addNote automatically finds an open non-overlapping spot!
      onAddNote({
        tabId: selectedNoteTabId || activeTabId,
        title: newTitle.trim() || undefined,
        content: newContent,
        isChecklist,
        checklistItems: isChecklist ? checklistItems : undefined,
        bgColor: selectedColor,
        fontSize: selectedFontSize,
        expiresAt,
      });
    }

    resetNoteModal();
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
    if (n.isPinnedToCanvas === false) return false;
    // If the canvas has hideNotes active, only hide notes that have not been explicitly pinned to canvas
    if (hideNotes && n.isPinnedToCanvas !== true) return false;
    return true;
  });

  const trashNotes = notes.filter((n) => {
    if (n.archivedAt) return true;
    if (n.expiresAt && new Date(n.expiresAt) <= now) return true;
    return false;
  });

  const activeThemeObj =
    CANVAS_THEMES.find((t) => t.id === backgroundTheme) || CANVAS_THEMES[0];

  const dimAlpha = Math.max(0, Math.min(0.92, (backgroundDimLevel ?? 45) / 100));

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        touchAction: 'none',
        WebkitTouchCallout: 'none',
        ...(backgroundTheme === 'custom' && customWallpaperUrl
          ? { backgroundImage: `url("${customWallpaperUrl}")` }
          : {}),
      }}
      className={`relative w-full h-screen overflow-hidden select-none touch-none ${activeThemeObj.canvasClass} ${dockPaddingClass}`}
    >
      {/* Dynamic Dim Overlay for Custom Picture Backgrounds */}
      {backgroundTheme === 'custom' && customWallpaperUrl && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            backgroundColor: `rgba(9, 13, 22, ${dimAlpha})`,
          }}
        />
      )}

      {/* Empty Canvas Onboarding Prompt (when a new canvas has 0 tiles and 0 notes) */}
      {widgets.length === 0 && activeNotes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-6">
          <div className="pointer-events-auto max-w-sm w-full rounded-2xl bg-gray-900/80 backdrop-blur-md border border-gray-800 p-6 text-center shadow-2xl space-y-4">
            <p className="text-sm font-bold text-white">This Canvas is Empty</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Add live widgets (Weather, Photos, Calendar, Lofi Stream) or pin sticky notes to customize this board.
            </p>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              {onOpenAddWidget && (
                <button
                  onClick={onOpenAddWidget}
                  className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white border border-gray-700 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  <span>Add Tile</span>
                </button>
              )}
              {onOpenCreator && (
                <button
                  onClick={() => {
                    setSelectedNoteTabId(activeTabId);
                    onOpenCreator();
                  }}
                  className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>Pin Note</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
        const isRotating = rotatingId === widget.id;
        const isResizing = resizingId === widget.id;
        const isActiveManipulating = isDragging || isResizing || isRotating;
        const isTransparentTextbox =
          widget.type === 'textbox' &&
          (!widget.config?.bgStyle || widget.config?.bgStyle === 'transparent');

        const displayPos = {
          ...pos,
          xRatio: isDragging && dragPos ? dragPos.xRatio : pos.xRatio,
          yRatio: isDragging && dragPos ? dragPos.yRatio : pos.yRatio,
          wRatio: isResizing && resizeRatio ? resizeRatio.wRatio : pos.wRatio,
          hRatio: isResizing && resizeRatio ? resizeRatio.hRatio : pos.hRatio,
          rotation: isRotating && rotateAngle !== null ? rotateAngle : pos.rotation,
        };

        return (
          <div
            key={widget.id}
            data-canvas-card="true"
            onPointerDown={(e) => !isFullScreen && handlePointerDown(e, widget.id, 'widget', pos)}
            onPointerMove={handlePointerMove}
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
                    zIndex: isActiveManipulating ? 50 : (pos.zIndex || 1),
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }
                : {
                    position: 'absolute',
                    left: `${displayPos.xRatio * 100}%`,
                    top: `${displayPos.yRatio * 100}%`,
                    width: `${displayPos.wRatio * 100}%`,
                    height: `${displayPos.hRatio * 100}%`,
                    minWidth: '180px',
                    minHeight: isTransparentTextbox ? '60px' : '140px',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    transform: `rotate(${displayPos.rotation}deg) ${isDragging ? 'scale(1.02)' : 'scale(1)'}`,
                    zIndex: isActiveManipulating ? 50 : pos.zIndex,
                    touchAction: 'none',
                    WebkitTouchCallout: 'none',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    transition: isActiveManipulating
                      ? 'none'
                      : 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1), top 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease-out, box-shadow 0.2s',
                  }
            }
            className={`group ${
              isFullScreen
                ? 'rounded-none border-0 p-0 overflow-hidden'
                : isTransparentTextbox
                ? 'rounded-2xl border border-dashed border-transparent hover:border-white/20 p-2'
                : 'rounded-2xl border border-gray-800/90 p-4'
            } ${
              isTransparentTextbox
                ? 'bg-transparent text-white'
                : 'bg-gray-900/80 backdrop-blur-md shadow-2xl text-white'
            } cursor-grab active:cursor-grabbing touch-none select-none transition-shadow ${
              isDragging || isRotating
                ? 'ring-2 ring-blue-500 shadow-blue-500/20'
                : isTransparentTextbox
                ? 'hover:bg-white/5'
                : 'hover:shadow-blue-500/10'
            } flex flex-col justify-between`}
          >
            {/* Top-Center Grab-to-Rotate Handle (hidden when maximized, appears on hover) */}
            {!isFullScreen && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                {onUpdateWidgetPos && (
                  <div
                    data-no-drag="true"
                    onPointerDown={(e) => handleRotatePointerDown(e, widget.id, 'widget', pos)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onUpdateWidgetPos(widget.id, widget.gridPos, { ...pos, rotation: 0 });
                    }}
                    title="Grab and drag to rotate tile (double-click to reset to 0°)"
                    className={`w-6 h-6 rounded-full bg-gray-900/95 border border-gray-600 text-blue-300 hover:text-white hover:border-blue-400 shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing transition-opacity ${
                      isRotating ? 'opacity-100 ring-2 ring-blue-400' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <RotateCw className="w-3 h-3" />
                  </div>
                )}
                {isRotating && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-mono font-bold text-[10px] shadow-lg">
                    {pos.rotation}°
                  </span>
                )}
              </div>
            )}

            {/* Top Right Widget Controls: Tilt, Settings, Maximize/Restore & Remove */}
            <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-md px-1.5 py-1 rounded-xl border border-white/10 shadow-xl">
              {!isFullScreen && onUpdateWidgetPos && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        rotation: Math.max(-60, (pos.rotation || 0) - 3),
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Tilt counter-clockwise"
                    className="p-1 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateWidgetPos(widget.id, widget.gridPos, {
                        ...pos,
                        rotation: Math.min(60, (pos.rotation || 0) + 3),
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Tilt clockwise"
                    className="p-1 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-all cursor-pointer"
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
                  className="p-1 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-all cursor-pointer"
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
                  className="p-1 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-all cursor-pointer"
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
                  className="p-1 rounded-lg hover:bg-red-500/80 text-gray-400 hover:text-white transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Bottom Right Resize Handle */}
            {!isFullScreen && (
              <div
                data-no-drag="true"
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
                  title={widget.title}
                  clockFace={widget.config?.clockFace || 'digital'}
                  showSeconds={widget.config?.showSeconds ?? true}
                  timezone={widget.config?.timezone}
                  locationName={widget.config?.locationName}
                />
              ) : widget.type === 'world_clock' ? (
                <WorldClockWidget
                  title={widget.title}
                  cities={widget.config?.cities}
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
                  showSeconds={widget.config?.showSeconds ?? true}
                  timezone={widget.config?.timezone}
                  clockAlign={widget.config?.clockAlign || 'center'}
                />
              ) : widget.type === 'countdown' ? (
                <CountdownWidget
                  eventName={widget.title || widget.config?.eventName}
                  targetDate={widget.config?.targetDate}
                />
              ) : widget.type === 'quotes' ? (
                <QuotesWidget
                  customQuotes={widget.config?.customQuotes}
                  quoteMode={widget.config?.quoteMode}
                  rotationIntervalSec={widget.config?.rotationIntervalSec ?? widget.config?.quoteIntervalSec}
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
                  widgetId={widget.id}
                  initialStyle={widget.config?.displayStyle || 'ken_burns'}
                  rotationIntervalSec={widget.config?.rotationIntervalSec || 15}
                  customPhotos={widget.config?.customPhotos}
                  initialSourceLabel={widget.config?.sourceLabel}
                  initialPolaroidCount={widget.config?.polaroidCount || 12}
                  initialPolaroidSizeMode={widget.config?.polaroidSizeMode || 'mixed'}
                  photoOrder={widget.config?.photoOrder || 'random'}
                  showCaptions={widget.config?.showCaptions ?? true}
                  onUpdateConfig={(updates) => {
                    if (onUpdateWidget) {
                      onUpdateWidget(widget.id, {
                        config: { ...widget.config, ...updates },
                      });
                    }
                  }}
                />
              ) : widget.type === 'embed' ? (
                <MediaEmbedWidget
                  preset={widget.config?.preset || 'lofi'}
                  customUrl={widget.config?.customUrl}
                  muted={widget.config?.muted ?? true}
                  latitude={widget.config?.latitude}
                  longitude={widget.config?.longitude}
                  onUpdateConfig={(updates) => {
                    if (onUpdateWidget) {
                      onUpdateWidget(widget.id, {
                        config: { ...widget.config, ...updates },
                      });
                    }
                  }}
                />
              ) : widget.type === 'textbox' ? (
                <TextBoxWidget
                  content={widget.config?.content}
                  fontSize={widget.config?.fontSize}
                  fontWeight={widget.config?.fontWeight}
                  textAlign={widget.config?.textAlign}
                  fontFamily={widget.config?.fontFamily}
                  textColor={widget.config?.textColor}
                  textShadow={widget.config?.textShadow}
                  textTransform={widget.config?.textTransform}
                  letterSpacing={widget.config?.letterSpacing}
                  bgStyle={widget.config?.bgStyle}
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
                  onPinNoteToCanvas={handlePinNoteToCanvas}
                  onUnpinNoteFromCanvas={handleUnpinNoteFromCanvas}
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
          wRatio: 0.26,
          hRatio: 0.3,
          zIndex: 1,
          rotation: 0,
        };

        const isDragging = draggingId === note.id;
        const isRotating = rotatingId === note.id;
        const isResizing = resizingId === note.id;
        const isActiveManipulating = isDragging || isResizing || isRotating;
        const isExpiringSoon =
          note.expiresAt &&
          new Date(note.expiresAt).getTime() - now.getTime() < 12 * 60 * 60 * 1000;
        const fontSizeClass = FONT_SIZE_CLASSES[note.fontSize || 'base'];

        const displayPos = {
          ...pos,
          xRatio: isDragging && dragPos ? dragPos.xRatio : pos.xRatio,
          yRatio: isDragging && dragPos ? dragPos.yRatio : pos.yRatio,
          wRatio: isResizing && resizeRatio ? resizeRatio.wRatio : pos.wRatio,
          hRatio: isResizing && resizeRatio ? resizeRatio.hRatio : (pos.hRatio || 0.3),
          rotation: isRotating && rotateAngle !== null ? rotateAngle : pos.rotation,
        };

        return (
          <div
            key={note.id}
            data-canvas-card="true"
            onPointerDown={(e) => handlePointerDown(e, note.id, 'note', pos)}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => {
              handlePointerUp(e);
              if (!isDraggingRef.current) {
                const now = Date.now();
                if (lastTapRef.current.id === note.id && now - lastTapRef.current.time < 350) {
                  openNoteEditorForExisting(note);
                  lastTapRef.current = { id: '', time: 0 };
                } else {
                  lastTapRef.current = { id: note.id, time: now };
                }
              }
            }}
            onPointerCancel={handlePointerUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openNoteEditorForExisting(note);
            }}
            style={{
              position: 'absolute',
              left: `${displayPos.xRatio * 100}%`,
              top: `${displayPos.yRatio * 100}%`,
              width: `${displayPos.wRatio * 100}%`,
              height: `${(displayPos.hRatio || 0.3) * 100}%`,
              minWidth: '110px',
              minHeight: '90px',
              maxWidth: '100%',
              maxHeight: '100%',
              transform: `rotate(${displayPos.rotation}deg) ${isDragging ? 'scale(1.03)' : 'scale(1)'}`,
              backgroundColor: note.bgColor || '#fef08a',
              zIndex: isActiveManipulating ? 50 : pos.zIndex,
              touchAction: 'none',
              WebkitTouchCallout: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              transition: isActiveManipulating
                ? 'none'
                : 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1), top 0.3s cubic-bezier(0.22, 1, 0.36, 1), width 0.3s cubic-bezier(0.22, 1, 0.36, 1), height 0.3s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease-out, box-shadow 0.2s',
            }}
            className={`group rounded-2xl p-3.5 shadow-2xl text-gray-900 cursor-grab active:cursor-grabbing border border-black/10 touch-none select-none transition-all ${
              isDragging || isRotating
                ? 'ring-2 ring-blue-500/70 shadow-2xl'
                : highlightedNoteId === note.id
                ? 'ring-4 ring-blue-500 shadow-2xl shadow-blue-500/50 scale-105'
                : isExpiringSoon
                ? 'ring-2 ring-amber-500 shadow-amber-500/20'
                : 'hover:shadow-yellow-500/10'
            } flex flex-col justify-between`}
          >
            {/* Top-Center Grab-to-Rotate Handle (appears on hover) */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20">
              <div
                data-no-drag="true"
                onPointerDown={(e) => handleRotatePointerDown(e, note.id, 'note', pos)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onUpdateNotePos(note.id, { ...pos, rotation: 0 });
                }}
                title="Grab and drag in a circle to rotate note (double-click to reset to 0°)"
                className={`w-6 h-6 rounded-full bg-gray-900/95 border border-gray-700 text-white shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-opacity ${
                  isRotating ? 'opacity-100 ring-2 ring-blue-400' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <RotateCw className="w-3 h-3" />
              </div>
              {isRotating && (
                <span className="px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-mono font-bold text-[10px] shadow">
                  {displayPos.rotation}°
                </span>
              )}
            </div>

            <div
              className="flex-1 overflow-y-auto min-h-0 pr-0.5 select-none touch-none"
              style={{
                touchAction: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                userSelect: 'none',
              }}
            >
              {/* Note Title & Header Edit Button */}
              <div
                className="font-bold text-xs md:text-sm mb-1.5 flex items-center justify-between border-b border-black/10 pb-1 select-none touch-none"
                style={{
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  userSelect: 'none',
                }}
              >
                <span className="truncate select-none touch-none">
                  {note.title || (note.isChecklist ? 'Checklist' : 'Note')}
                </span>
                <div className="flex items-center gap-1 shrink-0 select-none touch-none">
                  {note.expiresAt && (
                    <span
                      title={`Expires: ${new Date(note.expiresAt).toLocaleString()}`}
                      className={`text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 select-none touch-none ${
                        isExpiringSoon ? 'bg-amber-500/30 text-amber-950 font-bold' : 'bg-black/10 text-gray-700'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <button
                    type="button"
                    data-no-drag="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNoteEditorForExisting(note);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1 rounded-md text-gray-700 hover:text-blue-900 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                    title="Edit note"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    data-no-drag="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateNote(note.id, { isPinnedToCanvas: false });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1 rounded-md text-gray-700 hover:text-red-900 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                    title="Close from canvas (remains saved in Notes Tile)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Note Content / Checklist */}
              {note.isChecklist && note.checklistItems ? (
                <div className="space-y-1.5 mt-1 select-none touch-none">
                  {note.checklistItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 w-full text-left select-none touch-none ${fontSizeClass}`}
                    >
                      <button
                        type="button"
                        data-no-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleChecklistItem(note, item.id);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        title={item.done ? 'Mark as incomplete' : 'Mark as complete'}
                        className="p-0.5 -m-0.5 hover:opacity-80 transition-opacity shrink-0 cursor-pointer text-gray-700 hover:text-gray-900"
                      >
                        {item.done ? (
                          <CheckSquare className="w-4 h-4 text-emerald-800 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-700 shrink-0" />
                        )}
                      </button>
                      <span
                        onClick={() => {
                          if (!isDraggingRef.current) {
                            toggleChecklistItem(note, item.id);
                          }
                        }}
                        className={`flex-1 select-none touch-none cursor-pointer ${
                          item.done ? 'line-through opacity-50' : 'font-medium'
                        }`}
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  className={`whitespace-pre-wrap break-words select-none touch-none ${fontSizeClass}`}
                  style={{
                    touchAction: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                    userSelect: 'none',
                  }}
                >
                  {note.content}
                </p>
              )}
            </div>

            {/* Note Bottom Actions: 1-Click Color Swatches, Tilt, Edit & Archive/Delete */}
            <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-black/10 mt-1.5 opacity-90 md:opacity-0 md:group-hover:opacity-100 transition-opacity pr-3 shrink-0">
              {/* 1-Click Inline Pastel Color Swatches */}
              <div className="flex items-center gap-1">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    data-no-drag="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateNote(note.id, { bgColor: color });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ backgroundColor: color }}
                    title="Change note color"
                    className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                      (note.bgColor || '#fef08a') === color
                        ? 'border-gray-900 scale-125 ring-1 ring-gray-900/50'
                        : 'border-black/25 hover:scale-110'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateNotePos(note.id, {
                      ...pos,
                      rotation: 0,
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="px-1 py-0.5 rounded text-[9px] font-mono text-gray-700 hover:bg-black/10 transition-all cursor-pointer"
                  title="Straighten note (0°)"
                >
                  0°
                </button>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    openNoteEditorForExisting(note);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-gray-700 hover:text-blue-800 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                  title="Edit note text, checklist, font size, or canvas board"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-no-drag="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(note.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-gray-700 hover:text-red-700 hover:bg-black/10 active:bg-black/20 transition-all cursor-pointer"
                  title="Archive note to Trash"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom Right Resize Handle for Sticky Note */}
            <div
              data-no-drag="true"
              onPointerDown={(e) => handleResizePointerDown(e, note.id, 'note', pos)}
              title="Drag to resize note (from mini post-it to full poster)"
              className="absolute bottom-1 right-1 p-1.5 cursor-nwse-resize z-20 opacity-50 group-hover:opacity-100 hover:opacity-100 touch-none text-gray-700 hover:text-black transition-opacity"
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

      {/* Creator & Inline Editor Modal for Sticky Notes */}
      {isCreatorOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-sm font-bold text-white">
                {editingNoteId ? 'Edit Sticky Note' : 'Pin Note to Canvas'}
              </span>
              <button
                onClick={resetNoteModal}
                className="text-gray-400 hover:text-white cursor-pointer"
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
                    className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
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

            {/* Canvas Board Selector & Font Size Selector */}
            <div className="grid grid-cols-2 gap-2">
              {tabs.length > 0 && (
                <div className="flex items-center gap-1.5 bg-gray-950/60 px-2.5 py-1.5 rounded-xl border border-gray-800">
                  <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <select
                    value={selectedNoteTabId}
                    onChange={(e) => setSelectedNoteTabId(e.target.value)}
                    title="Choose which canvas this note appears on"
                    className="w-full bg-transparent text-[11px] text-white focus:outline-none truncate"
                  >
                    {tabs.map((t) => (
                      <option key={t.id} value={t.id} className="bg-gray-900 text-white">
                        {t.name}
                      </option>
                    ))}
                    <option value="all" className="bg-gray-900 text-amber-300">
                      📌 Pin to All Canvases
                    </option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between bg-gray-950/60 px-2.5 py-1.5 rounded-xl border border-gray-800">
                <span className="text-[10px] text-gray-400 font-medium">Size:</span>
                <div className="flex items-center gap-0.5">
                  {(
                    [
                      { id: 'sm', label: 'S' },
                      { id: 'base', label: 'M' },
                      { id: 'lg', label: 'L' },
                      { id: 'xl', label: 'XL' },
                    ] as const
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setSelectedFontSize(sz.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        selectedFontSize === sz.id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Format Toggle: Message vs Checklist */}
            <div className="flex rounded-lg bg-gray-950 p-1 border border-gray-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setIsChecklist(false)}
                className={`flex-1 py-1.5 rounded-md text-center transition-all cursor-pointer ${
                  !isChecklist ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Text Note
              </button>
              <button
                type="button"
                onClick={() => setIsChecklist(true)}
                className={`flex-1 py-1.5 rounded-md text-center transition-all cursor-pointer ${
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
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {checklistItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-xs text-gray-300 bg-gray-950/60 p-1.5 rounded-lg border border-gray-800"
                      >
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) =>
                            setChecklistItems(
                              checklistItems.map((i) =>
                                i.id === item.id ? { ...i, text: e.target.value } : i
                              )
                            )
                          }
                          className="flex-1 bg-transparent text-xs text-gray-200 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setChecklistItems(checklistItems.filter((i) => i.id !== item.id))
                          }
                          className="text-gray-500 hover:text-red-400 cursor-pointer"
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
              onClick={handleSaveNoteModal}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
            >
              {editingNoteId ? 'Save Note Changes' : 'Pin Note to Board'}
            </button>
          </div>
        </div>
      )}

      {/* Trash / Archive Recovery Drawer Modal */}
      {isTrashOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">
                  Archived & Expired Notes ({trashNotes.length})
                </span>
              </div>
              <button
                onClick={onCloseTrash}
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
