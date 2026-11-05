import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Clock,
  Archive,
  Pin,
  X,
} from 'lucide-react';
import type { StickyNoteItem } from '../../types/dashboard';

interface StickyNotesWidgetProps {
  notes: StickyNoteItem[];
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
  onToggleArchive?: (noteId: string) => void;
  onPinNoteToCanvas?: (noteId: string) => void;
  onUnpinNoteFromCanvas?: (noteId: string) => void;
}

const COLOR_PALETTE = [
  '#fef08a', // Amber/Yellow
  '#bbf7d0', // Emerald/Green
  '#bae6fd', // Sky/Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#fed7aa', // Orange
];

export const StickyNotesWidget: React.FC<StickyNotesWidgetProps> = ({
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onPinNoteToCanvas,
  onUnpinNoteFromCanvas,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'trash'>('active');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [tempChecklist, setTempChecklist] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [expiryOption, setExpiryOption] = useState<'permanent' | '1day' | '3days' | 'custom'>('permanent');
  const [customExpiry, setCustomExpiry] = useState('');

  const now = new Date();

  // Filter active vs expired/archived
  const activeNotes = notes.filter((n) => {
    if (n.archivedAt) return false;
    if (n.expiresAt && new Date(n.expiresAt) <= now) return false;
    return true;
  });

  const trashNotes = notes.filter((n) => {
    if (n.archivedAt) return true;
    if (n.expiresAt && new Date(n.expiresAt) <= now) return true;
    return false;
  });

  const handleCreate = () => {
    if (!newTitle.trim() && !newContent.trim() && tempChecklist.length === 0) return;

    let expiresAt: string | null = null;
    if (expiryOption === '1day') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '3days') {
      expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customExpiry) {
      expiresAt = new Date(customExpiry).toISOString();
    }

    onAddNote({
      id: `note-${Date.now()}`,
      title: newTitle.trim() || undefined,
      content: newContent,
      isChecklist,
      checklistItems: isChecklist ? tempChecklist : undefined,
      bgColor: selectedColor,
      expiresAt,
      updated_at: new Date().toISOString(),
    });

    // Reset
    setIsCreating(false);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setTempChecklist([]);
    setExpiryOption('permanent');
  };

  const addChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setTempChecklist((prev) => [
      ...prev,
      { id: Date.now().toString(), text: newChecklistText.trim(), done: false },
    ]);
    setNewChecklistText('');
  };

  const toggleChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden">
      {/* Header Tabs & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-gray-800/80 pb-2 mb-2">
        <div className="flex items-center gap-1 bg-gray-950/60 p-0.5 rounded-lg border border-gray-800 shrink-0">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
              activeTab === 'active'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Notes ({activeNotes.length})
          </button>
          <button
            onClick={() => setActiveTab('trash')}
            className={`px-2 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1 cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-red-950/60 text-red-300 border border-red-800/50'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Archive className="w-3 h-3" />
            Trash ({trashNotes.length})
          </button>
        </div>

        {activeTab === 'active' && !isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New Note
          </button>
        )}
      </div>

      {/* Note Creator Drawer */}
      {isCreating ? (
        <div className="flex-1 overflow-y-auto p-3 rounded-xl bg-gray-950 border border-gray-800 flex flex-col gap-2.5">
          <input
            type="text"
            placeholder="Note title (optional)..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsChecklist(false)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium ${
                !isChecklist ? 'bg-gray-800 text-white' : 'text-gray-400'
              }`}
            >
              Text
            </button>
            <button
              onClick={() => setIsChecklist(true)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium flex items-center gap-1 ${
                isChecklist ? 'bg-gray-800 text-white' : 'text-gray-400'
              }`}
            >
              <CheckSquare className="w-3 h-3 text-emerald-400" />
              Checklist
            </button>
          </div>

          {isChecklist ? (
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Add item..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                  className="flex-1 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                />
                <button
                  onClick={addChecklistItem}
                  className="px-2 py-1 bg-gray-800 text-xs text-white rounded"
                >
                  Add
                </button>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {tempChecklist.map((item) => (
                  <div key={item.id} className="text-xs text-gray-300 flex items-center gap-1.5">
                    <Square className="w-3 h-3 text-gray-500" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <textarea
              placeholder="Note content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          )}

          {/* Color & Expiration Controls */}
          <div className="flex items-center justify-between border-t border-gray-800/60 pt-2">
            <div className="flex gap-1.5">
              {COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-5 h-5 rounded-full border transition-all ${
                    selectedColor === color ? 'border-white scale-110' : 'border-transparent'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="w-3 h-3 text-blue-400" />
              <select
                value={expiryOption}
                onChange={(e) => setExpiryOption(e.target.value as any)}
                className="bg-gray-900 border border-gray-800 rounded px-1.5 py-0.5 text-[10px] text-white"
              >
                <option value="permanent">Permanent</option>
                <option value="1day">Expire 24h</option>
                <option value="3days">Expire 3d</option>
                <option value="custom">Custom Date</option>
              </select>
            </div>
          </div>

          {expiryOption === 'custom' && (
            <input
              type="datetime-local"
              value={customExpiry}
              onChange={(e) => setCustomExpiry(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded px-2 py-1 text-[10px] text-white"
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsCreating(false)}
              className="px-2.5 py-1 text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-lg"
            >
              Save Note
            </button>
          </div>
        </div>
      ) : (
        /* Note List */
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {activeTab === 'active' ? (
            activeNotes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs text-center py-6">
                <span>No active notes.</span>
                <span className="text-[11px] text-gray-600 mt-1">Click "+ New" to add a note or checklist.</span>
              </div>
            ) : (
              activeNotes.map((note) => {
                const isExpiringSoon =
                  note.expiresAt &&
                  new Date(note.expiresAt).getTime() - Date.now() < 12 * 60 * 60 * 1000;

                return (
                  <div
                    key={note.id}
                    style={{ backgroundColor: note.bgColor || '#fef08a' }}
                    className={`rounded-xl p-3 shadow-md text-gray-900 transition-all border border-black/10 flex flex-col justify-between ${
                      isExpiringSoon ? 'opacity-90 ring-1 ring-amber-500' : ''
                    }`}
                  >
                    <div>
                      {note.title && (
                        <div className="font-bold text-xs mb-1 flex items-center justify-between border-b border-black/10 pb-0.5">
                          <span className="truncate">{note.title}</span>
                          {note.expiresAt && (
                            <span
                              title={`Expires: ${new Date(note.expiresAt).toLocaleString()}`}
                              className="text-[9px] flex items-center gap-0.5 text-gray-700 bg-black/10 px-1.5 py-0.5 rounded-full"
                            >
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      )}

                      {note.isChecklist && note.checklistItems ? (
                        <div className="space-y-1 my-1">
                          {note.checklistItems.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => toggleChecklistItem(note, item.id)}
                              className="flex items-center gap-1.5 text-left text-xs w-full hover:opacity-80"
                            >
                              {item.done ? (
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-gray-700 shrink-0" />
                              )}
                              <span className={item.done ? 'line-through opacity-50' : ''}>
                                {item.text}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-black/5 mt-1">
                      {note.isPinnedToCanvas !== false ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onPinNoteToCanvas
                                ? onPinNoteToCanvas(note.id)
                                : onUpdateNote(note.id, { isPinnedToCanvas: true })
                            }
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-950 border border-emerald-600/20 transition-all cursor-pointer"
                            title="Pinned on board (click to bring to front and highlight on canvas)"
                          >
                            <Pin className="w-2.5 h-2.5 text-emerald-800" />
                            <span>On Board</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUnpinNoteFromCanvas
                                ? onUnpinNoteFromCanvas(note.id)
                                : onUpdateNote(note.id, { isPinnedToCanvas: false })
                            }
                            className="flex items-center justify-center p-0.5 rounded-md hover:bg-black/10 text-gray-600 hover:text-red-700 transition-all cursor-pointer"
                            title="Close from board (remains in Notes Tile)"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onPinNoteToCanvas
                              ? onPinNoteToCanvas(note.id)
                              : onUpdateNote(note.id, { isPinnedToCanvas: true })
                          }
                          className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
                          title="Pin note onto corkboard canvas"
                        >
                          <Pin className="w-2.5 h-2.5" />
                          <span>Pin to Board</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        className="text-gray-700 hover:text-red-700 p-0.5 rounded transition-all cursor-pointer"
                        title="Archive note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : trashNotes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs py-6">
              Trash is empty.
            </div>
          ) : (
            trashNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl p-3 bg-gray-900 border border-gray-800 text-gray-300 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold">{note.title || 'Untitled Note'}</div>
                  <div className="text-[10px] text-gray-500">
                    {note.expiresAt ? `Expired on ${new Date(note.expiresAt).toLocaleDateString()}` : 'Archived'}
                  </div>
                </div>
                <button
                  onClick={() => onUpdateNote(note.id, { archivedAt: null, expiresAt: null })}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
