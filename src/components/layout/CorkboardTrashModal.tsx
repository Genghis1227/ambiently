import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, RotateCcw, Trash2, X } from 'lucide-react';
import type { DashboardTab, DashboardWidget, StickyNoteItem } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboardStore';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';
import { getDefaultTitleForWidgetType } from '../../utils/widgetCatalog';

export interface CorkboardTrashModalProps {
  trashNotes: StickyNoteItem[];
  trashWidgets?: DashboardWidget[];
  tabs?: DashboardTab[];
  onClose: () => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onPermanentlyDeleteNote?: (noteId: string) => void;
  onPermanentlyDeleteNotes?: (noteIds: string[]) => void;
  onRestoreWidget?: (widgetId: string) => void;
  onPermanentlyDeleteWidget?: (widgetId: string) => void;
  onPermanentlyDeleteWidgets?: (widgetIds: string[]) => void;
}

export const CorkboardTrashModal: React.FC<CorkboardTrashModalProps> = ({
  trashNotes,
  trashWidgets,
  tabs,
  onClose,
  onUpdateNote,
  onPermanentlyDeleteNote,
  onPermanentlyDeleteNotes,
  onRestoreWidget,
  onPermanentlyDeleteWidget,
  onPermanentlyDeleteWidgets,
}) => {
  const storeDeletedWidgets = useDashboardStore((s) => s.deletedWidgets);
  const storeTabs = useDashboardStore((s) => s.tabs);
  const storeRestoreWidget = useDashboardStore((s) => s.restoreWidget);
  const storePermanentlyDeleteWidget = useDashboardStore((s) => s.permanentlyDeleteWidget);
  const storePermanentlyDeleteWidgets = useDashboardStore((s) => s.permanentlyDeleteWidgets);

  const resolvedWidgets = trashWidgets ?? storeDeletedWidgets;
  const resolvedTabs = (tabs ?? storeTabs).filter((t) => !t.deleted_at);

  const [confirmDeleteAllTrash, setConfirmDeleteAllTrash] = useState(false);
  const [mountNow] = useState(() => new Date());

  const handleClose = () => {
    setConfirmDeleteAllTrash(false);
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setConfirmDeleteAllTrash(false);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const backdropHandlers = useMemo(
    () => createBackdropDismissHandlers(handleClose),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClose]
  );

  const tabNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tab of resolvedTabs) {
      map.set(tab.id, tab.name);
    }
    return map;
  }, [resolvedTabs]);

  const handleRestoreWidget = (widgetId: string) => {
    if (onRestoreWidget) {
      onRestoreWidget(widgetId);
    } else {
      void storeRestoreWidget(widgetId);
    }
  };

  const handlePurgeWidget = (widgetId: string) => {
    if (onPermanentlyDeleteWidget) {
      onPermanentlyDeleteWidget(widgetId);
    } else {
      void storePermanentlyDeleteWidget(widgetId);
    }
  };

  const handlePurgeAllWidgets = (widgetIds: string[]) => {
    if (widgetIds.length === 0) return;
    if (onPermanentlyDeleteWidgets) {
      onPermanentlyDeleteWidgets(widgetIds);
    } else if (onPermanentlyDeleteWidget) {
      widgetIds.forEach((id) => onPermanentlyDeleteWidget(id));
    } else {
      void storePermanentlyDeleteWidgets(widgetIds);
    }
  };

  const totalCount = resolvedWidgets.length + trashNotes.length;
  const canPurgeAllNotes = Boolean(onPermanentlyDeleteNotes || onPermanentlyDeleteNote);
  const canShowDeleteAll =
    totalCount > 0 && (trashNotes.length === 0 || canPurgeAllNotes);

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trash and Recovery"
      data-no-drag="true"
      onDoubleClick={(e) => e.stopPropagation()}
      {...backdropHandlers}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4 max-h-[82vh] flex flex-col"
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm font-bold text-white truncate">
              Trash &amp; Recovery ({totalCount})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canShowDeleteAll && (
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
                      handlePurgeAllWidgets(resolvedWidgets.map((w) => w.id));
                      const noteIds = trashNotes.map((n) => n.id);
                      if (noteIds.length > 0) {
                        if (onPermanentlyDeleteNotes) {
                          onPermanentlyDeleteNotes(noteIds);
                        } else if (onPermanentlyDeleteNote) {
                          noteIds.forEach((id) => onPermanentlyDeleteNote(id));
                        }
                      }
                      setConfirmDeleteAllTrash(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer transition-all"
                  >
                    Confirm ({totalCount})
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAllTrash(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-red-200 text-xs font-semibold cursor-pointer transition-all"
                  title="Permanently delete all items in trash"
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
              title="Close Trash & Recovery"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {totalCount === 0 ? (
            <div className="text-center py-8 text-xs text-gray-500">
              Trash is empty.
            </div>
          ) : (
            <>
              {resolvedWidgets.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-0.5">
                    Recently Deleted Widgets ({resolvedWidgets.length})
                  </div>
                  {resolvedWidgets.map((widget) => {
                    const defaultTypeTitle = getDefaultTitleForWidgetType(widget.type);
                    const displayTitle = widget.title?.trim() || defaultTypeTitle;
                    const sourceTabName = tabNameById.get(widget.tabId);
                    const deletedLabel = widget.deleted_at
                      ? new Date(widget.deleted_at).toLocaleDateString()
                      : '';
                    return (
                      <div
                        key={widget.id}
                        className="p-3 rounded-xl bg-gray-950 border border-gray-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <RotateCcw className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="text-xs font-bold text-white truncate">
                              {displayTitle}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {displayTitle !== defaultTypeTitle ? `${defaultTypeTitle} • ` : ''}
                            {sourceTabName
                              ? `Canvas: ${sourceTabName}`
                              : 'Restores to current canvas'}
                            {deletedLabel ? ` • Deleted ${deletedLabel}` : ''}
                          </div>
                          {widget.type === 'wifi_qr' && (
                            <div className="text-[10px] text-amber-300/80">
                              Wi-Fi password cleared • House-Sitter info intact
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRestoreWidget(widget.id)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold cursor-pointer transition-all"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePurgeWidget(widget.id)}
                            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {trashNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-0.5">
                    Archived &amp; Expired Notes ({trashNotes.length})
                  </div>
                  {trashNotes.map((note) => (
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

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNote(note.id, {
                              archivedAt: null,
                              expiresAt: null,
                              isPinnedToCanvas: true,
                            })
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
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
