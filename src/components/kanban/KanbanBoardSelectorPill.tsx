import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Kanban,
  Plus,
  Settings2,
} from 'lucide-react';
import { getSortedKanbanBoards, type KanbanBoard } from '../../types/kanban';

export interface KanbanBoardSelectorPillProps {
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | undefined;
  isLight?: boolean;
  isNightMode?: boolean;
  compact?: boolean;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: () => void;
  onEditBoard: (boardId: string) => void;
}

export const KanbanBoardSelectorPill: React.FC<KanbanBoardSelectorPillProps> = ({
  boards,
  activeBoard,
  isLight = false,
  isNightMode = false,
  compact = false,
  onSelectBoard,
  onCreateBoard,
  onEditBoard,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sortedBoards = getSortedKanbanBoards(boards);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('pointerdown', handleOutside, true);
    window.addEventListener('keydown', handleKey, true);
    return () => {
      window.removeEventListener('pointerdown', handleOutside, true);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [isOpen]);

  const pillBtnClass = isLight
    ? isNightMode
      ? 'bg-slate-200/80 border-slate-300 text-slate-700 hover:bg-slate-300/70'
      : 'bg-slate-100 hover:bg-slate-200/80 border-slate-300/80 text-slate-800'
    : isNightMode
    ? 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/70'
    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-100';

  return (
    <div
      ref={containerRef}
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="relative flex items-center gap-1 min-w-0"
    >
      <button
        type="button"
        data-no-drag="true"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`inline-flex items-center gap-1.5 rounded-xl border transition-colors cursor-pointer min-w-0 ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        } font-semibold ${pillBtnClass}`}
        title={activeBoard ? `Switch board (${activeBoard.name})` : 'Select or create board'}
      >
        <Kanban className="w-3.5 h-3.5 text-[#648296] shrink-0" />
        <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
        <span className="truncate max-w-[170px]">
          {activeBoard ? activeBoard.name : 'Create Board'}
        </span>
      </button>

      {activeBoard && (
        <button
          type="button"
          data-no-drag="true"
          onClick={(e) => {
            e.stopPropagation();
            onEditBoard(activeBoard.id);
          }}
          title="Board settings & auto-archive"
          aria-label="Board settings"
          className={`p-1.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
            isLight
              ? 'bg-slate-100/80 hover:bg-slate-200 border-slate-200 text-slate-600'
              : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/50 text-slate-400 hover:text-slate-100'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      )}

      {isOpen && (
        <div
          data-no-drag="true"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1.5 w-60 rounded-2xl bg-[#11161f] border border-slate-700/70 shadow-2xl z-[80] overflow-hidden text-slate-100"
        >
          <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-950/50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pin Board to This Tile
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
            {sortedBoards.map((board) => {
              const isSelected = board.id === activeBoard?.id;
              return (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => {
                    onSelectBoard(board.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#648296]/25 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate">{board.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {board.autoArchiveDays === null
                        ? 'Auto-archive: Off'
                        : `Auto-archive: ${board.autoArchiveDays}d`}
                    </span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#9bc0a2] shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="p-1.5 border-t border-slate-800/80 bg-slate-950/40 flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onCreateBoard();
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#6b8f71]/20 hover:bg-[#6b8f71]/35 border border-[#6b8f71]/40 text-[#b7d3bc] text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Board</span>
            </button>
            {activeBoard && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onEditBoard(activeBoard.id);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Settings
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
