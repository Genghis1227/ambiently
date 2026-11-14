import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  Minimize2,
  Settings,
  Trash2,
  X,
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
import { KanbanBoardSelectorPill } from './KanbanBoardSelectorPill';
import { KanbanCardItem } from './KanbanCardItem';
import { KanbanInlineAdd } from './KanbanInlineAdd';
import { KanbanCardModal } from './KanbanCardModal';
import { KanbanBoardModal } from './KanbanBoardModal';
import { KanbanArchiveDrawer } from './KanbanArchiveDrawer';
import { KanbanConfirmDialog } from './KanbanConfirmDialog';
import { useKanbanPointerDnD } from './useKanbanPointerDnD';

export interface KanbanBoardViewProps {
  isOpen: boolean;
  onClose?: () => void;
  variant?: 'view';
  mode?: 'overlay' | 'canvas';
  widgetId?: string;
  title?: string;
  config?: Partial<KanbanWidgetConfig>;
  isLight?: boolean;
  dockPaddingClass?: string;
  onUpdateConfig?: (updates: Partial<KanbanWidgetConfig>) => void;
  onOpenWidgetSettings?: () => void;
}

export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  isOpen,
  onClose,
  mode = 'overlay',
  widgetId = 'kanban-view',
  config,
  isLight = false,
  dockPaddingClass = '',
  onUpdateConfig,
  onOpenWidgetSettings,
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

  useEffect(() => {
    if (config?.activeBoardId) {
      setLocalBoardId(config.activeBoardId);
    }
  }, [config?.activeBoardId]);

  const effectiveBoardId = useMemo(() => {
    return resolveWidgetActiveBoardId(
      { activeBoardId: config?.activeBoardId || localBoardId },
      boards
    );
  }, [config?.activeBoardId, localBoardId, boards]);

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === effectiveBoardId),
    [boards, effectiveBoardId]
  );

  const handleSelectBoard = (nextBoardId: string) => {
    setLocalBoardId(nextBoardId);
    onUpdateConfig?.({
      widgetInstanceId: widgetId,
      activeBoardId: nextBoardId,
    });
  };

  // Sub-modals state
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [boardModalState, setBoardModalState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    boardId?: string;
  }>({ open: false, mode: 'create' });
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [confirmClearDoneOpen, setConfirmClearDoneOpen] = useState(false);

  const boardRootRef = useRef<HTMLDivElement>(null);

  const {
    dragState,
    getCardDragProps,
    getHandleDragProps,
    shouldSuppressClick,
    DragGhostPortal,
  } = useKanbanPointerDnD({
    rootRef: boardRootRef,
    activeColumnFallback: 'in_progress',
    onDropCard: (cardId, targetColumnId, targetIndex) => {
      void moveCard(cardId, targetColumnId, targetIndex);
    },
    isLight,
    isNightMode,
  });

  useEffect(() => {
    if (!isOpen || mode !== 'overlay' || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !editingCardId &&
        !boardModalState.open &&
        !isArchiveOpen &&
        !confirmClearDoneOpen
      ) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isOpen,
    mode,
    onClose,
    editingCardId,
    boardModalState.open,
    isArchiveOpen,
    confirmClearDoneOpen,
  ]);

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

  if (!isOpen) return null;

  const doneCount = columnsMap.done.length;

  const containerSurfaceClass = isLight
    ? isNightMode
      ? 'bg-slate-100 text-slate-800'
      : 'bg-[#f4f6f5] text-slate-800'
    : isNightMode
    ? 'bg-[#090d12] text-slate-200'
    : 'bg-[#0b1018] text-slate-100';

  const columnSurfaceClass = (isHovered: boolean) => {
    if (isLight) {
      return isHovered
        ? 'bg-slate-200/80 border-[#648296]/60'
        : isNightMode
        ? 'bg-slate-200/50 border-slate-300/60'
        : 'bg-white/70 border-slate-200/85';
    }
    return isHovered
      ? isNightMode
        ? 'bg-slate-900/75 border-slate-600/70'
        : 'bg-slate-900/90 border-[#648296]/65'
      : isNightMode
      ? 'bg-slate-950/65 border-slate-800/55'
      : 'bg-slate-950/60 border-slate-800/75';
  };

  const viewContent = (
    <div
      ref={boardRootRef}
      data-no-drag="true"
      className={`w-full h-full flex flex-col overflow-hidden ${containerSurfaceClass} ${
        mode === 'canvas' ? dockPaddingClass : ''
      }`}
    >
      {/* Top Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b shrink-0 ${
          mode === 'canvas' ? 'pr-28' : ''
        } ${
          isLight
            ? 'border-slate-200/80 bg-white/60'
            : 'border-slate-800/70 bg-slate-950/50'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <KanbanBoardSelectorPill
            boards={boards}
            activeBoard={activeBoard}
            isLight={isLight}
            isNightMode={isNightMode}
            onSelectBoard={handleSelectBoard}
            onCreateBoard={() =>
              setBoardModalState({ open: true, mode: 'create' })
            }
            onEditBoard={(id) =>
              setBoardModalState({ open: true, mode: 'edit', boardId: id })
            }
          />

          {activeBoard && (
            <span
              className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-500'
                  : 'bg-slate-900/70 border-slate-800 text-slate-400'
              }`}
            >
              {activeBoard.autoArchiveDays === null
                ? 'Auto-archive: Off'
                : `Auto-archive: ${activeBoard.autoArchiveDays}d`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {effectiveBoardId && (
            <button
              type="button"
              data-no-drag="true"
              onClick={() => setIsArchiveOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-slate-900/75 hover:bg-slate-800 border-slate-700/60 text-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-[#8b7fa8]" />
              <span>Archived ({archivedCount})</span>
            </button>
          )}

          {mode === 'canvas' && onOpenWidgetSettings && (
            <button
              type="button"
              data-no-drag="true"
              onClick={onOpenWidgetSettings}
              title="Tile settings"
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600'
                  : 'bg-slate-900/75 hover:bg-slate-800 border-slate-700/60 text-slate-300'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              data-no-drag="true"
              onClick={onClose}
              title="Close full-screen board"
              aria-label="Close full-screen board"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  : 'bg-slate-900/75 hover:bg-slate-800 border-slate-700/60 text-slate-200'
              }`}
            >
              {mode === 'canvas' ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* 3-Column Swimlane Grid */}
      {!activeBoard ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <p className="text-sm font-medium text-slate-400">
            No Kanban board available.
          </p>
          <button
            type="button"
            onClick={() => setBoardModalState({ open: true, mode: 'create' })}
            className="px-4 py-2 rounded-xl bg-[#648296] text-white text-xs font-semibold cursor-pointer"
          >
            + Create Board
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {KANBAN_COLUMNS.map((col, colIndex) => {
            const colCards = columnsMap[col.id];
            const isHovered = dragState?.hoverColumnId === col.id;
            const nonDraggedCards = dragState
              ? colCards.filter((c) => c.id !== dragState.card.id)
              : colCards;
            const insertionSlot = isHovered ? dragState?.dropIndex ?? -1 : -1;

            return (
              <section
                key={col.id}
                data-kanban-column={col.id}
                data-no-drag="true"
                className={`flex flex-col min-h-[260px] md:min-h-0 rounded-2xl border transition-colors overflow-hidden ${columnSurfaceClass(
                  Boolean(isHovered)
                )}`}
              >
                {/* Column Header */}
                <div
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 border-b shrink-0 ${
                    isLight ? 'border-slate-200/80' : 'border-slate-800/75'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-xs font-semibold uppercase tracking-wider truncate">
                      {col.label}
                    </h2>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        isLight
                          ? 'bg-slate-200/80 text-slate-700'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {colCards.length}
                    </span>
                  </div>

                  {/* Done Header Controls */}
                  {col.id === 'done' && colCards.length > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void archiveAllDone(activeBoard.id)}
                        title="Archive all cards in Done"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                            : 'bg-slate-900/70 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                        }`}
                      >
                        <ArchiveRestore className="w-3 h-3 text-[#8b7fa8]" />
                        <span>Archive All Done</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmClearDoneOpen(true)}
                        title="Permanently clear Done column"
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
                </div>

                {/* Inline Quick-Add */}
                <div className="px-3 pt-2.5 pb-1 shrink-0">
                  <KanbanInlineAdd
                    placeholder={`+ Add to ${col.label}...`}
                    isLight={isLight}
                    isNightMode={isNightMode}
                    onAdd={(cardTitle) =>
                      addCard({
                        boardId: activeBoard.id,
                        columnId: col.id,
                        title: cardTitle,
                      })
                    }
                  />
                </div>

                {/* Scrollable Cards List */}
                <div
                  data-no-drag="true"
                  className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2"
                >
                  {colCards.length === 0 && !isHovered && (
                    <div
                      className={`h-24 rounded-xl border border-dashed flex items-center justify-center text-[11px] ${
                        isLight
                          ? 'border-slate-300/70 text-slate-400'
                          : 'border-slate-800 text-slate-500'
                      }`}
                    >
                      Drop card or add above
                    </div>
                  )}

                  {colCards.map((card) => {
                    const isSelfDragged = dragState?.card.id === card.id;
                    const nonDragIdx = nonDraggedCards.findIndex(
                      (c) => c.id === card.id
                    );
                    const showIndicatorBefore =
                      !isSelfDragged &&
                      isHovered &&
                      insertionSlot === nonDragIdx;

                    return (
                      <React.Fragment key={card.id}>
                        {showIndicatorBefore && (
                          <div
                            className={`h-1 rounded-full mx-1 ${
                              isNightMode
                                ? 'bg-slate-600/70'
                                : 'bg-[#648296]/75'
                            }`}
                          />
                        )}
                        <KanbanCardItem
                          card={card}
                          isLight={isLight}
                          isNightMode={isNightMode}
                          isDragging={isSelfDragged}
                          canStepLeft={colIndex > 0}
                          canStepRight={colIndex < KANBAN_COLUMNS.length - 1}
                          onOpenCard={(c) => setEditingCardId(c.id)}
                          onStepLeft={(id) => void stepCardColumn(id, 'left')}
                          onStepRight={(id) => void stepCardColumn(id, 'right')}
                          cardDragProps={getCardDragProps(card)}
                          handleDragProps={getHandleDragProps(card)}
                          shouldSuppressClick={shouldSuppressClick}
                        />
                      </React.Fragment>
                    );
                  })}

                  {isHovered && insertionSlot >= nonDraggedCards.length && (
                    <div
                      className={`h-1 rounded-full mx-1 ${
                        isNightMode ? 'bg-slate-600/70' : 'bg-[#648296]/75'
                      }`}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Sub-modals & Drawers */}
      <KanbanCardModal
        cardId={editingCardId}
        onClose={() => setEditingCardId(null)}
      />

      <KanbanBoardModal
        isOpen={boardModalState.open}
        mode={boardModalState.mode}
        boardId={boardModalState.boardId}
        onClose={() =>
          setBoardModalState({ open: false, mode: 'create' })
        }
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

      {DragGhostPortal}
    </div>
  );

  if (mode === 'canvas') {
    return viewContent;
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[85] flex flex-col bg-black/80 backdrop-blur-md"
    >
      {viewContent}
    </div>,
    document.body
  );
};
