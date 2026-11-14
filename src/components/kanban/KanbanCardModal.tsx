import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  Plus,
  Square,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useKanbanStore } from '../../stores/useKanbanStore';
import { useProfileStore } from '../../stores/useProfileStore';
import {
  KANBAN_TAG_PALETTE,
  resolveKanbanTagHex,
  type KanbanChecklistItem,
} from '../../types/kanban';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { KanbanConfirmDialog } from './KanbanConfirmDialog';

export interface KanbanCardModalProps {
  cardId: string | null;
  onClose: () => void;
}

export const KanbanCardModal: React.FC<KanbanCardModalProps> = ({
  cardId,
  onClose,
}) => {
  const card = useKanbanStore((s) =>
    cardId ? s.cards.find((c) => c.id === cardId) : undefined
  );
  const updateCard = useKanbanStore((s) => s.updateCard);
  const deleteCard = useKanbanStore((s) => s.deleteCard);
  const addChecklistItem = useKanbanStore((s) => s.addChecklistItem);
  const toggleChecklistItem = useKanbanStore((s) => s.toggleChecklistItem);
  const reorderChecklistItems = useKanbanStore((s) => s.reorderChecklistItems);
  const removeChecklistItem = useKanbanStore((s) => s.removeChecklistItem);

  const profiles = useProfileStore((s) => s.profiles);

  const [titleDraft, setTitleDraft] = useState('');
  const [tagLabelDraft, setTagLabelDraft] = useState('');
  const [newCheckText, setNewCheckText] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!card) return;
    setTitleDraft(card.title);
    setTagLabelDraft(card.tagLabel || '');
    setNewCheckText('');
    setConfirmDeleteOpen(false);
  }, [card?.id]);

  useEffect(() => {
    if (!card) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmDeleteOpen) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [card, confirmDeleteOpen, onClose]);

  if (!card || typeof document === 'undefined') return null;

  const commitTitleIfChanged = () => {
    const cleaned = titleDraft.trim();
    if (cleaned && cleaned !== card.title) {
      void updateCard(card.id, { title: cleaned });
    } else if (!cleaned) {
      setTitleDraft(card.title);
    }
  };

  const commitTagLabelIfChanged = () => {
    const cleaned = tagLabelDraft.trim() || undefined;
    if (cleaned !== (card.tagLabel || undefined)) {
      void updateCard(card.id, { tagLabel: cleaned });
    }
  };

  const handleToggleTagColor = (token: string) => {
    const currentHex = resolveKanbanTagHex(card.tagColor);
    const nextHex = resolveKanbanTagHex(token);
    if (currentHex && nextHex && currentHex.toLowerCase() === nextHex.toLowerCase()) {
      void updateCard(card.id, { tagColor: undefined, tagLabel: undefined });
      setTagLabelDraft('');
    } else {
      void updateCard(card.id, { tagColor: token });
    }
  };

  const handleToggleAssignee = (profileId: string) => {
    const exists = card.assigneeIds.includes(profileId);
    const nextIds = exists
      ? card.assigneeIds.filter((id) => id !== profileId)
      : [...card.assigneeIds, profileId];
    void updateCard(card.id, { assigneeIds: nextIds });
  };

  const handleAddChecklist = async () => {
    const cleaned = newCheckText.trim();
    if (!cleaned) return;
    setNewCheckText('');
    await addChecklistItem(card.id, cleaned);
  };

  const checklist: KanbanChecklistItem[] = card.checklist || [];
  const checkedCount = checklist.filter((i) => i.checked).length;

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
            commitTitleIfChanged();
            commitTagLabelIfChanged();
            onClose();
          }
          (e.currentTarget as any).__backdropMouseDown = false;
        }}
        className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-[#11161f] border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col max-h-[86vh] text-slate-100"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/60 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Card Details
            </span>
            <button
              type="button"
              onClick={() => {
                commitTitleIfChanged();
                commitTagLabelIfChanged();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 overflow-y-auto space-y-5">
            {/* Title */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitleIfChanged}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitleIfChanged();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Task title..."
                className="w-full rounded-xl bg-slate-950/80 border border-slate-700/60 px-3 py-2 text-sm font-medium text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#648296] select-text"
              />
            </div>

            {/* Calm Science Color Tag + Optional Short Tag Text */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5" />
                <span>Calm Tag</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    void updateCard(card.id, { tagColor: undefined, tagLabel: undefined });
                    setTagLabelDraft('');
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    !card.tagColor
                      ? 'bg-slate-700/80 border-slate-500 text-white'
                      : 'bg-slate-900/70 border-slate-700/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  None
                </button>
                {KANBAN_TAG_PALETTE.map((swatch) => {
                  const activeHex = resolveKanbanTagHex(card.tagColor);
                  const isSelected =
                    Boolean(activeHex) &&
                    activeHex?.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.token}
                      type="button"
                      onClick={() => handleToggleTagColor(swatch.token)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                        isSelected
                          ? 'text-white'
                          : 'bg-slate-900/70 border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: `${swatch.hex}38`,
                              borderColor: swatch.hex,
                            }
                          : undefined
                      }
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: swatch.hex }}
                      />
                      <span>{swatch.label}</span>
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={tagLabelDraft}
                maxLength={28}
                onChange={(e) => setTagLabelDraft(e.target.value)}
                onBlur={commitTagLabelIfChanged}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTagLabelIfChanged();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Optional short label (e.g., 3D Print, Maintenance, Packing)"
                className="w-full rounded-xl bg-slate-950/70 border border-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#648296] select-text"
              />
            </div>

            {/* Assignees */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5" />
                <span>Assignees</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {profiles.map((profile) => {
                  const isAssigned = card.assigneeIds.includes(profile.id);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => handleToggleAssignee(profile.id)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                        isAssigned
                          ? 'bg-[#648296]/25 border-[#648296] text-white'
                          : 'bg-slate-900/70 border-slate-700/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <ProfileAvatar
                        profile={profile}
                        size="xs"
                        showName
                        showRing={false}
                      />
                      {isAssigned && <Check className="w-3.5 h-3.5 text-[#9bc0a2]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lightweight Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Checklist</span>
                </label>
                {checklist.length > 0 && (
                  <span className="text-[11px] text-slate-400">
                    {checkedCount}/{checklist.length} done
                  </span>
                )}
              </div>

              {checklist.length > 0 && (
                <div className="space-y-1.5 mb-2.5 max-h-52 overflow-y-auto pr-0.5">
                  {checklist.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-xl bg-slate-900/70 border border-slate-800/80 px-2.5 py-1.5 group"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleChecklistItem(card.id, item.id)}
                        className="shrink-0 text-slate-300 hover:text-white cursor-pointer"
                        aria-label={item.checked ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {item.checked ? (
                          <CheckSquare className="w-4 h-4 text-[#6b8f71]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      <span
                        onClick={() => void toggleChecklistItem(card.id, item.id)}
                        className={`flex-1 text-xs cursor-pointer select-text break-words ${
                          item.checked ? 'text-slate-500 line-through' : 'text-slate-200'
                        }`}
                      >
                        {item.text}
                      </span>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => void reorderChecklistItems(card.id, idx, idx - 1)}
                          title="Move up"
                          className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === checklist.length - 1}
                          onClick={() => void reorderChecklistItems(card.id, idx, idx + 1)}
                          title="Move down"
                          className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeChecklistItem(card.id, item.id)}
                          title="Remove item"
                          className="p-1 rounded text-slate-500 hover:text-[#b5838d] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCheckText}
                  onChange={(e) => setNewCheckText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddChecklist();
                    }
                  }}
                  placeholder="Add checklist item..."
                  className="flex-1 rounded-xl bg-slate-950/80 border border-slate-700/60 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#648296] select-text"
                />
                <button
                  type="button"
                  onClick={() => void handleAddChecklist()}
                  disabled={!newCheckText.trim()}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700/70 inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-950/60 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#b5838d] hover:bg-[#b5838d]/15 border border-[#b5838d]/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Card</span>
            </button>

            <button
              type="button"
              onClick={() => {
                commitTitleIfChanged();
                commitTagLabelIfChanged();
                onClose();
              }}
              className="px-4 py-1.5 rounded-xl bg-[#648296] hover:bg-[#7293a8] text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <KanbanConfirmDialog
        isOpen={confirmDeleteOpen}
        title="Delete Card"
        message={`Permanently delete "${card.title}"? This cannot be undone.`}
        confirmLabel="Delete Card"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          const idToDelete = card.id;
          onClose();
          await deleteCard(idToDelete);
        }}
      />
    </>,
    document.body
  );
};
