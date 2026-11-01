import React, { useState } from 'react';
import {
  Plus,
  CheckSquare,
  Square,
  Clock,
  LayoutGrid,
  Monitor,
  Settings,
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
  onToggleDesktopView,
  onOpenSettings,
}) => {
  const [newNoteText, setNewNoteText] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  const activeNotes = notes.filter((n) => !n.archivedAt);

  const handleQuickAdd = () => {
    if (!newNoteText.trim()) return;

    if (isChecklist) {
      onAddNote({
        id: `note-${Date.now()}`,
        tabId: activeTabId,
        title: 'Checklist',
        content: '',
        isChecklist: true,
        checklistItems: [{ id: '1', text: newNoteText.trim(), done: false }],
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                tab.id === activeTabId
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.name}
            </button>
          ))}
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
            <span>Instantly syncs to wall display</span>
          </div>
        </div>

        {/* Live Notes & Checklists Feed */}
        <div className="space-y-3 flex-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
            Active Notes ({activeNotes.length})
          </span>

          {activeNotes.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500 bg-gray-950/40 rounded-2xl border border-gray-800/40">
              No active notes on display. Use the bar above to add one!
            </div>
          ) : (
            activeNotes.map((note) => (
              <div
                key={note.id}
                style={{ backgroundColor: note.bgColor || '#fef08a' }}
                className="rounded-2xl p-4 shadow-lg text-gray-900 border border-black/10 transition-all"
              >
                {note.title && (
                  <div className="font-bold text-xs mb-1.5 border-b border-black/10 pb-1 flex items-center justify-between">
                    <span>{note.title}</span>
                    {note.expiresAt && (
                      <span className="text-[10px] text-gray-700 bg-black/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(note.expiresAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}

                {note.isChecklist && note.checklistItems ? (
                  <div className="space-y-2 mt-1">
                    {note.checklistItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(note, item.id)}
                        className="flex items-center gap-2 text-xs w-full text-left"
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
            ))
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
