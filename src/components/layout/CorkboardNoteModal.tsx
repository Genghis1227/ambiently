import React, { useMemo, useState } from 'react';
import { Clock, Layers, X } from 'lucide-react';
import type { DashboardTab, StickyNoteChecklistItem, StickyNoteItem } from '../../types/dashboard';
import { categorizeIngredient, parseIngredient } from '../../utils/ingredientAggregator';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';

export interface CorkboardNoteModalProps {
  editingNoteId: string | null;
  newTitle: string;
  setNewTitle: (value: string) => void;
  newContent: string;
  setNewContent: (value: string) => void;
  isChecklist: boolean;
  setIsChecklist: (value: boolean) => void;
  isShoppingList: boolean;
  setIsShoppingList: (value: boolean) => void;
  selectedColor: string;
  setSelectedColor: (value: string) => void;
  selectedFontSize: NonNullable<StickyNoteItem['fontSize']>;
  setSelectedFontSize: (value: NonNullable<StickyNoteItem['fontSize']>) => void;
  selectedNoteTabId: string;
  setSelectedNoteTabId: (value: string) => void;
  checklistItems: StickyNoteChecklistItem[];
  setChecklistItems: (value: StickyNoteChecklistItem[]) => void;
  expiryOption: 'permanent' | '1day' | '3days' | 'custom';
  setExpiryOption: (value: 'permanent' | '1day' | '3days' | 'custom') => void;
  customExpiry: string;
  setCustomExpiry: (value: string) => void;
  colorPalette: string[];
  tabs: DashboardTab[];
  onClose: () => void;
  onSave: () => void;
}

export const CorkboardNoteModal: React.FC<CorkboardNoteModalProps> = ({
  editingNoteId,
  newTitle,
  setNewTitle,
  newContent,
  setNewContent,
  isChecklist,
  setIsChecklist,
  isShoppingList,
  setIsShoppingList,
  selectedColor,
  setSelectedColor,
  selectedFontSize,
  setSelectedFontSize,
  selectedNoteTabId,
  setSelectedNoteTabId,
  checklistItems,
  setChecklistItems,
  expiryOption,
  setExpiryOption,
  customExpiry,
  setCustomExpiry,
  colorPalette,
  tabs,
  onClose,
  onSave,
}) => {
  const [newItemText, setNewItemText] = useState('');
  const backdropHandlers = useMemo(() => createBackdropDismissHandlers(onClose), [onClose]);

  const handleAddChecklistItem = () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    const category = isShoppingList
      ? categorizeIngredient(parseIngredient(trimmed).itemName || trimmed)
      : undefined;
    setChecklistItems([
      ...checklistItems,
      { id: Date.now().toString(), text: trimmed, done: false, ...(category ? { category } : {}) },
    ]);
    setNewItemText('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      onDoubleClick={(e) => e.stopPropagation()}
      {...backdropHandlers}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <span className="text-sm font-bold text-white">
            {editingNoteId ? 'Edit Sticky Note' : 'Pin Note to Canvas'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette Picker & Expiration Selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {colorPalette.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                style={{ backgroundColor: color }}
                className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                  selectedColor === color ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'opacity-70'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={expiryOption}
              onChange={(e) => setExpiryOption(e.target.value as 'permanent' | '1day' | '3days' | 'custom')}
              className="bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none"
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
            className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white"
          />
        )}

        {/* Canvas Board Selector & Font Size Selector */}
        <div className="grid grid-cols-2 gap-2">
          {tabs.length > 0 && (
            <div className="flex items-center gap-1.5 bg-gray-950/60 px-2.5 py-1.5 rounded-xl border border-gray-800">
              <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <select
                value={selectedNoteTabId}
                onChange={(e) => setSelectedNoteTabId(e.target.value)}
                title="Choose which canvas this note appears on"
                className="w-full bg-transparent text-[11px] text-white focus:outline-none truncate"
              >
                {tabs.map((t) => (
                  <option key={t.id} value={t.id} className="bg-gray-900 text-white">
                    {t.name}
                  </option>
                ))}
                <option value="all" className="bg-gray-900 text-amber-300">
                  📌 Pin to All Canvases
                </option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between bg-gray-950/60 px-2.5 py-1.5 rounded-xl border border-gray-800">
            <span className="text-[10px] text-gray-400 font-medium">Size:</span>
            <div className="flex items-center gap-0.5">
              {(
                [
                  { id: 'sm', label: 'S' },
                  { id: 'base', label: 'M' },
                  { id: 'lg', label: 'L' },
                  { id: 'xl', label: 'XL' },
                ] as const
              ).map((sz) => (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => setSelectedFontSize(sz.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    selectedFontSize === sz.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Format Toggle: Message vs Checklist vs Shopping List */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-950 p-1 border border-gray-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setIsChecklist(false);
              setIsShoppingList(false);
            }}
            className={`py-1.5 rounded-md text-center transition-all cursor-pointer ${
              !isChecklist && !isShoppingList
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Text Note
          </button>
          <button
            type="button"
            onClick={() => {
              setIsChecklist(true);
              setIsShoppingList(false);
            }}
            className={`py-1.5 rounded-md text-center transition-all cursor-pointer ${
              isChecklist && !isShoppingList
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Checklist
          </button>
          <button
            type="button"
            onClick={() => {
              setIsChecklist(true);
              setIsShoppingList(true);
              if (!editingNoteId) {
                if (!newTitle.trim()) setNewTitle('🛒 Shopping List');
                setSelectedColor('#bbf7d0');
              }
            }}
            className={`py-1.5 rounded-md text-center transition-all cursor-pointer ${
              isShoppingList
                ? 'bg-emerald-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🛒 Shopping List
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {!isChecklist ? (
            <textarea
              placeholder="Write your note message here..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add checklist item..."
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                  className="flex-1 rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 text-xs text-gray-300 bg-gray-950/60 p-1.5 rounded-lg border border-gray-800"
                  >
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) =>
                        setChecklistItems(
                          checklistItems.map((i) =>
                            i.id === item.id ? { ...i, text: e.target.value } : i
                          )
                        )
                      }
                      className="flex-1 bg-transparent text-xs text-gray-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setChecklistItems(checklistItems.filter((i) => i.id !== item.id))
                      }
                      className="text-gray-500 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onSave}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
        >
          {editingNoteId ? 'Save Note Changes' : 'Pin Note to Board'}
        </button>
      </div>
    </div>
  );
};
