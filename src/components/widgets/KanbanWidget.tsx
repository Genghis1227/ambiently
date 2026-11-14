import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { useKanbanStore } from '../../stores/useKanbanStore';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  KANBAN_COLUMNS,
  resolveWidgetActiveBoardId,
  type KanbanCard,
  type KanbanColumnId,
  type KanbanWidgetConfig,
} from '../../types/kanban';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { KanbanBoardSelectorPill } from '../kanban/KanbanBoardSelectorPill';
import { KanbanCardItem } from '../kanban/KanbanCardItem';
import { KanbanInlineAdd } from '../kanban/KanbanInlineAdd';
import { KanbanCardModal } from '../kanban/KanbanCardModal';
import { KanbanBoardModal } from '../kanban/KanbanBoardModal';
import { KanbanArchiveDrawer } from '../kanban/KanbanArchiveDrawer';
import { KanbanConfirmDialog } from '../kanban/KanbanConfirmDialog';
import { KanbanBoardView } from '../kanban/KanbanBoardView';
import { useKanbanPointerDnD } from '../kanban/useKanbanPointerDnD';

export interface KanbanWidgetProps {
  widgetId: string;
  title?: string;
  config?: Partial<KanbanWidgetConfig>;
  isLight?: boolean;
  variant?: 'tile' | 'view';
  onUpdateConfig?: (updates: Partial<KanbanWidgetConfig>) => void;
  onOpenFullScreen?: () => void;
}

