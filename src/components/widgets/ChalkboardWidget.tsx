import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Eraser,
  Highlighter,
  Lock,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  ChalkBrushSize,
  ChalkStroke,
  ChalkTool,
  ChalkboardSurface,
  ChalkboardWidgetConfig,
} from '../../types/phase4Widgets';
import {
  CHALK_COLOR_PALETTE,
  appendChalkStroke,
  encodeStrokePoints,
  normalizePointToBoard,
  renderChalkStrokesToCanvas,
  sanitizeChalkStrokes,
  simplifyPointsRDP,
  undoLastChalkStroke,
  type BoardPoint,
} from '../../utils/chalkboardEngine';
import { useIsCursorHidden } from '../../hooks/useIdleCursor';

interface ChalkboardWidgetProps {
  title?: string;
  config?: ChalkboardWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  isCanvasLocked?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

const SURFACE_CLASSES: Record<ChalkboardSurface, string> = {
  slate:
    'bg-gradient-to-br from-[#19231f] via-[#131c18] to-[#0d1411] text-slate-100 border border-emerald-950/60 shadow-inner',
  cork:
    'bg-gradient-to-br from-[#7d5636] via-[#6d492c] to-[#5a3b22] text-amber-50 border border-amber-950/50 shadow-inner',
  whiteboard:
    'bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800 border border-slate-300/80 shadow-inner',
};

const SIZE_DOTS: Array<{ id: ChalkBrushSize; label: string; dotClass: string }> = [
  { id: 'fine', label: 'Fine', dotClass: 'w-1.5 h-1.5' },
  { id: 'medium', label: 'Medium', dotClass: 'w-2.5 h-2.5' },
  { id: 'bold', label: 'Bold', dotClass: 'w-3.5 h-3.5' },
];

export const ChalkboardWidget: React.FC<ChalkboardWidgetProps> = ({
  title,
  config,
  isLight = false,
  transparentBg = false,
  isCanvasLocked = false,
  onUpdateConfig,
}) => {
  const isCursorHidden = useIsCursorHidden();
  const surface: ChalkboardSurface =
    config?.surface === 'cork' || config?.surface === 'whiteboard' ? config.surface : 'slate';
  const showToolbarPref = config?.showToolbar !== false;
  const confirmBeforeClear = config?.confirmBeforeClear !== false;
  const isReadOnly = Boolean(isCanvasLocked && config?.allowDrawingWhenLocked === false);

  const defaultTool: ChalkTool = config?.defaultTool === 'marker' ? 'marker' : 'chalk';
  const defaultSize: ChalkBrushSize =
    config?.defaultSize === 'fine' || config?.defaultSize === 'bold'
      ? config.defaultSize
      : 'medium';
  const fallbackColor = surface === 'whiteboard' ? '#1e293b' : '#f8fafc';
  const defaultColor = config?.defaultColor || fallbackColor;

  const [prevConfigStrokes, setPrevConfigStrokes] = useState(config?.strokes);
  const [strokes, setStrokes] = useState<ChalkStroke[]>(() =>
    sanitizeChalkStrokes(config?.strokes)
  );
  if (config?.strokes !== prevConfigStrokes) {
    setPrevConfigStrokes(config?.strokes);
    setStrokes(sanitizeChalkStrokes(config?.strokes));
  }

  const [prevDefaultTool, setPrevDefaultTool] = useState(defaultTool);
  const [activeTool, setActiveTool] = useState<ChalkTool>(defaultTool);
  if (defaultTool !== prevDefaultTool) {
    setPrevDefaultTool(defaultTool);
    setActiveTool(defaultTool);
  }

  const [prevDefaultColor, setPrevDefaultColor] = useState(defaultColor);
  const [activeColor, setActiveColor] = useState<string>(defaultColor);
  if (defaultColor !== prevDefaultColor) {
    setPrevDefaultColor(defaultColor);
    setActiveColor(defaultColor);
  }

  const [prevDefaultSize, setPrevDefaultSize] = useState(defaultSize);
  const [activeSize, setActiveSize] = useState<ChalkBrushSize>(defaultSize);
  if (defaultSize !== prevDefaultSize) {
    setPrevDefaultSize(defaultSize);
    setActiveSize(defaultSize);
  }

  const [prevToolbarPref, setPrevToolbarPref] = useState(showToolbarPref);
  const [isTrayOpen, setIsTrayOpen] = useState<boolean>(showToolbarPref);
  if (showToolbarPref !== prevToolbarPref) {
    setPrevToolbarPref(showToolbarPref);
    setIsTrayOpen(showToolbarPref);
  }

  const [confirmClearArmed, setConfirmClearArmed] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const draftPointsRef = useRef<BoardPoint[]>([]);
  const draftStrokeRef = useRef<ChalkStroke | null>(null);
  const strokeCounterRef = useRef(0);
  const rafDrawRef = useRef<number | null>(null);
  const clearConfirmTimerRef = useRef<number | null>(null);
  const canvasCssSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const drawCanvas = useCallback(
    (strokeList: ReadonlyArray<ChalkStroke>, draft: ChalkStroke | null = null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const cssWidth = canvasCssSizeRef.current.width;
      const cssHeight = canvasCssSizeRef.current.height;
      if (cssWidth <= 0 || cssHeight <= 0) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderChalkStrokesToCanvas(ctx, cssWidth, cssHeight, strokeList, draft);
      ctx.restore();
    },
    []
  );

  // Sync canvas dimensions cleanly via ResizeObserver and redraw on finalized strokes changes
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const syncCanvasDimensions = () => {
      const rect = stage.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      canvasCssSizeRef.current = { width: cssW, height: cssH };
      drawCanvas(strokes, draftStrokeRef.current);
    };

    syncCanvasDimensions();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncCanvasDimensions);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [strokes, drawCanvas]);

  useEffect(() => {
    return () => {
      if (rafDrawRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafDrawRef.current);
      }
      if (clearConfirmTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(clearConfirmTimerRef.current);
      }
    };
  }, []);

  const scheduleDraftRender = () => {
    if (rafDrawRef.current !== null || typeof window === 'undefined') return;
    rafDrawRef.current = window.requestAnimationFrame(() => {
      rafDrawRef.current = null;
      drawCanvas(strokes, draftStrokeRef.current);
    });
  };

  const commitStrokes = (nextStrokes: ChalkStroke[]) => {
    setStrokes(nextStrokes);
    onUpdateConfig?.({ strokes: nextStrokes });
  };

  const finishActiveStroke = (pointerId: number) => {
    if (activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        if (canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore release errors when element unmounted
      }
    }

    const rawPoints = draftPointsRef.current;
    const activeDraft = draftStrokeRef.current;
    draftPointsRef.current = [];
    draftStrokeRef.current = null;

    if (!activeDraft || rawPoints.length === 0) {
      drawCanvas(strokes, null);
      return;
    }

    const simplified = simplifyPointsRDP(rawPoints, 2.5);
    const finalized: ChalkStroke = {
      ...activeDraft,
      points: encodeStrokePoints(simplified),
    };
    const nextStrokes = appendChalkStroke(strokes, finalized);
    commitStrokes(nextStrokes);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (isReadOnly) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const rect = stage.getBoundingClientRect();
    const firstPt = normalizePointToBoard(e.clientX, e.clientY, rect);

    activePointerIdRef.current = e.pointerId;
    strokeCounterRef.current += 1;
    const strokeId = `ch-${Date.now().toString(36)}-${strokeCounterRef.current}`;

    draftPointsRef.current = [firstPt];
    draftStrokeRef.current = {
      id: strokeId,
      tool: activeTool,
      color: activeColor,
      size: activeSize,
      points: encodeStrokePoints([firstPt]),
    };

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic event environments lacking pointer capture
    }

    drawCanvas(strokes, draftStrokeRef.current);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !draftStrokeRef.current) return;
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const pt = normalizePointToBoard(e.clientX, e.clientY, rect);
    const pts = draftPointsRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 2) {
      return;
    }

    pts.push(pt);
    draftStrokeRef.current = {
      ...draftStrokeRef.current,
      points: encodeStrokePoints(pts),
    };
    scheduleDraftRender();
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || strokes.length === 0) return;
    setConfirmClearArmed(false);
    commitStrokes(undoLastChalkStroke(strokes));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || strokes.length === 0) return;
    if (confirmBeforeClear && !confirmClearArmed) {
      setConfirmClearArmed(true);
      if (clearConfirmTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(clearConfirmTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        clearConfirmTimerRef.current = window.setTimeout(() => {
          setConfirmClearArmed(false);
          clearConfirmTimerRef.current = null;
        }, 3000);
      }
      return;
    }
    if (clearConfirmTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(clearConfirmTimerRef.current);
      clearConfirmTimerRef.current = null;
    }
    setConfirmClearArmed(false);
    commitStrokes([]);
  };

  const isLightSurface = transparentBg
    ? isLight
    : surface === 'whiteboard';

  const containerToneClass = transparentBg
    ? `bg-transparent ${isLight ? 'text-slate-900' : 'text-white'}`
    : SURFACE_CLASSES[surface];

  const pillChromeClass = isLightSurface
    ? 'bg-white/90 border border-slate-300/80 text-slate-700 shadow-sm'
    : 'bg-gray-950/85 border border-white/15 text-slate-200 shadow-lg';

  return (
    <div
      className={`group/chalk relative w-full h-full flex flex-col overflow-hidden rounded-[inherit] select-none ${containerToneClass}`}
    >
      {/* Subtle Top Header Strip */}
      <div className="pointer-events-none relative z-10 flex items-center justify-between px-3 pt-2.5 pb-1 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {!transparentBg && (
            <span
              className={`text-[11px] font-semibold tracking-wide truncate ${
                isLightSurface ? 'text-slate-600' : 'text-white/75'
              }`}
            >
              {title || 'Family Chalkboard'}
            </span>
          )}
          {isReadOnly && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                isLightSurface
                  ? 'bg-slate-200/90 text-slate-700'
                  : 'bg-white/10 text-slate-200'
              }`}
            >
              <Lock className="w-2.5 h-2.5" />
              Locked
            </span>
          )}
        </div>

        <button
          type="button"
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setIsTrayOpen((prev) => !prev);
          }}
          title={
            isCursorHidden
              ? undefined
              : isTrayOpen
                ? 'Hide chalk tray'
                : 'Show chalk & doodle tools'
          }
          className={`pointer-events-auto p-1.5 rounded-xl transition-all cursor-pointer ${pillChromeClass} ${
            isTrayOpen
              ? 'opacity-90 hover:opacity-100'
              : isCursorHidden
                ? 'opacity-0 pointer-events-none'
                : 'opacity-55 hover:opacity-100'
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Empty Hint Watermark */}
      {strokes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <p
            className={`text-xs font-medium text-center tracking-wide ${
              isLightSurface ? 'text-slate-400/80' : 'text-white/30'
            }`}
          >
            {isReadOnly
              ? 'Chalkboard is locked in Kiosk Mode'
              : 'Sketch with finger, mouse, or stylus...'}
          </p>
        </div>
      )}

      {/* Interactive Normalized Sketch Stage */}
      <div
        ref={stageRef}
        data-no-drag="true"
        data-no-canvas-swipe="true"
        className="relative flex-1 min-h-0 w-full touch-none"
      >
        <canvas
          ref={canvasRef}
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={(e) => {
            e.stopPropagation();
            finishActiveStroke(e.pointerId);
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            finishActiveStroke(e.pointerId);
          }}
          className={`block w-full h-full touch-none ${
            isReadOnly ? 'cursor-default' : 'cursor-crosshair'
          }`}
        />
      </div>

      {/* Collapsible Chalk & Tool Tray */}
      {isTrayOpen && !isReadOnly && (
        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          className={`relative z-10 mx-2.5 mb-2.5 px-2.5 py-2 rounded-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-2 shrink-0 ${pillChromeClass}`}
        >
          {/* Color Swatches */}
          <div className="flex items-center gap-1">
            {CHALK_COLOR_PALETTE.map((swatch) => {
              const selected = activeTool !== 'eraser' && activeColor === swatch.hex;
              return (
                <button
                  key={swatch.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveColor(swatch.hex);
                    if (activeTool === 'eraser') {
                      setActiveTool(defaultTool);
                    }
                  }}
                  title={isCursorHidden ? undefined : swatch.label}
                  aria-label={swatch.label}
                  style={{ backgroundColor: swatch.hex }}
                  className={`w-4 h-4 rounded-full transition-transform cursor-pointer border ${
                    swatch.id === 'white' ? 'border-slate-400/70' : 'border-black/20'
                  } ${
                    selected
                      ? 'scale-125 ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900'
                      : 'opacity-85 hover:opacity-100 hover:scale-110'
                  }`}
                />
              );
            })}
          </div>

          {/* Tools, Sizes & Actions */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTool('chalk');
              }}
              title={isCursorHidden ? undefined : 'Soft chalk'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTool === 'chalk'
                  ? 'bg-cyan-500/25 text-cyan-400'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTool('marker');
              }}
              title={isCursorHidden ? undefined : 'Smooth ink marker'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTool === 'marker'
                  ? 'bg-cyan-500/25 text-cyan-400'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTool('eraser');
              }}
              title={isCursorHidden ? undefined : 'Eraser'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTool === 'eraser'
                  ? 'bg-rose-500/25 text-rose-400'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-current opacity-15 mx-0.5" />

            {SIZE_DOTS.map((sz) => (
              <button
                key={sz.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSize(sz.id);
                }}
                title={isCursorHidden ? undefined : `${sz.label} brush`}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  activeSize === sz.id
                    ? 'bg-cyan-500/25 text-cyan-400'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <span className={`rounded-full bg-current ${sz.dotClass}`} />
              </button>
            ))}

            <div className="h-4 w-px bg-current opacity-15 mx-0.5" />

            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              title={isCursorHidden ? undefined : 'Undo last stroke'}
              className="p-1.5 rounded-lg opacity-80 hover:opacity-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={strokes.length === 0}
              title={isCursorHidden ? undefined : 'Clear board'}
              className={`px-1.5 py-1 rounded-lg flex items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                confirmClearArmed
                  ? 'bg-rose-500 text-white'
                  : 'text-rose-400 hover:bg-rose-500/15'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmClearArmed && <span>Clear?</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
