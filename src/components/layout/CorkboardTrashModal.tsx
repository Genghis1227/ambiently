import React, { useMemo, useState } from 'react';
import { Archive, Trash2, X } from 'lucide-react';
import type { StickyNoteItem } from '../../types/dashboard';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';

export interface CorkboardTrashModalProps {
  trashNotes: StickyNoteItem[];
  onClose: () => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onPermanentlyDeleteNotes?: (noteIds: string[]) => void;
}

export const CorkboardTrashModal: React.FC<CorkboardTrashModalProps> = ({
  trashNotes,
  onClose,
  onUpdateNote,
  onPermanentlyDeleteNote,
  onPermanentlyDeleteNotes,
}) => {
  const [confirmDeleteAllTrash, setConfirmDeleteAllTrash] = useState(false);
  const [mountNow] = useState(() => new Date());

  const handleClose = () => {
    setConfirmDeleteAllTrash(false);
    onClose();
  };

  const backdropHandlers = useMemo(
    () => createBackdropDismissHandlers(handleClose),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClose]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      onDoubleClick={(e) => e.stopPropagation()}
      {...backdropHandlers}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm font-bold text-white truncate">
              Archived & Expired Notes ({trashNotes.length})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {trashNotes.length > 0 && (onPermanentlyDeleteNotes || onPermanentlyDeleteNote) && (
              confirmDeleteAllTrash ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAllTrash(false)}
                    className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = trashNotes.map((n) => n.id);
                      if (onPermanentlyDeleteNotes) {
                        onPermanentlyDeleteNotes(ids);
                      } else if (onPermanentlyDeleteNote) {
                        ids.forEach((id) => onPermanentlyDeleteNote(id));
                      }
                      setConfirmDeleteAllTrash(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer transition-all"
                  >
                    Confirm ({trashNotes.length})
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAllTrash(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold cursor-pointer transition-all"
                  title="Permanently delete all archived and expired notes"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete All</span>
                </button>
              )
            )}
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-white cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
                    {note.expiresAt && new Date(note.expiresAt) <= mountNow
                      ? `Expired on ${new Date(note.expiresAt).toLocaleDateString()}`
                      : 'Archived'}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateNote(note.id, { archivedAt: null, expiresAt: null, isPinnedToCanvas: true })
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
  );
};
