import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  CheckSquare,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useKanbanStore } from '../../stores/useKanbanStore';
import {
  resolveKanbanTagHex,
  resolveKanbanTagLabel,
  type KanbanCard,
} from '../../types/kanban';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { KanbanConfirmDialog } from './KanbanConfirmDialog';

export interface KanbanArchiveDrawerProps {
  isOpen: boolean;
  boardId: string;
  boardName: string;
  onClose: () => void;
}

function formatArchivedDate(iso?: string): string {
  if (!iso) return 'Archived';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Archived';
  }
}

export const KanbanArchiveDrawer: React.FC<KanbanArchiveDrawerProps> = ({
  isOpen,
  boardId,
  boardName,
  onClose,
}) => {
  const cards = useKanbanStore((s) => s.cards);
  const restoreArchivedCard = useKanbanStore((s) => s.restoreArchivedCard);
  const deleteCard = useKanbanStore((s) => s.deleteCard);
  const emptyArchive = useKanbanStore((s) => s.emptyArchive);

  const [query, setQuery] = useState('');
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setConfirmEmptyOpen(false);
  }, [isOpen, boardId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmEmptyOpen) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, confirmEmptyOpen, onClose]);

  const archivedCards = useMemo<KanbanCard[]>(() => {
    const list = cards.filter((c) => c.boardId === boardId && c.isArchived);
    list.sort((a, b) => {
      const aTime = Date.parse(a.archivedAt || a.updatedAt || '') || 0;
      const bTime = Date.parse(b.archivedAt || b.updatedAt || '') || 0;
      return bTime - aTime;
    });
    return list;
  }, [cards, boardId]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return archivedCards;
    return archivedCards.filter((card) => {
      if (card.title.toLowerCase().includes(q)) return true;
      const tag = (card.tagLabel || card.tagColor || '').toLowerCase();
      if (tag.includes(q)) return true;
      if (card.checklist?.some((item) => item.text.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [archivedCards, query]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        data-no-drag="true"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[95] flex justify-end bg-black/65 backdrop-blur-sm"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md h-full bg-[#11161f] border-l border-slate-700/60 shadow-2xl flex flex-col text-slate-100"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-slate-950/60 shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold flex items-center gap-2 truncate">
                <Archive className="w-4 h-4 text-[#8b7fa8] shrink-0" />
                <span className="truncate">Archived ({archivedCards.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {boardName}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {archivedCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmEmptyOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-[#b5838d] hover:bg-[#b5838d]/15 border border-[#b5838d]/30 transition-colors cursor-pointer"
                >
                  Empty Archive
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div className="p-3 border-b border-slate-800/60 shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-slate-950/80 border border-slate-800 px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Search archived cards or checklists..."
                className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none select-text"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-500 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Chronological Archived Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {archivedCards.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center px-6 text-slate-500">
                <Archive className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs font-medium text-slate-400">
                  Archive is empty
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Completed cards archived manually or automatically will appear here for easy reuse.
                </p>
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-xs text-slate-500">
                No archived cards match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              filteredCards.map((card) => {
                const tagHex = resolveKanbanTagHex(card.tagColor);
                const tagLabel = resolveKanbanTagLabel(card);
                const checklistCount = card.checklist?.length || 0;
                const checkedCount = checklistCount
                  ? card.checklist.filter((i) => i.checked).length
                  : 0;

                return (
                  <div
                    key={card.id}
                    className="rounded-xl bg-slate-900/75 border border-slate-800/80 p-3 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        {tagHex && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                            style={{
                              backgroundColor: `${tagHex}20`,
                              borderColor: `${tagHex}48`,
                              color: '#e2e8f0',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: tagHex }}
                            />
                            {tagLabel && <span>{tagLabel}</span>}
                          </span>
                        )}
                        <p className="text-xs font-medium text-slate-100 leading-snug break-words">
                          {card.title}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void deleteCard(card.id)}
                        title="Delete permanently"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#b5838d] hover:bg-slate-800/70 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <span>{formatArchivedDate(card.archivedAt)}</span>
                        {checklistCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[10px]">
                            <CheckSquare className="w-2.5 h-2.5" />
                            {checkedCount}/{checklistCount}
                          </span>
                        )}
                      </div>

                      {card.assigneeIds && card.assigneeIds.length > 0 && (
                        <div className="flex items-center -space-x-1">
                          {card.assigneeIds.slice(0, 4).map((pid) => (
                            <ProfileAvatar
                              key={pid}
                              profileId={pid}
                              size="xs"
                              showRing={false}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => void restoreArchivedCard(card.id, 'todo')}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#6b8f71]/20 hover:bg-[#6b8f71]/35 border border-[#6b8f71]/40 text-[#b7d3bc] text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        <span>Restore to To Do</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void restoreArchivedCard(card.id, 'done')}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/70 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        Restore to Done
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <KanbanConfirmDialog
        isOpen={confirmEmptyOpen}
        title="Empty Archive"
        message={`Permanently delete ${archivedCards.length} archived card${archivedCards.length === 1 ? '' : 's'} from "${boardName}"? This cannot be undone.`}
        confirmLabel="Empty Archive"
        onCancel={() => setConfirmEmptyOpen(false)}
        onConfirm={async () => {
          setConfirmEmptyOpen(false);
          await emptyArchive(boardId);
        }}
      />
    </>,
    document.body
  );
};
