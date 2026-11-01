import React, { useRef, useState } from 'react';
import type { StickyNoteItem } from '../../types/dashboard';
import { CheckSquare, Square, Pin, Plus, Trash2, Clock, X } from 'lucide-react';

interface CorkboardProps {
  notes: StickyNoteItem[];
  dockPaddingClass: string;
  onUpdateNotePos: (noteId: string, pos: NonNullable<StickyNoteItem['freeformPos']>) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote: (noteId: string) => void;
}

const COLOR_PALETTE = [
  '#fef08a', // Amber/Yellow
  '#bbf7d0', // Emerald/Green
  '#bae6fd', // Sky/Blue
  '#fbcfe8', // Pink
  '#e9d5ff', // Purple
  '#fed7aa', // Orange
];

export const Corkboard: React.FC<CorkboardProps> = ({
  notes,
  dockPaddingClass,
  onUpdateNotePos,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Quick Note Modal / Creator on Corkboard
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newItemText, setNewItemText] = useState('');

  const handlePointerDown = (e: React.PointerEvent, note: StickyNoteItem) => {
    // Prevent drag when clicking buttons or checkboxes inside note
    if ((e.target as HTMLElement).closest('button, input')) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (note.freeformPos?.xRatio ?? 0.1) * rect.width;
    const currentY = (note.freeformPos?.yRatio ?? 0.1) * rect.height;

    setDraggingId(note.id);
    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const note = notes.find((n) => n.id === draggingId);
    if (!note || !note.freeformPos) return;

    const newX = Math.max(0, Math.min(rect.width - 200, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(rect.height - 200, e.clientY - dragOffset.y));

    onUpdateNotePos(draggingId, {
      ...note.freeformPos,
      xRatio: newX / rect.width,
      yRatio: newY / rect.height,
    });
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  const handleAddChecklistItem = () => {
    if (!newItemText.trim()) return;
    setChecklistItems([
      ...checklistItems,
      { id: Date.now().toString(), text: newItemText.trim(), done: false },
    ]);
    setNewItemText('');
  };

  const handleCreateNote = () => {
    if (!newTitle.trim() && !newContent.trim() && checklistItems.length === 0) return;

    onAddNote({
      title: newTitle.trim() || undefined,
      content: newContent,
      isChecklist,
      checklistItems: isChecklist ? checklistItems : undefined,
      bgColor: selectedColor,
      freeformPos: {
        xRatio: 0.2 + Math.random() * 0.3,
        yRatio: 0.2 + Math.random() * 0.3,
        wRatio: 0.28,
        hRatio: 0.35,
        zIndex: 20,
        rotation: Math.floor(Math.random() * 6) - 3,
      },
    });

    setIsCreatorOpen(false);
    setNewTitle('');
    setNewContent('');
    setIsChecklist(false);
    setChecklistItems([]);
  };

  const toggleChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const activeNotes = notes.filter((n) => !n.archivedAt);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full h-screen overflow-hidden select-none bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px] ${dockPaddingClass}`}
    >
      {/* Floating Add Note Button on Corkboard */}
      <div className="absolute top-4 right-4 z-40">
        <button
          onClick={() => setIsCreatorOpen(true)}
          className="flex items-center gap-2 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-xl shadow-blue-500/25 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Pin New Note</span>
        </button>
      </div>

      {/* Render All Freeform Notes */}
      {activeNotes.map((note) => {
        const pos = note.freeformPos || {
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.28,
          hRatio: 0.35,
          zIndex: 1,
          rotation: 0,
        };

        return (
          <div
            key={note.id}
            onPointerDown={(e) => handlePointerDown(e, note)}
            style={{
              position: 'absolute',
              left: `${pos.xRatio * 100}%`,
              top: `${pos.yRatio * 100}%`,
              width: `${Math.max(240, pos.wRatio * 1000)}px`,
              transform: `rotate(${pos.rotation}deg)`,
              backgroundColor: note.bgColor || '#fef08a',
              zIndex: draggingId === note.id ? 50 : pos.zIndex,
            }}
            className="group rounded-2xl p-5 shadow-2xl text-gray-900 cursor-grab active:cursor-grabbing border border-black/10 transition-shadow hover:shadow-yellow-500/10 flex flex-col justify-between"
          >
            {/* Red Visual Pushpin */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
              <div className="w-5 h-5 rounded-full bg-red-600 shadow-md border-2 border-red-700/60" />
            </div>

            <div>
              {/* Note Title */}
              {note.title && (
                <div className="font-bold text-sm mb-2 flex items-center justify-between border-b border-black/10 pb-1.5">
                  <span className="truncate">{note.title}</span>
                  <div className="flex items-center gap-1.5">
                    {note.expiresAt && (
                      <span className="text-[10px] text-gray-700 bg-black/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                      </span>
                    )}
                    <Pin className="w-3.5 h-3.5 text-gray-700/60" />
                  </div>
                </div>
              )}

              {/* Note Content / Checklist */}
              {note.isChecklist && note.checklistItems ? (
                <div className="space-y-2 mt-2">
                  {note.checklistItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklistItem(note, item.id)}
                      className="flex items-center gap-2 text-xs w-full text-left hover:opacity-80 transition-opacity"
                    >
                      {item.done ? (
                        <CheckSquare className="w-4 h-4 text-emerald-800 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-700 shrink-0" />
                      )}
                      <span className={item.done ? 'line-through opacity-50' : 'font-medium'}>
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
              )}
            </div>

            {/* Note Bottom Actions */}
            <div className="flex items-center justify-end pt-3 border-t border-black/5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onDeleteNote(note.id)}
                className="p-1 rounded text-gray-600 hover:text-red-700 hover:bg-black/5 transition-all"
                title="Archive note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Creator Modal for Family Board */}
      {isCreatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <span className="text-sm font-bold text-white">Pin Note to Family Board</span>
              <button
                onClick={() => setIsCreatorOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Note title (optional)..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsChecklist(false)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                  !isChecklist ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                }`}
              >
                Text Note
              </button>
              <button
                onClick={() => setIsChecklist(true)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                  isChecklist ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                Checklist
              </button>
            </div>

            {isChecklist ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add task item..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                    className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    onClick={handleAddChecklistItem}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white rounded-xl"
                  >
                    Add
                  </button>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="text-xs text-gray-300 flex items-center gap-2 py-0.5">
                      <Square className="w-3.5 h-3.5 text-gray-500" />
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <textarea
                placeholder="Write your note message..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            )}

            {/* Pastel Color Selector */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-800/80">
              <span className="text-xs text-gray-400">Card Color:</span>
              <div className="flex gap-1.5">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-6 h-6 rounded-full border transition-all ${
                      selectedColor === color ? 'border-white scale-110 shadow-md' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCreatorOpen(false)}
                className="px-3.5 py-2 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white rounded-xl shadow-md transition-all cursor-pointer"
              >
                Pin Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
