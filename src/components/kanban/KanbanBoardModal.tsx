import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Kanban, Trash2, X } from 'lucide-react';
import { useKanbanStore } from '../../stores/useKanbanStore';
import { KANBAN_AUTO_ARCHIVE_OPTIONS } from '../../types/kanban';
import { KanbanConfirmDialog } from './KanbanConfirmDialog';

export interface KanbanBoardModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  boardId?: string;
  onClose: () => void;
  onBoardCreated?: (boardId: string) => void;
  onBoardDeleted?: (deletedBoardId: string) => void;
}

export const KanbanBoardModal: React.FC<KanbanBoardModalProps> = ({
  isOpen,
  mode,
  boardId,
  onClose,
  onBoardCreated,
  onBoardDeleted,
}) => {
  const boards = useKanbanStore((s) => s.boards);
  const cards = useKanbanStore((s) => s.cards);
  const createBoard = useKanbanStore((s) => s.createBoard);
  const updateBoard = useKanbanStore((s) => s.updateBoard);
  const deleteBoard = useKanbanStore((s) => s.deleteBoard);

  const editingBoard =
    mode === 'edit' && boardId
      ? boards.find((b) => b.id === boardId)
      : undefined;

  const [name, setName] = useState('');
  const [autoArchiveDays, setAutoArchiveDays] = useState<number | null>(7);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && editingBoard) {
      setName(editingBoard.name);
      setAutoArchiveDays(editingBoard.autoArchiveDays);
    } else {
      setName('');
      setAutoArchiveDays(7);
    }
    setConfirmDeleteOpen(false);
  }, [isOpen, mode, editingBoard]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDeleteOpen) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, confirmDeleteOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const canDeleteBoard = mode === 'edit' && editingBoard && boards.length > 1;
  const boardCardCount = editingBoard
    ? cards.filter((c) => c.boardId === editingBoard.id).length
    : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;

    if (mode === 'create') {
      const created = await createBoard({
        name: cleaned,
        autoArchiveDays,
      });
      if (created) {
        onBoardCreated?.(created.id);
      }
      onClose();
    } else if (editingBoard) {
      await updateBoard(editingBoard.id, {
        name: cleaned,
        autoArchiveDays,
      });
      onClose();
    }
  };

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        data-no-drag="true"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          (e.currentTarget as any).__backdropMouseDown =
            e.target === e.currentTarget &&
            !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && (e.currentTarget as any).__backdropMouseDown) {
            onClose();
          }
          (e.currentTarget as any).__backdropMouseDown = false;
        }}
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      >
        <form
          onSubmit={handleSave}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-[#11161f] border border-slate-700/60 shadow-2xl overflow-hidden text-slate-100"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
            <div className="flex items-center gap-2">
              <Kanban className="w-4 h-4 text-[#648296]" />
              <h3 className="text-sm font-semibold">
                {mode === 'create' ? 'New Kanban Board' : 'Board Settings'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Board Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="e.g., 3D Print Queue, Home Maintenance, Trip Prep"
                autoFocus
                className="w-full rounded-xl bg-slate-950/80 border border-slate-700/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#648296] select-text"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Auto-Archive Done Cards</span>
              </label>
              <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                Cards sitting in &ldquo;Done&rdquo; past this window automatically move into the board&rsquo;s Archive Drawer.
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {KANBAN_AUTO_ARCHIVE_OPTIONS.map((opt) => {
                  const selected = autoArchiveDays === opt;
                  return (
                    <button
                      key={String(opt)}
                      type="button"
                      onClick={() => setAutoArchiveDays(opt)}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#648296]/25 border-[#648296] text-white'
                          : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {opt === null ? 'Off' : opt === 1 ? '1 day' : `${opt} days`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-950/60">
            {canDeleteBoard ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#b5838d] hover:bg-[#b5838d]/15 border border-[#b5838d]/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Board</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">
                {mode === 'edit' ? 'At least 1 board must remain active' : ''}
              </span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#648296] hover:bg-[#7293a8] disabled:opacity-40 text-white cursor-pointer"
              >
                {mode === 'create' ? 'Create Board' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {editingBoard && (
        <KanbanConfirmDialog
          isOpen={confirmDeleteOpen}
          title="Delete Board"
          message={`Permanently delete board "${editingBoard.name}" and its ${boardCardCount} card${boardCardCount === 1 ? '' : 's'}? This cannot be undone.`}
          confirmLabel="Delete Board"
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={async () => {
            setConfirmDeleteOpen(false);
            const idToDelete = editingBoard.id;
            await deleteBoard(idToDelete);
            onBoardDeleted?.(idToDelete);
            onClose();
          }}
        />
      )}
    </>,
    document.body
  );
};