export const KanbanWidget: React.FC<KanbanWidgetProps> = ({
  widgetId,
  config,
  isLight = false,
  onUpdateConfig,
  onOpenFullScreen,
}) => {
  const boards = useKanbanStore((s) => s.boards);
  const cards = useKanbanStore((s) => s.cards);
  const addCard = useKanbanStore((s) => s.addCard);
  const moveCard = useKanbanStore((s) => s.moveCard);
  const stepCardColumn = useKanbanStore((s) => s.stepCardColumn);
  const archiveAllDone = useKanbanStore((s) => s.archiveAllDone);
  const clearDoneCards = useKanbanStore((s) => s.clearDoneCards);

  const dashboardSettings = useDashboardStore((s) => s.settings);
  const isNightMode =
    Boolean(dashboardSettings?.nightModeEnabled) ||
    isAmbientlyInNightMode(dashboardSettings);

  const [localBoardId, setLocalBoardId] = useState<string>(() =>
    resolveWidgetActiveBoardId(config, boards)
  );
  const [localColumnId, setLocalColumnId] = useState<KanbanColumnId>(
    () => config?.activeColumnId || 'in_progress'
  );

  // Sync downward only when an explicit external config change occurs
  useEffect(() => {
    if (config?.activeBoardId) {
      setLocalBoardId(config.activeBoardId);
    }
  }, [config?.activeBoardId]);

  useEffect(() => {
    if (config?.activeColumnId) {
      setLocalColumnId(config.activeColumnId);
    }
  }, [config?.activeColumnId]);

  const effectiveBoardId = useMemo(
    () =>
      resolveWidgetActiveBoardId(
        { activeBoardId: config?.activeBoardId || localBoardId },
        boards
      ),
    [config?.activeBoardId, localBoardId, boards]
  );

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === effectiveBoardId),
    [boards, effectiveBoardId]
  );

  const activeColIndex = useMemo(() => {
    const idx = KANBAN_COLUMNS.findIndex((c) => c.id === localColumnId);
    return idx >= 0 ? idx : 1; // Default In Progress
  }, [localColumnId]);

  const activeColIndexRef = useRef(activeColIndex);
  useEffect(() => {
    activeColIndexRef.current = activeColIndex;
  }, [activeColIndex]);

  const persistWidgetSelection = useCallback(
    (nextBoardId: string, nextColumnId: KanbanColumnId) => {
      onUpdateConfig?.({
        widgetInstanceId: widgetId,
        activeBoardId: nextBoardId,
        activeColumnId: nextColumnId,
      });
    },
    [onUpdateConfig, widgetId]
  );

  const handleSelectBoard = useCallback(
    (nextBoardId: string) => {
      setLocalBoardId(nextBoardId);
      persistWidgetSelection(nextBoardId, localColumnId);
    },
    [localColumnId, persistWidgetSelection]
  );

  const setColumnView = useCallback(
    (nextCol: KanbanColumnId) => {
      setLocalColumnId(nextCol);
      persistWidgetSelection(effectiveBoardId, nextCol);
    },
    [effectiveBoardId, persistWidgetSelection]
  );

  const stepColumnView = useCallback(
    (direction: 'left' | 'right') => {
      const currentIdx = activeColIndexRef.current;
      const nextIdx =
        direction === 'left'
          ? Math.max(0, currentIdx - 1)
          : Math.min(KANBAN_COLUMNS.length - 1, currentIdx + 1);
      if (nextIdx === currentIdx) return;
      const nextCol = KANBAN_COLUMNS[nextIdx].id;
      setLocalColumnId(nextCol);
      persistWidgetSelection(effectiveBoardId, nextCol);
    },
    [effectiveBoardId, persistWidgetSelection]
  );

  // Sub-modals & drawer state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [boardModalState, setBoardModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    boardId?: string;
  }>({ open: false, mode: 'create' });
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [confirmClearDoneOpen, setConfirmClearDoneOpen] = useState(false);
  const [isFullViewOpen, setIsFullViewOpen] = useState(false);

  const tileRootRef = useRef<HTMLDivElement>(null);

  const activeColumnMeta = KANBAN_COLUMNS[activeColIndex];
  const prevColumnMeta = activeColIndex > 0 ? KANBAN_COLUMNS[activeColIndex - 1] : null;
  const nextColumnMeta =
    activeColIndex < KANBAN_COLUMNS.length - 1
      ? KANBAN_COLUMNS[activeColIndex + 1]
      : null;

  const {
    dragState,
    activeEdge,
    getCardDragProps,
    getHandleDragProps,
    shouldSuppressClick,
    DragGhostPortal,
  } = useKanbanPointerDnD({
    rootRef: tileRootRef,
    activeColumnFallback: activeColumnMeta.id,
    onDropCard: (cardId, targetColumnId, targetIndex) => {
      void moveCard(cardId, targetColumnId, targetIndex);
    },
    edgeSwitch: {
      enabled: true,
      containerRef: tileRootRef,
      canStepLeft: Boolean(prevColumnMeta),
      canStepRight: Boolean(nextColumnMeta),
      onStepDirection: stepColumnView,
      dwellMs: 350,
    },
    isLight,
    isNightMode,
  });

  const { columnsMap, archivedCount } = useMemo(() => {
    const map: Record<KanbanColumnId, KanbanCard[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    let archived = 0;
    for (const c of cards) {
      if (c.boardId !== effectiveBoardId) continue;
      if (c.isArchived) {
        archived += 1;
        continue;
      }
      map[c.columnId].push(c);
    }
    const sorter = (a: KanbanCard, b: KanbanCard) =>
      a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
    map.todo.sort(sorter);
    map.in_progress.sort(sorter);
    map.done.sort(sorter);
    return { columnsMap: map, archivedCount: archived };
  }, [cards, effectiveBoardId]);

  const activeColCards = columnsMap[activeColumnMeta.id];
  const doneCount = columnsMap.done.length;

  const nonDraggedCards = dragState
    ? activeColCards.filter((c) => c.id !== dragState.card.id)
    : activeColCards;

  const isHoveringActiveCol =
    Boolean(dragState) && dragState?.hoverColumnId === activeColumnMeta.id;
  const insertionSlot = isHoveringActiveCol
    ? Math.max(0, Math.min(nonDraggedCards.length, dragState!.dropIndex))
    : -1;

  const surfaceTextClass = isLight ? 'text-slate-800' : 'text-slate-100';
  const mutedTextClass = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div
      ref={tileRootRef}
      className={`relative w-full h-full flex flex-col overflow-hidden select-none ${surfaceTextClass}`}
    >
      {/* Top Board Bar */}
      <div
        className={`flex items-center justify-between gap-1.5 px-3 pt-2.5 pb-2 border-b shrink-0 ${
          isLight ? 'border-slate-200/75' : 'border-slate-800/70'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <KanbanBoardSelectorPill
            boards={boards}
            activeBoard={activeBoard}
            isLight={isLight}
            isNightMode={isNightMode}
            compact
            onSelectBoard={handleSelectBoard}
            onCreateBoard={() =>
              setBoardModalState({ open: true, mode: 'create' })
            }
            onEditBoard={(id) =>
              setBoardModalState({ open: true, mode: 'edit', boardId: id })
            }
          />
        </div>

        <div
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1 shrink-0"
        >
          {effectiveBoardId && (
            <button
              type="button"
              onClick={() => setIsArchiveOpen(true)}
              title={`Archived cards (${archivedCount})`}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200/90 text-slate-600'
                  : isNightMode
                  ? 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800 text-slate-400'
                  : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-700/60 text-slate-300'
              }`}
            >
              <Archive className="w-3 h-3 text-[#8b7fa8]" />
              <span>Archived ({archivedCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (onOpenFullScreen) {
                onOpenFullScreen();
              } else {
                setIsFullViewOpen(true);
              }
            }}
            title="Expand Full 3-Column Kanban View"
            aria-label="Expand Full Kanban View"
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200/90 text-slate-600'
                : isNightMode
                ? 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800 text-slate-400'
                : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-700/60 text-slate-300'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Column Stepper Bar */}
      <div
        data-no-drag="true"
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b shrink-0 ${
          isLight
            ? 'border-slate-200/60 bg-slate-100/45'
            : isNightMode
            ? 'border-slate-800/60 bg-slate-950/40'
            : 'border-slate-800/60 bg-slate-950/35'
        }`}
      >
        <div className="flex-1 flex justify-start min-w-0">
          {prevColumnMeta ? (
            <button
              type="button"
              onClick={() => setColumnView(prevColumnMeta.id)}
              className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer truncate ${
                isLight
                  ? 'text-slate-600 hover:bg-slate-200/75 hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800/75 hover:text-slate-100'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{prevColumnMeta.shortLabel}</span>
              <span className={`ml-0.5 text-[10px] ${mutedTextClass}`}>
                ({columnsMap[prevColumnMeta.id].length})
              </span>
            </button>
          ) : (
            <span className="w-6" aria-hidden="true" />
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold tracking-wide">
            {activeColumnMeta.label}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              isLight
                ? 'bg-slate-200/80 text-slate-700'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {activeColCards.length}
          </span>
        </div>

        <div className="flex-1 flex justify-end min-w-0">
          {nextColumnMeta ? (
            <button
              type="button"
              onClick={() => setColumnView(nextColumnMeta.id)}
              className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer truncate ${
                isLight
                  ? 'text-slate-600 hover:bg-slate-200/75 hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800/75 hover:text-slate-100'
              }`}
            >
              <span className="truncate">{nextColumnMeta.shortLabel}</span>
              <span className={`ml-0.5 text-[10px] ${mutedTextClass}`}>
                ({columnsMap[nextColumnMeta.id].length})
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <span className="w-6" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Done Column Controls inside Compact View */}
      {activeColumnMeta.id === 'done' && activeColCards.length > 0 && (
        <div
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b shrink-0 ${
            isLight
              ? 'border-slate-200/60 bg-slate-100/50'
              : 'border-slate-800/50 bg-slate-950/30'
          }`}
        >
          <button
            type="button"
            onClick={() => activeBoard && void archiveAllDone(activeBoard.id)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-white/80 hover:bg-slate-100 border-slate-200 text-slate-700'
                : 'bg-slate-900/70 hover:bg-slate-800 border-slate-700/60 text-slate-300'
            }`}
          >
            <ArchiveRestore className="w-3 h-3 text-[#8b7fa8]" />
            <span>Archive All Done</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmClearDoneOpen(true)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-[#b5838d]/15 hover:bg-[#b5838d]/25 border-[#b5838d]/40 text-[#8a4d59]'
                : 'bg-[#b5838d]/15 hover:bg-[#b5838d]/25 border-[#b5838d]/35 text-[#d9a8b2]'
            }`}
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear Done</span>
          </button>
        </div>
      )}

      {/* Inline Quick-Add */}
      {activeBoard && (
        <div className="px-2.5 pt-2 pb-1 shrink-0">
          <KanbanInlineAdd
            placeholder={`+ Add card to ${activeColumnMeta.label}...`}
            isLight={isLight}
            isNightMode={isNightMode}
            onAdd={(cardTitle) =>
              addCard({
                boardId: activeBoard.id,
                columnId: activeColumnMeta.id,
                title: cardTitle,
              })
            }
          />
        </div>
      )}

      {/* Single Active Column Scrollable Drop Zone */}
      <div
        data-kanban-column={activeColumnMeta.id}
        data-no-drag="true"
        className="relative flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-2">
          {!activeBoard ? (
            <div className={`py-8 text-center text-xs ${mutedTextClass}`}>
              Create a Kanban board to get started.
            </div>
          ) : activeColCards.length === 0 ? (
            <div
              className={`h-24 rounded-xl border border-dashed flex items-center justify-center text-[11px] px-4 text-center ${
                isLight
                  ? 'border-slate-300/75 text-slate-400'
                  : 'border-slate-800 text-slate-500'
              }`}
            >
              No cards in {activeColumnMeta.label}. Type above and press Enter.
            </div>
          ) : (
            activeColCards.map((card) => {
              const isSelfDragged = dragState?.card.id === card.id;
              const nonDragIdx = nonDraggedCards.findIndex((c) => c.id === card.id);
              const showIndicatorBefore =
                !isSelfDragged &&
                isHoveringActiveCol &&
                insertionSlot === nonDragIdx;

              return (
                <React.Fragment key={card.id}>
                  {showIndicatorBefore && (
                    <div
                      className={`h-1 rounded-full mx-1 ${
                        isNightMode ? 'bg-slate-600/70' : 'bg-[#648296]/75'
                      }`}
                    />
                  )}
                  <KanbanCardItem
                    card={card}
                    isLight={isLight}
                    isNightMode={isNightMode}
                    isDragging={isSelfDragged}
                    canStepLeft={activeColIndex > 0}
                    canStepRight={activeColIndex < KANBAN_COLUMNS.length - 1}
                    onOpenCard={(c) => setEditingCardId(c.id)}
                    onStepLeft={(id) => void stepCardColumn(id, 'left')}
                    onStepRight={(id) => void stepCardColumn(id, 'right')}
                    cardDragProps={getCardDragProps(card)}
                    handleDragProps={getHandleDragProps(card)}
                    shouldSuppressClick={shouldSuppressClick}
                  />
                </React.Fragment>
              );
            })
          )}

          {isHoveringActiveCol && insertionSlot >= nonDraggedCards.length && (
            <div
              className={`h-1 rounded-full mx-1 ${
                isNightMode ? 'bg-slate-600/70' : 'bg-[#648296]/75'
              }`}
            />
          )}
        </div>

        {/* Left Edge Auto-Switch Visual Feedback during Drag */}
        {dragState && prevColumnMeta && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-2 left-0 w-9 rounded-r-xl border-y border-r flex items-center justify-center transition-opacity ${
              activeEdge === 'left'
                ? isNightMode
                  ? 'opacity-100 bg-slate-800/70 border-slate-500/70 text-slate-200'
                  : 'opacity-100 bg-[#648296]/20 border-[#648296]/55 text-[#648296]'
                : isNightMode
                ? 'opacity-45 bg-slate-900/30 border-slate-700/40 text-slate-500'
                : 'opacity-55 bg-slate-500/5 border-slate-400/25 text-slate-400'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </div>
        )}

        {/* Right Edge Auto-Switch Visual Feedback during Drag */}
        {dragState && nextColumnMeta && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-2 right-0 w-9 rounded-l-xl border-y border-l flex items-center justify-center transition-opacity ${
              activeEdge === 'right'
                ? isNightMode
                  ? 'opacity-100 bg-slate-800/70 border-slate-500/70 text-slate-200'
                  : 'opacity-100 bg-[#648296]/20 border-[#648296]/55 text-[#648296]'
                : isNightMode
                ? 'opacity-45 bg-slate-900/30 border-slate-700/40 text-slate-500'
                : 'opacity-55 bg-slate-500/5 border-slate-400/25 text-slate-400'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Sub-Modals, Drawers & Full-Screen Overlay View */}
      <KanbanCardModal
        cardId={editingCardId}
        onClose={() => setEditingCardId(null)}
      />

      <KanbanBoardModal
        isOpen={boardModalState.open}
        mode={boardModalState.mode}
        boardId={boardModalState.boardId}
        onClose={() => setBoardModalState({ open: false, mode: 'create' })}
        onBoardCreated={(newBoardId) => handleSelectBoard(newBoardId)}
        onBoardDeleted={(deletedId) => {
          if (effectiveBoardId === deletedId) {
            const remaining = boards.filter((b) => b.id !== deletedId);
            if (remaining[0]) {
              handleSelectBoard(remaining[0].id);
            }
          }
        }}
      />

      {activeBoard && (
        <KanbanArchiveDrawer
          isOpen={isArchiveOpen}
          boardId={activeBoard.id}
          boardName={activeBoard.name}
          onClose={() => setIsArchiveOpen(false)}
        />
      )}

      {activeBoard && (
        <KanbanConfirmDialog
          isOpen={confirmClearDoneOpen}
          title="Clear Done Column"
          message={`Permanently delete ${doneCount} completed card${
            doneCount === 1 ? '' : 's'
          } from Done? This cannot be undone.`}
          confirmLabel="Clear Done"
          onCancel={() => setConfirmClearDoneOpen(false)}
          onConfirm={async () => {
            setConfirmClearDoneOpen(false);
            await clearDoneCards(activeBoard.id);
          }}
        />
      )}

      <KanbanBoardView
        isOpen={isFullViewOpen}
        onClose={() => setIsFullViewOpen(false)}
        mode="overlay"
        widgetId={widgetId}
        config={{
          widgetInstanceId: widgetId,
          activeBoardId: effectiveBoardId,
          activeColumnId: localColumnId,
        }}
        isLight={isLight}
        onUpdateConfig={(updates) => {
          if (updates.activeBoardId) {
            setLocalBoardId(updates.activeBoardId);
          }
          onUpdateConfig?.(updates);
        }}
      />

      {DragGhostPortal}
    </div>
  );
};
