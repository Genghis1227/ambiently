import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import type { StickyNoteChecklistItem, StickyNoteItem } from '../../types/dashboard';
import { DEFAULT_AISLE_ORDER, type GroceryCategory } from '../../types/meals';
import {
  categorizeIngredient,
  normalizeItemNameSingular,
  parseIngredient,
} from '../../utils/ingredientAggregator';
import { useMealStore } from '../../stores/useMealStore';

interface ShoppingListNoteBodyProps {
  note: StickyNoteItem;
  fontSizeClass?: string;
  onUpdateItems: (items: StickyNoteChecklistItem[]) => void;
  onToggleItem: (itemId: string) => void;
  onCheckDragGuard?: () => boolean;
}

export const ShoppingListNoteBody: React.FC<ShoppingListNoteBodyProps> = ({
  note,
  fontSizeClass = 'text-xs leading-relaxed',
  onUpdateItems,
  onToggleItem,
  onCheckDragGuard,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const aisleOrder = useMealStore((s) => s.aisleOrder);

  const items = useMemo(() => note.checklistItems || [], [note.checklistItems]);

  const groupedSections = useMemo(() => {
    const order = aisleOrder && aisleOrder.length > 0 ? aisleOrder : DEFAULT_AISLE_ORDER;
    const buckets = new Map<GroceryCategory, StickyNoteChecklistItem[]>();

    for (const item of items) {
      const cat: GroceryCategory =
        item.category ||
        categorizeIngredient(parseIngredient(item.text).itemName || item.text);
      const list = buckets.get(cat) || [];
      list.push(item);
      buckets.set(cat, list);
    }

    const orderedCategories: GroceryCategory[] = [];
    for (const cat of order) {
      if (buckets.has(cat)) orderedCategories.push(cat);
    }
    for (const cat of buckets.keys()) {
      if (!orderedCategories.includes(cat)) orderedCategories.push(cat);
    }

    return orderedCategories.map((cat) => {
      const groupItems = (buckets.get(cat) || []).slice().sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return 0;
      });
      return {
        category: cat,
        items: groupItems,
      };
    });
  }, [items, aisleOrder]);

  const checkedCount = useMemo(() => items.filter((i) => i.done).length, [items]);
  const uncheckedCount = items.length - checkedCount;

  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = quickInput.trim();
    if (!raw) return;

    const parsed = parseIngredient(raw);
    const category = parsed.category || categorizeIngredient(raw);
    const normalizedKey = normalizeItemNameSingular(parsed.itemName || raw);
    const rawLower = raw.toLowerCase();

    const existingIdx = items.findIndex((i) => {
      const existingParsed = parseIngredient(i.text);
      const existingKey = normalizeItemNameSingular(existingParsed.itemName || i.text);
      return i.text.trim().toLowerCase() === rawLower || (normalizedKey && existingKey === normalizedKey);
    });

    if (existingIdx !== -1) {
      const next = items.map((item, idx) =>
        idx === existingIdx
          ? {
              ...item,
              text: raw,
              done: false,
              category: item.category || category,
            }
          : item
      );
      onUpdateItems(next);
    } else {
      const newItem: StickyNoteChecklistItem = {
        id: `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        text: raw,
        done: false,
        category,
      };
      onUpdateItems([...items, newItem]);
    }
    setQuickInput('');
  };

  const handleClearChecked = (e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = items.filter((i) => !i.done);
    onUpdateItems(remaining);
  };

  return (
    <div
      className="space-y-2 mt-1 select-none touch-none"
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Inline Quick-Add Input + Clear Checked Pill */}
      <form
        onSubmit={handleQuickAdd}
        className="flex items-center gap-1"
        data-no-drag="true"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          data-no-drag="true"
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          placeholder="+ Add grocery item..."
          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-black/10 hover:bg-black/15 focus:bg-white/75 border border-black/15 text-[11px] text-gray-900 placeholder:text-gray-700/75 focus:outline-none transition-colors"
        />
        {quickInput.trim() && (
          <button
            type="submit"
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded-lg bg-emerald-800/85 hover:bg-emerald-900 text-white shadow-sm transition-colors cursor-pointer shrink-0"
            title="Add item"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        {checkedCount > 0 && (
          <button
            type="button"
            data-no-drag="true"
            onClick={handleClearChecked}
            onPointerDown={(e) => e.stopPropagation()}
            className="px-1.5 py-1 rounded-lg bg-black/10 hover:bg-black/20 text-[10px] font-semibold text-gray-800 flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
            title="Clear checked items"
          >
            <Trash2 className="w-2.5 h-2.5" />
            <span>Clear ({checkedCount})</span>
          </button>
        )}
      </form>

      {/* Aisle / Category Grouped Items */}
      {groupedSections.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-gray-700/75 italic">
          List is empty — add items above or send from Meal Planner.
        </div>
      ) : (
        <div className="space-y-2">
          {groupedSections.map((group) => (
            <div key={group.category} className="space-y-1">
              <div className="flex items-center justify-between px-1 py-0.5 rounded bg-black/10 text-[9px] font-bold uppercase tracking-wider text-gray-800">
                <span className="truncate">{group.category}</span>
                <span className="opacity-75 font-mono">
                  {group.items.filter((i) => !i.done).length}/{group.items.length}
                </span>
              </div>
              <div className="space-y-1 pl-0.5">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 w-full text-left select-none touch-none ${fontSizeClass}`}
                  >
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleItem(item.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title={item.done ? 'Mark as needed' : 'Check off item'}
                      className="p-0.5 -m-0.5 hover:opacity-80 transition-opacity shrink-0 cursor-pointer text-gray-700 hover:text-gray-900"
                    >
                      {item.done ? (
                        <CheckSquare className="w-4 h-4 text-emerald-800 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-700 shrink-0" />
                      )}
                    </button>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!onCheckDragGuard || !onCheckDragGuard()) {
                          onToggleItem(item.id);
                        }
                      }}
                      className={`flex-1 select-none touch-none cursor-pointer ${
                        item.done ? 'line-through opacity-50' : 'font-medium'
                      }`}
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="text-[10px] text-gray-700/80 font-medium pt-0.5 flex items-center justify-between">
          <span>
            {uncheckedCount === 0
              ? 'All items checked off!'
              : `${uncheckedCount} item${uncheckedCount === 1 ? '' : 's'} remaining`}
          </span>
          <span className="uppercase tracking-wider text-[9px] opacity-75">Shopping List</span>
        </div>
      )}
    </div>
  );
};
