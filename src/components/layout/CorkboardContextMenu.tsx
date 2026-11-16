import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  Calendar,
  CheckSquare,
  Copy,
  Edit2,
  Image as ImageIcon,
  Layers,
  Moon,
  Pin,
  Plus,
  SendToBack,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { DashboardWidget, StickyNoteItem, WidgetThemeMode } from '../../types/dashboard';
import { isStickerCapableWidget, isWidgetStickerMode } from '../../utils/widgetStickerMode';

export interface CorkboardContextMenuState {
  x: number;
  y: number;
  id: string;
  type: 'widget' | 'note' | 'canvas';
  title?: string;
  currentZ: number;
  isBackground?: boolean;
  rotation?: number;
  clickXRatio?: number;
  clickYRatio?: number;
}

export interface CorkboardContextMenuProps {
  contextMenu: CorkboardContextMenuState;
  widgets: DashboardWidget[];
  notes: StickyNoteItem[];
  hasStickyNotesTile: boolean;
  defaultWidgetStyle: 'auto' | 'sticker' | 'bordered';
  onClose: () => void;
  onOpenNoteAtSpot?: (clickXRatio?: number, clickYRatio?: number, isShoppingList?: boolean) => void;
  onAddWidget?: (widget: Partial<DashboardWidget>) => void;
  onOpenAddWidget?: () => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  onUpdateWidgetPos?: (widgetId: string, gridPos: any, freeformPos: NonNullable<DashboardWidget['freeformPos']>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onDeleteNote: (noteId: string) => void;
  onEditWidget: (widget: DashboardWidget) => void;
  onEditNote: (note: StickyNoteItem) => void;
  onDuplicateNote: (noteId: string, mode: 'plus1d' | 'plus3d' | 'plus1w' | 'same' | 'edit') => void;
  onBringToFront: (id: string, type: 'widget' | 'note') => void;
  onBringForward: (id: string, type: 'widget' | 'note') => void;
  onSendBackward: (id: string, type: 'widget' | 'note') => void;
  onSendToBack: (id: string, type: 'widget' | 'note') => void;
  getNextZIndex: () => number;
  onUpdateRotation: (deg: number) => void;
}

export const CorkboardContextMenu: React.FC<CorkboardContextMenuProps> = ({
  contextMenu,
  widgets,
  notes,
  hasStickyNotesTile,
  defaultWidgetStyle,
  onClose,
  onOpenNoteAtSpot,
  onAddWidget,
  onOpenAddWidget,
  onUpdateWidget,
  onUpdateWidgetPos,
  onUpdateNote,
  onUpdateNotePos,
  onRemoveWidget,
  onDeleteNote,
  onEditWidget,
  onEditNote,
  onDuplicateNote,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  getNextZIndex,
  onUpdateRotation,
}) => {
  if (contextMenu.type === 'canvas') {
    return (
      <div
        data-no-drag="true"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          left: Math.min(contextMenu.x, window.innerWidth - 250),
          top: Math.min(contextMenu.y, window.innerHeight - 240),
        }}
        className="fixed z-[100] w-60 rounded-2xl bg-gray-950/95 backdrop-blur-2xl border border-gray-800 p-2 shadow-2xl text-xs text-gray-200 select-none animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Header */}
        <div className="px-2.5 py-1.5 mb-1 border-b border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-bold text-white truncate text-[11px]">
              {contextMenu.title || 'Canvas Actions'}
            </span>
          </div>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
            Canvas
          </span>
        </div>

        <div className="space-y-0.5">
          {onOpenNoteAtSpot && (
            <button
              type="button"
              onClick={() => {
                onOpenNoteAtSpot(contextMenu.clickXRatio, contextMenu.clickYRatio, false);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
            >
              <Pin className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-xs">Add Sticky Note</div>
                <div className="text-[10px] text-gray-400">Pin a note or checklist here</div>
              </div>
            </button>
          )}

          {onOpenNoteAtSpot && (
            <button
              type="button"
              onClick={() => {
                onOpenNoteAtSpot(contextMenu.clickXRatio, contextMenu.clickYRatio, true);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
            >
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-xs">Add Shopping List Note</div>
                <div className="text-[10px] text-gray-400">Grouped grocery note & Keep export</div>
              </div>
            </button>
          )}

          {onAddWidget && (
            <button
              type="button"
              onClick={() => {
                const wRatio = 0.26;
                const hRatio = 0.32;
                const xRatio =
                  contextMenu.clickXRatio !== undefined
                    ? Math.max(0.01, Math.min(1 - wRatio - 0.01, contextMenu.clickXRatio))
                    : 0.15;
                const yRatio =
                  contextMenu.clickYRatio !== undefined
                    ? Math.max(0.01, Math.min(1 - hRatio - 0.01, contextMenu.clickYRatio))
                    : 0.15;
                onAddWidget({
                  type: 'image',
                  title: 'Single Image or GIF',
                  gridPos: { x: 0, y: 0, w: 4, h: 4 },
                  freeformPos: {
                    xRatio,
                    yRatio,
                    wRatio,
                    hRatio,
                    zIndex: getNextZIndex(),
                    rotation: 0,
                  },
                  config: { fit: 'contain' },
                });
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
            >
              <ImageIcon className="w-4 h-4 text-fuchsia-400 shrink-0" />
              <div>
                <div className="font-semibold text-xs">Add Single Photo / GIF</div>
                <div className="text-[10px] text-gray-400">Pin a photo or animated GIF sticker</div>
              </div>
            </button>
          )}

          {onOpenAddWidget && (
            <button
              type="button"
              onClick={() => {
                onOpenAddWidget();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
            >
              <Plus className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="font-semibold text-xs">Add Widget</div>
                <div className="text-[10px] text-gray-400">Add a live tile or GIF sticker</div>
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeWidget = contextMenu.type === 'widget' ? widgets.find((x) => x.id === contextMenu.id) : null;
  const currentThemeMode: WidgetThemeMode = (activeWidget?.config?.themeMode as WidgetThemeMode) || 'auto';
  const itemType = contextMenu.type === 'widget' ? 'widget' : 'note';

  return (
    <div
      data-no-drag="true"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: Math.min(contextMenu.x, window.innerWidth - 250),
        top: Math.min(contextMenu.y, window.innerHeight - 360),
      }}
      className="fixed z-[100] w-60 rounded-2xl bg-gray-950/95 backdrop-blur-2xl border border-gray-800 p-2 shadow-2xl text-xs text-gray-200 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 mb-1 border-b border-gray-800/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="font-bold text-white truncate text-[11px]">
            {contextMenu.title || (contextMenu.type === 'widget' ? 'Widget' : 'Sticky Note')}
          </span>
        </div>
        {contextMenu.isBackground ? (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Background
          </span>
        ) : (
          <span className="text-[10px] font-mono text-gray-400">
            L{contextMenu.currentZ}
          </span>
        )}
      </div>

      {/* Layer Order Actions */}
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => onBringToFront(contextMenu.id, itemType)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
        >
          <BringToFront className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="font-semibold text-xs">Bring to Front</div>
            <div className="text-[10px] text-gray-400">Place on top of all cards</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onBringForward(contextMenu.id, itemType)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
        >
          <ArrowUp className="w-4 h-4 text-blue-400 shrink-0" />
          <div>
            <div className="font-semibold text-xs">Bring Forward</div>
            <div className="text-[10px] text-gray-400">Step up 1 layer</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSendBackward(contextMenu.id, itemType)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
        >
          <ArrowDown className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="font-semibold text-xs">Send Backward</div>
            <div className="text-[10px] text-gray-400">Step down 1 layer</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSendToBack(contextMenu.id, itemType)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-200 hover:text-white transition-colors cursor-pointer text-left"
        >
          <SendToBack className="w-4 h-4 text-purple-400 shrink-0" />
          <div>
            <div className="font-semibold text-xs">Send to Back</div>
            <div className="text-[10px] text-gray-400">Pin as background layer</div>
          </div>
        </button>
      </div>

      {/* Context Options Divider */}
      <div className="border-t border-gray-800/80 my-1" />

      {/* Quick Context Settings */}
      {contextMenu.type === 'widget' && (
        <div className="space-y-1.5 my-1">
          <div className="px-2 pt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>Card Appearance</span>
            <span className="capitalize text-blue-400 font-bold">{currentThemeMode}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 px-1">
            {(['auto', 'light', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (onUpdateWidget && activeWidget) {
                    onUpdateWidget(activeWidget.id, {
                      config: { ...activeWidget.config, themeMode: mode },
                    });
                  }
                  onClose();
                }}
                className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                  currentThemeMode === mode
                    ? 'bg-blue-600 text-white font-semibold shadow'
                    : 'bg-gray-800/70 hover:bg-gray-700/80 text-gray-300'
                }`}
              >
                {mode === 'light' && <Sun className="w-3 h-3 text-amber-300" />}
                {mode === 'dark' && <Moon className="w-3 h-3 text-indigo-300" />}
                <span>{mode}</span>
              </button>
            ))}
          </div>

          {activeWidget && isStickerCapableWidget(activeWidget.type) && onUpdateWidget && (
            <button
              type="button"
              onClick={() => {
                const isCurrentlySticker = isWidgetStickerMode(activeWidget, defaultWidgetStyle);
                const next = !isCurrentlySticker;
                if (activeWidget.type === 'textbox') {
                  onUpdateWidget(activeWidget.id, {
                    config: {
                      ...activeWidget.config,
                      transparentBg: next,
                      bgStyle: next
                        ? 'transparent'
                        : activeWidget.config?.bgStyle && activeWidget.config.bgStyle !== 'transparent'
                        ? activeWidget.config.bgStyle
                        : 'glass',
                    },
                  });
                } else {
                  onUpdateWidget(activeWidget.id, {
                    config: { ...activeWidget.config, transparentBg: next },
                  });
                }
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                <span>{activeWidget.type === 'image' ? 'Sticker / Transparent' : 'Sticker / No Outline'}</span>
              </div>
              {(() => {
                const isStickerOn = isWidgetStickerMode(activeWidget, defaultWidgetStyle);
                return (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isStickerOn
                        ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {isStickerOn ? 'ON' : 'OFF'}
                  </span>
                );
              })()}
            </button>
          )}

          {activeWidget?.type === 'photo_frame' && onUpdateWidget && (
            <button
              type="button"
              onClick={() => {
                const next = !(activeWidget.config?.showDateTaken ?? false);
                onUpdateWidget(activeWidget.id, {
                  config: { ...activeWidget.config, showDateTaken: next },
                });
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Date Taken</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                activeWidget.config?.showDateTaken
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {activeWidget.config?.showDateTaken ? 'ON' : 'OFF'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (activeWidget) onEditWidget(activeWidget);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
          >
            <Settings className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Tile Settings</span>
          </button>
        </div>
      )}

      {((contextMenu.type === 'widget' && onUpdateWidgetPos) ||
        contextMenu.type === 'note') && (
        <div className="space-y-1.5 my-1">
          <div className="px-2 pt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>Tilt / Rotation</span>
            <span className="font-mono text-blue-400 font-bold">
              {contextMenu.rotation ?? 0}°
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 px-1">
            {([-6, -3, 0, 3, 6] as const).map((deg) => {
              const isCurrent = (contextMenu.rotation ?? 0) === deg;
              return (
                <button
                  key={deg}
                  type="button"
                  onClick={() => {
                    if (contextMenu.type === 'widget' && onUpdateWidgetPos) {
                      const w = widgets.find((x) => x.id === contextMenu.id);
                      const basePos = w?.freeformPos || {
                        xRatio: 0.1,
                        yRatio: 0.1,
                        wRatio: 0.35,
                        hRatio: 0.45,
                        zIndex: contextMenu.currentZ || 1,
                        rotation: 0,
                      };
                      onUpdateWidgetPos(contextMenu.id, w?.gridPos, {
                        ...basePos,
                        rotation: deg,
                      });
                    } else if (contextMenu.type === 'note') {
                      const n = notes.find((x) => x.id === contextMenu.id);
                      const basePos = n?.freeformPos || {
                        xRatio: 0.1,
                        yRatio: 0.1,
                        wRatio: 0.26,
                        hRatio: 0.3,
                        zIndex: contextMenu.currentZ || 1,
                        rotation: 0,
                      };
                      onUpdateNotePos(contextMenu.id, {
                        ...basePos,
                        rotation: deg,
                      });
                    }
                    onUpdateRotation(deg);
                  }}
                  className={`py-1 px-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-800/70 hover:bg-gray-700/80 text-gray-300'
                  }`}
                >
                  {deg > 0 ? `+${deg}°` : `${deg}°`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {contextMenu.type === 'note' && (() => {
        const activeNote = notes.find((x) => x.id === contextMenu.id);
        const hasExpiry = Boolean(activeNote?.expiresAt);
        return (
          <>
            <button
              type="button"
              onClick={() => {
                if (activeNote) {
                  onEditNote(activeNote);
                }
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>Edit Note</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onDuplicateNote(contextMenu.id, 'plus1d');
                onClose();
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl hover:bg-gray-800/80 text-gray-300 hover:text-white transition-colors cursor-pointer text-left"
              title={
                hasExpiry
                  ? 'Duplicate note and increment expiration date by +1 day'
                  : 'Duplicate note'
              }
            >
              <div className="flex items-center gap-2.5">
                <Copy className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Duplicate Note</span>
              </div>
              {hasExpiry && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  +1d
                </span>
              )}
            </button>

            {hasExpiry && (
              <div className="px-2 pb-1 pt-0.5 flex flex-col gap-1">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold px-0.5">
                  Duplicate Time Shift
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { mode: 'plus1d', label: '+1d', title: 'Increment by 1 day' },
                      { mode: 'plus1w', label: '+1w', title: 'Increment by 1 week' },
                      { mode: 'same', label: 'Same', title: 'Keep exact same date/time' },
                      { mode: 'edit', label: 'Edit', title: 'Open note modal with +1d to customize' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.mode}
                      type="button"
                      title={opt.title}
                      onClick={() => {
                        onDuplicateNote(contextMenu.id, opt.mode);
                        onClose();
                      }}
                      className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer text-center border ${
                        opt.mode === 'plus1d'
                          ? 'bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border-blue-500/40'
                          : 'bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border-gray-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {contextMenu.type === 'note' && hasStickyNotesTile ? (
        <>
          <button
            type="button"
            onClick={() => {
              onUpdateNote(contextMenu.id, { isPinnedToCanvas: false });
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-amber-500/15 text-amber-300 hover:text-amber-200 transition-colors cursor-pointer text-left"
          >
            <X className="w-3.5 h-3.5 shrink-0" />
            <span>Close from Canvas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onDeleteNote(contextMenu.id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-red-500/15 text-red-400 hover:text-red-300 transition-colors cursor-pointer text-left"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete Note</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (contextMenu.type === 'widget' && onRemoveWidget) {
              onRemoveWidget(contextMenu.id);
            } else if (contextMenu.type === 'note') {
              onDeleteNote(contextMenu.id);
            }
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-red-500/15 text-red-400 hover:text-red-300 transition-colors cursor-pointer text-left"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>{contextMenu.type === 'note' ? 'Delete Note' : 'Remove from Canvas'}</span>
        </button>
      )}
    </div>
  );
};
