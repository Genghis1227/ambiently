import React, { useState } from 'react';
import {
  Plus,
  CheckSquare,
  Square,
  Clock,
  LayoutGrid,
  Monitor,
  Settings,
  Edit2,
  Check,
  X,
  Trash2,
  Home,
} from 'lucide-react';
import type { DashboardTab, StickyNoteItem } from '../../types/dashboard';
import { APP_VERSION } from '../../data/changelog';
import { ChangelogModal } from '../changelog/ChangelogModal';

interface MobileCompanionProps {
  tabs: DashboardTab[];
  activeTabId: string;
  notes: StickyNoteItem[];
  onSelectTab: (tabId: string) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote?: (noteId: string) => void;
  onToggleDesktopView: () => void;
  onOpenSettings: () => void;
}

export const MobileCompanion: React.FC<MobileCompanionProps> = ({
  tabs,
  activeTabId,
  notes,
  onSelectTab,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onToggleDesktopView,
  onOpenSettings,
}) => {
  const [newNoteText, setNewNoteText] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [addingChecklistNoteId, setAddingChecklistNoteId] = useState<string | null>(null);
  const [newCheckItemText, setNewCheckItemText] = useState('');

  const now = new Date();
  const activeNotes = notes.filter(
    (n) =>
      !n.archivedAt &&
      (!n.expiresAt || new Date(n.expiresAt) > now) &&
      ((n.tabId || 'tab-corkboard') === activeTabId || n.tabId === 'all')
  );

  const handleQuickAdd = () => {
    if (!newNoteText.trim()) return;

    if (isChecklist) {
      onAddNote({
        id: `note-${Date.now()}`,
        tabId: activeTabId,
        title: 'Checklist',
        content: '',
        isChecklist: true,
        checklistItems: [{ id: Date.now().toString(), text: newNoteText.trim(), done: false }],
        bgColor: '#bbf7d0',
      });
    } else {
      onAddNote({
        id: `note-${Date.now()}`,
        tabId: activeTabId,
        content: newNoteText.trim(),
        isChecklist: false,
        bgColor: '#fef08a',
      });
    }

    setNewNoteText('');
  };

  const toggleItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const handleAppendChecklistItem = (note: StickyNoteItem) => {
    if (!newCheckItemText.trim()) return;
    const existing = note.checklistItems || [];
    onUpdateNote(note.id, {
      isChecklist: true,
      checklistItems: [
        ...existing,
        { id: Date.now().toString(), text: newCheckItemText.trim(), done: false },
      ],
    });
    setNewCheckItemText('');
    setAddingChecklistNoteId(null);
  };

  const handleDeleteChecklistItem = (note: StickyNoteItem, itemId: string) => {
    if (!note.checklistItems) return;
    const updated = note.checklistItems.filter((item) => item.id !== itemId);
    onUpdateNote(note.id, { checklistItems: updated });
  };

  const handleSaveInlineEdit = (note: StickyNoteItem) => {
    onUpdateNote(note.id, {
      title: editTitle.trim() || undefined,
      content: editContent,
    });
    setEditingNoteId(null);
  };

  return (
    <>
      <div className="w-full min-h-screen bg-[#090d16] text-white flex flex-col justify-between p-4 pb-20 select-none overflow-y-auto">
        {/* Top Mobile Bar with Clickable Version Tag */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Ambiently" className="w-8 h-8 rounded-lg shadow-sm" />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
                Ambiently Companion
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">Mobile Remote</span>
                <button
                  onClick={() => setIsChangelogOpen(true)}
                  className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
                  title="View changelog"
                >
                  v{APP_VERSION}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleDesktopView}
              title="Switch to full kiosk desktop view"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-xs text-gray-300 font-medium transition-all"
            >
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span>Kiosk</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3 no-scrollbar">
          {tabs.map((tab, idx) => {
            const hasExplicitHome = tabs.some((t) => t.isHome);
            const isHome = tab.isHome || (!hasExplicitHome && idx === 0);
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                  tab.id === activeTabId
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
                }`}
              >
                {isHome && <Home className="w-3 h-3 text-purple-400" />}
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Add Sticky Note Bar */}
        <div className="p-3 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-xl mb-4">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
            Quick Add Note / Task
          </span>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder={isChecklist ? 'Add checklist task...' : 'Type note...'}
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleQuickAdd}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white rounded-xl shadow transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <button
              onClick={() => setIsChecklist(!isChecklist)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all ${
                isChecklist ? 'bg-emerald-500/20 text-emerald-400 font-semibold' : 'text-gray-500'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Checklist Mode
            </button>
            <span>Instantly syncs to selected canvas</span>
          </div>
        </div>

        {/* Live Notes & Checklists Feed */}
        <div className="space-y-3 flex-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
            Active Notes on Canvas ({activeNotes.length})
          </span>

          {activeNotes.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500 bg-gray-950/40 rounded-2xl border border-gray-800/40">
              No active notes on this canvas. Use the bar above to add one!
            </div>
          ) : (
            activeNotes.map((note) => {
              const isEditingThis = editingNoteId === note.id;

              return (
                <div
                  key={note.id}
                  style={{ backgroundColor: note.bgColor || '#fef08a' }}
                  className="rounded-2xl p-4 shadow-lg text-gray-900 border border-black/10 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
                    {isEditingThis ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Note title..."
                        className="flex-1 bg-white/60 rounded px-2 py-0.5 text-xs font-bold text-gray-900 focus:outline-none"
                      />
                    ) : (
                      <span className="font-bold text-xs">
                        {note.title || (note.isChecklist ? 'Checklist' : 'Note')}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* 1-Click Pastel Color Dots */}
                      <div className="flex items-center gap-1 mr-1">
                        {['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff', '#fed7aa'].map(
                          (color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => onUpdateNote(note.id, { bgColor: color })}
                              style={{ backgroundColor: color }}
                              className={`w-3.5 h-3.5 rounded-full border ${
                                (note.bgColor || '#fef08a') === color
                                  ? 'border-gray-900 scale-110 ring-1 ring-gray-900/50'
                                  : 'border-black/25'
                              }`}
                            />
                          )
                        )}
                      </div>
                      {note.expiresAt && (
                        <span className="text-[10px] text-gray-700 bg-black/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                        </span>
                      )}
                      {!isEditingThis ? (
                        <button
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditTitle(note.title || '');
                            setEditContent(note.content || '');
                          }}
                          className="p-1 rounded hover:bg-black/10 text-gray-700"
                          title="Edit note"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSaveInlineEdit(note)}
                            className="p-1 rounded bg-emerald-700 text-white"
                            title="Save changes"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setEditingNoteId(null)}
                            className="p-1 rounded bg-black/20 text-gray-800"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          {onDeleteNote && (
                            <button
                              onClick={() => {
                                onDeleteNote(note.id);
                                setEditingNoteId(null);
                              }}
                              className="p-1 rounded bg-red-600/20 text-red-700 hover:bg-red-600/30"
                              title="Delete note"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {note.isChecklist && note.checklistItems ? (
                    <div className="space-y-2 mt-1">
                      {note.checklistItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-1.5">
                          <button
                            onClick={() => toggleItem(note, item.id)}
                            className="flex items-center gap-2 text-xs flex-1 text-left"
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
                          {isEditingThis && (
                            <button
                              type="button"
                              onClick={() => handleDeleteChecklistItem(note, item.id)}
                              className="p-1 text-red-700 hover:text-red-900 cursor-pointer shrink-0"
                              title="Delete checklist item"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {addingChecklistNoteId === note.id ? (
                        <div className="flex gap-1.5 pt-1">
                          <input
                            type="text"
                            value={newCheckItemText}
                            onChange={(e) => setNewCheckItemText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAppendChecklistItem(note)}
                            placeholder="New checklist item..."
                            className="flex-1 bg-white/70 rounded-lg px-2 py-1 text-xs text-gray-900 focus:outline-none"
                          />
                          <button
                            onClick={() => handleAppendChecklistItem(note)}
                            className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-xs font-bold"
                          >
                            Add
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingChecklistNoteId(note.id)}
                          className="text-[11px] font-semibold text-gray-700 hover:text-black flex items-center gap-1 pt-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add item</span>
                        </button>
                      )}
                    </div>
                  ) : isEditingThis ? (
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-white/60 rounded-lg p-2 text-xs text-gray-900 focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />
    </>
  );
};
