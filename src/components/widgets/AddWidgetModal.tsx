import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  CloudSun,
  Clock,
  Image as ImageIcon,
  Calendar,
  Rss,
  Timer,
  StickyNote,
  Tv,
  Plus,
  Type,
  Sparkles,
  CheckSquare,
  Utensils,
  Kanban,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import type { DashboardWidget } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  WIDGET_CATEGORIES,
  WIDGET_CATALOG_ENTRIES,
  buildWidgetPayloadFromVariant,
  countActiveTabWidgetsForEntry,
  filterWidgetCatalog,
  type WidgetCatalogIconKey,
  type WidgetCategoryId,
  type WidgetVariantSpec,
} from '../../utils/widgetCatalog';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId: string;
  onAddWidget: (widget: Partial<DashboardWidget>) => void;
}

const CATALOG_ICONS: Record<WidgetCatalogIconKey, React.ComponentType<{ className?: string }>> = {
  cloud_sun: CloudSun,
  clock: Clock,
  photo_frame: ImageIcon,
  embed: Tv,
  chores: CheckSquare,
  meals: Utensils,
  kanban: Kanban,
  calendar: Calendar,
  rss: Rss,
  countdown: Timer,
  textbox: Type,
  sticky_notes: StickyNote,
  image: Sparkles,
  finance: TrendingUp,
};

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  isOpen,
  onClose,
  activeTabId,
  onAddWidget,
}) => {
  const existingWidgets = useDashboardStore((state) => state.widgets);
  const [selectedCategory, setSelectedCategory] = useState<WidgetCategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCategory('all');
    setSearchQuery('');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Record<WidgetCategoryId, number> = {
      all: WIDGET_CATALOG_ENTRIES.length,
      household: 0,
      time_weather: 0,
      media_ambient: 0,
      text_feeds: 0,
    };
    for (const entry of WIDGET_CATALOG_ENTRIES) {
      counts[entry.category] += 1;
    }
    return counts;
  }, []);

  const filteredItems = useMemo(
    () => filterWidgetCatalog(WIDGET_CATALOG_ENTRIES, selectedCategory, searchQuery),
    [selectedCategory, searchQuery]
  );

  if (!isOpen) return null;

  const handleAddVariant = (variant: WidgetVariantSpec) => {
    onAddWidget(buildWidgetPayloadFromVariant(variant, activeTabId, existingWidgets));
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none cursor-pointer"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-[min(700px,88vh)] rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Add Widget to Dashboard</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Browse by category, search, or pick a Clock / Text variant directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Widget modal"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="px-4 py-3 border-b border-gray-800/80 bg-gray-950/40 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search widgets (e.g., calendar, world clock, quotes, meals, giphy)..."
              className="w-full rounded-xl bg-gray-950 border border-gray-800 pl-9 pr-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear widget search"
                className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 absolute right-2 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {WIDGET_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                      : 'bg-gray-950/70 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                      isSelected ? 'bg-blue-500/25 text-blue-200' : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {categoryCounts[cat.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid of Available Widget Entries */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-6 py-10 rounded-2xl bg-gray-950/40 border border-dashed border-gray-800 space-y-3">
              <p className="text-sm font-bold text-white">No matching widgets</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Try another search keyword or switch back to All Tiles to browse every widget type.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset filters</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map(({ entry, matchedVariantType }) => {
                const Icon = CATALOG_ICONS[entry.iconKey];
                const boardCount = countActiveTabWidgetsForEntry(entry, existingWidgets, activeTabId);
                const activeVariant =
                  (matchedVariantType &&
                    entry.variants.find((v) => v.type === matchedVariantType)) ||
                  entry.variants[0];
                const hasMultipleVariants = entry.variants.length > 1;

                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAddVariant(activeVariant)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleAddVariant(activeVariant);
                      }
                    }}
                    className="flex flex-col justify-between gap-2.5 p-3.5 rounded-xl bg-gray-800/40 hover:bg-gray-800/80 border border-gray-800 hover:border-gray-700 text-left transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`p-3 rounded-xl bg-gradient-to-br border ${entry.color} shrink-0 group-hover:scale-105 transition-transform`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                            {entry.title}
                          </span>
                          {boardCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300 whitespace-nowrap shrink-0">
                              {boardCount === 1 ? 'On board' : `${boardCount} on board`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          {entry.description}
                        </p>
                      </div>
                    </div>

                    {hasMultipleVariants && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-800/70">
                        {entry.variants.map((variant) => {
                          const isHighlighted = variant.type === activeVariant.type;
                          return (
                            <button
                              key={variant.type}
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddVariant(variant);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                isHighlighted && matchedVariantType
                                  ? 'bg-blue-600/25 border-blue-500/60 text-blue-200 hover:bg-blue-600/35'
                                  : 'bg-gray-900/90 border-gray-700/80 text-gray-300 hover:text-white hover:border-blue-500/50 hover:bg-blue-600/15'
                              }`}
                            >
                              <span>+ {variant.pillLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
