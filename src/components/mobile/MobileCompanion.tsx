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
  ChevronUp,
  ChevronDown,
  Sun,
  Image,
  Rss,
  Quote,
  Music,
  Type,
  StickyNote,
  Globe,
  Hourglass,
  Sparkles,
  Cloud,
  Smartphone,
  Utensils,
  Lock,
  Kanban,
} from 'lucide-react';
import type { DashboardTab, DashboardWidget, StickyNoteItem, WidgetThemeMode } from '../../types/dashboard';
import { ShoppingListNoteBody } from '../common/ShoppingListNoteBody';
import { categorizeIngredient, parseIngredient } from '../../utils/ingredientAggregator';
import { getCurrentUser } from '../../services/supabase';
import { isCanvasThemeLight } from '../../data/canvasThemes';
import { APP_VERSION } from '../../data/version';
import { useDashboardStore } from '../../store/dashboardStore';
import { useSyncRefusal } from '../../hooks/useSyncRefusal';

const ChangelogModal = React.lazy(() =>
  import('../changelog/ChangelogModal').then((m) => ({ default: m.ChangelogModal }))
);
import { CalendarWidget } from '../widgets/CalendarWidget';
import { ClockWeatherWidget } from '../widgets/ClockWeatherWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { WorldClockWidget } from '../widgets/WorldClockWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { CountdownWidget } from '../widgets/CountdownWidget';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';
import { inferCuratedCategoryId } from '../../services/photos';
import { isWidgetStickerMode } from '../../utils/widgetStickerMode';
import { isSettingsPinRequired } from '../../utils/pinValidation';
import { RssWidget } from '../widgets/RssWidget';
import { QuotesWidget } from '../widgets/QuotesWidget';
import { MediaEmbedWidget } from '../widgets/MediaEmbedWidget';

const WidgetSettingsModal = React.lazy(() =>
  import('../widgets/WidgetSettingsModal').then((m) => ({ default: m.WidgetSettingsModal }))
);
const PhotoSourcesModal = React.lazy(() =>
  import('../photos/PhotoSourcesModal').then((m) => ({ default: m.PhotoSourcesModal }))
);
const AddWidgetModal = React.lazy(() =>
  import('../widgets/AddWidgetModal').then((m) => ({ default: m.AddWidgetModal }))
);
import { TextBoxWidget } from '../widgets/TextBoxWidget';
import { ImageWidget } from '../widgets/ImageWidget';
import { ChoreWidget } from '../widgets/ChoreWidget';
import { MealPlannerWidget } from '../widgets/MealPlannerWidget';
import { KanbanWidget } from '../widgets/KanbanWidget';

interface MobileCompanionProps {
  tabs: DashboardTab[];
  activeTabId: string;
  notes: StickyNoteItem[];
  widgets?: DashboardWidget[];
  onSelectTab: (tabId: string) => void;
  onAddNote: (note: Partial<StickyNoteItem>) => void;
  onUpdateNote: (noteId: string, updates: Partial<StickyNoteItem>) => void;
  onDeleteNote?: (noteId: string) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  onRemoveWidget?: (widgetId: string) => void;
  onAddWidget?: (widget: Partial<DashboardWidget>) => void;
  onToggleDesktopView: () => void;
  onOpenSettings: () => void;
}

type CompanionViewMode = 'all' | 'widgets' | 'notes';

export const MobileCompanion: React.FC<MobileCompanionProps> = ({
  tabs,
  activeTabId,
  notes,
  widgets = [],
  onSelectTab,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onUpdateWidget,
  onRemoveWidget,
  onAddWidget,
  onToggleDesktopView,
  onOpenSettings,
}) => {
  const settings = useDashboardStore((state) => state.settings);
  const applyCommonPhotosToAllWidgets = useDashboardStore((state) => state.applyCommonPhotosToAllWidgets);

  // Persistent View Option (All Tiles | Widgets | Notes & Tasks)
  const [viewMode, setViewMode] = useState<CompanionViewMode>(() => {
    try {
      const saved = localStorage.getItem('ambiently_companion_view');
      if (saved === 'all' || saved === 'widgets' || saved === 'notes') return saved;
    } catch {
      // ignore
    }
    return 'all';
  });

  const handleSetViewMode = (mode: CompanionViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('ambiently_companion_view', mode);
    } catch {
      // ignore
    }
  };

  const [newNoteText, setNewNoteText] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [isShoppingList, setIsShoppingList] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [addingChecklistNoteId, setAddingChecklistNoteId] = useState<string | null>(null);
  const [newCheckItemText, setNewCheckItemText] = useState('');

  // Modals for modifying & adding tiles on mobile
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [photoSourcesTarget, setPhotoSourcesTarget] = useState<{
    widget: DashboardWidget;
    isCommon: boolean;
  } | null>(null);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);

  // Authenticated status
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Set while the cloud refuses this board's changes because the board is full
  const syncRefusal = useSyncRefusal();

  React.useEffect(() => {
    getCurrentUser().then((u) => setUserEmail(u?.email || null));
  }, []);

  const now = new Date();
  const activeNotes = notes.filter(
    (n) =>
      !n.archivedAt &&
      (!n.expiresAt || new Date(n.expiresAt) > now) &&
      ((n.tabId || 'tab-corkboard') === activeTabId || n.tabId === 'all')
  );

  // Chronological addition order with independent mobileOrder sorting (does not impact desktop layout)
  const sortedWidgets = [...widgets].sort((a, b) => {
    if (a.mobileOrder !== undefined && b.mobileOrder !== undefined) {
      return a.mobileOrder - b.mobileOrder;
    }
    if (a.mobileOrder !== undefined) return -1;
    if (b.mobileOrder !== undefined) return 1;
    return 0; // maintain chronological addition sequence
  });

  const handleMoveWidget = (widgetId: string, direction: 'up' | 'down') => {
    if (!onUpdateWidget) return;
    const currentIndex = sortedWidgets.findIndex((w) => w.id === widgetId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedWidgets.length) return;

    const targetWidget = sortedWidgets[targetIndex];
    // Swap their independent mobile orders
    onUpdateWidget(widgetId, { mobileOrder: targetIndex });
    onUpdateWidget(targetWidget.id, { mobileOrder: currentIndex });
  };

  const handleQuickAdd = () => {
    const raw = newNoteText.trim();
    if (!raw) return;

    if (isShoppingList) {
      const category = categorizeIngredient(parseIngredient(raw).itemName || raw);
      const existingShopNote = activeNotes.find(
        (n) => n.isShoppingList || n.freeformPos?.isShoppingList
      );
      if (existingShopNote) {
        const items = existingShopNote.checklistItems || [];
        onUpdateNote(existingShopNote.id, {
          isChecklist: true,
          isShoppingList: true,
          checklistItems: [
            ...items,
            { id: Date.now().toString(), text: raw, done: false, category },
          ],
        });
      } else {
        onAddNote({
          id: `note-${Date.now()}`,
          tabId: activeTabId,
          title: '🛒 Shopping List',
          content: '',
          isChecklist: true,
          isShoppingList: true,
          checklistItems: [{ id: Date.now().toString(), text: raw, done: false, category }],
          bgColor: '#bbf7d0',
        });
      }
    } else if (isChecklist) {
      onAddNote({
        id: `note-${Date.now()}`,
        tabId: activeTabId,
        title: 'Checklist',
        content: '',
        isChecklist: true,
        checklistItems: [{ id: Date.now().toString(), text: raw, done: false }],
        bgColor: '#bbf7d0',
      });
    } else {
      onAddNote({
        id: `note-${Date.now()}`,
        tabId: activeTabId,
        content: raw,
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

  const getWidgetIcon = (type: string) => {
    switch (type) {
      case 'clock_weather':
      case 'weather':
        return Sun;
      case 'clock':
        return Clock;
      case 'world_clock':
        return Globe;
      case 'countdown':
        return Hourglass;
      case 'photo_frame':
        return Image;
      case 'rss':
        return Rss;
      case 'quotes':
        return Quote;
      case 'embed':
        return Music;
      case 'textbox':
        return Type;
      case 'image':
        return Sparkles;
      case 'sticky_notes':
        return StickyNote;
      case 'chores':
        return CheckSquare;
      case 'meals':
        return Utensils;
      case 'kanban':
        return Kanban;
      default:
        return LayoutGrid;
    }
  };

  const getWidgetTypeLabel = (type: string) => {
    switch (type) {
      case 'clock_weather':
        return 'Clock & Weather';
      case 'weather':
        return 'Weather';
      case 'clock':
        return 'Clock';
      case 'world_clock':
        return 'World Clock';
      case 'countdown':
        return 'Milestone';
      case 'photo_frame':
        return 'Photo Frame';
      case 'rss':
        return 'RSS Feed';
      case 'quotes':
        return 'Inspiration';
      case 'embed':
        return 'Media Player';
      case 'textbox':
        return 'Text Heading';
      case 'image':
        return 'Image / GIF';
      case 'sticky_notes':
        return 'Notes Tile';
      case 'chores':
        return 'Chores & Rewards';
      case 'meals':
        return 'Meal Planner';
      case 'kanban':
        return 'Project Kanban';
      default:
        return 'Widget';
    }
  };

  const renderWidgetContent = (widget: DashboardWidget, isLight: boolean = false) => {
    switch (widget.type) {
      case 'clock_weather':
        return (
          <ClockWeatherWidget
            locationName={widget.config?.locationName}
            latitude={widget.config?.latitude}
            longitude={widget.config?.longitude}
            unit={widget.config?.unit || 'F'}
            clockFace={widget.config?.clockFace || widget.config?.face || 'digital'}
            showSeconds={widget.config?.showSeconds ?? true}
            timezone={widget.config?.timezone}
            clockAlign={widget.config?.clockAlign || 'center'}
            isLight={isLight}
          />
        );
      case 'clock':
        return (
          <ClockWidget
            clockFace={widget.config?.clockFace || 'digital'}
            showSeconds={widget.config?.showSeconds ?? true}
            isLight={isLight}
          />
        );
      case 'world_clock':
        return (
          <WorldClockWidget
            cities={widget.config?.cities}
            clockFace={widget.config?.clockFace || 'digital'}
            showSeconds={widget.config?.showSeconds ?? true}
            isLight={isLight}
            onUpdateConfig={(updates) => {
              if (onUpdateWidget) {
                onUpdateWidget(widget.id, {
                  config: { ...widget.config, ...updates },
                });
              }
            }}
          />
        );
      case 'weather':
        return (
          <WeatherWidget
            locationName={widget.config?.locationName}
            latitude={widget.config?.latitude}
            longitude={widget.config?.longitude}
            unit={widget.config?.unit || 'F'}
            isLight={isLight}
          />
        );
      case 'countdown':
        return (
          <CountdownWidget
            eventName={widget.title || widget.config?.eventName}
            targetDate={widget.config?.targetDate}
            isLight={isLight}
          />
        );
      case 'calendar':
        return (
          <CalendarWidget
            sources={widget.config?.sources}
            defaultView={widget.config?.defaultView}
            multiDayLayout={widget.config?.multiDayLayout}
            isLight={isLight}
          />
        );
      case 'photo_frame':
        return (
          <div className="h-44 w-full">
            <PhotoFrameWidget
              widgetId={widget.id}
              useCommonSource={widget.config?.useCommonSource}
              initialStyle={widget.config?.displayStyle || 'ken_burns'}
              rotationIntervalSec={widget.config?.rotationIntervalSec || 15}
              customPhotos={widget.config?.customPhotos}
              sourceType={widget.config?.sourceType}
              curatedCategoryId={widget.config?.curatedCategoryId}
              initialSourceLabel={widget.config?.sourceLabel}
              initialPolaroidCount={widget.config?.polaroidCount || 12}
              initialPolaroidSizeMode={widget.config?.polaroidSizeMode || 'mixed'}
              photoOrder={widget.config?.photoOrder || 'random'}
              showCaptions={widget.config?.showCaptions ?? true}
              showDateTaken={widget.config?.showDateTaken}
              mosaicKenBurns={widget.config?.mosaicKenBurns ?? false}
            />
          </div>
        );
      case 'rss':
        return (
          <div className="max-h-48 overflow-y-auto">
            <RssWidget
              feedUrl={widget.config?.feedUrl}
              textSize={widget.config?.textSize}
              showSnippet={widget.config?.showSnippet !== false}
              isLight={isLight}
            />
          </div>
        );
      case 'quotes':
        return (
          <QuotesWidget
            customQuotes={widget.config?.customQuotes}
            quoteMode={widget.config?.quoteMode}
            rotationIntervalSec={widget.config?.rotationIntervalSec ?? widget.config?.quoteIntervalSec}
            isLight={isLight}
          />
        );
      case 'embed':
        return (
          <MediaEmbedWidget
            preset={widget.config?.preset || 'lofi'}
            customUrl={widget.config?.customUrl}
            muted={widget.config?.muted ?? true}
            latitude={widget.config?.latitude}
            longitude={widget.config?.longitude}
          />
        );
      case 'textbox': {
        const isFrameless = isWidgetStickerMode(widget, settings.defaultWidgetStyle || 'auto');
        return (
          <TextBoxWidget
            content={widget.config?.content}
            fontSize={widget.config?.fontSize}
            fontWeight={widget.config?.fontWeight}
            textAlign={widget.config?.textAlign}
            fontFamily={widget.config?.fontFamily}
            textColor={widget.config?.textColor}
            textShadow={widget.config?.textShadow}
            textTransform={widget.config?.textTransform}
            letterSpacing={widget.config?.letterSpacing}
            bgStyle={widget.config?.bgStyle}
            transparentBg={isFrameless}
            isLight={isLight}
          />
        );
      }
      case 'image': {
        const isFrameless = isWidgetStickerMode(widget, settings.defaultWidgetStyle || 'auto');
        return (
          <div className="h-44 w-full">
            <ImageWidget
              id={widget.id}
              config={{ ...(widget.config || {}), transparentBg: isFrameless }}
              onUpdateConfig={(updates) => onUpdateWidget?.(widget.id, { config: { ...widget.config, ...updates } })}
            />
          </div>
        );
      }
      case 'sticky_notes':
        return (
          <div className="p-3 text-xs text-gray-400 bg-gray-950/60 rounded-xl text-center">
            Notes Collection Tile ({activeNotes.length} notes active on this board).
          </div>
        );
      case 'chores':
        return (
          <div className="max-h-96 overflow-y-auto">
            <ChoreWidget
              title={widget.title}
              config={widget.config}
              isLight={isLight}
              variant="tile"
              onUpdateConfig={(updates) =>
                onUpdateWidget?.(widget.id, { config: { ...widget.config, ...updates } })
              }
            />
          </div>
        );
      case 'meals':
        return (
          <div className="max-h-96 overflow-y-auto">
            <MealPlannerWidget
              title={widget.title}
              config={widget.config}
              isLight={isLight}
              onUpdateConfig={(updates) =>
                onUpdateWidget?.(widget.id, { config: { ...widget.config, ...updates } })
              }
            />
          </div>
        );
      case 'kanban':
        return (
          <div className="h-[26rem] overflow-hidden">
            <KanbanWidget
              widgetId={widget.id}
              title={widget.title}
              config={widget.config}
              isLight={isLight}
              onUpdateConfig={(updates) =>
                onUpdateWidget?.(widget.id, { config: { ...widget.config, ...updates } })
              }
            />
          </div>
        );
      default:
        return (
          <div className="p-3 text-xs text-gray-500 text-center">
            Widget details available in settings.
          </div>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 w-full h-[100dvh] bg-[#090d16] text-white flex flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-36 mobile-companion-scroll overscroll-y-contain z-30">
        {/* Top Mobile Bar with Clickable Version Tag */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Ambiently Logo" width={32} height={32} className="w-8 h-8 rounded-lg shadow-sm" />
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
                {userEmail && syncRefusal ? (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 whitespace-nowrap">
                    Not syncing
                  </span>
                ) : userEmail ? (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Synced
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleDesktopView}
              title="Switch to full kiosk desktop view"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-xs text-gray-300 font-medium transition-all cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-blue-400" />
              <span>Kiosk</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white cursor-pointer"
              title={isSettingsPinRequired(settings) ? 'Settings & Lock (PIN Protected)' : 'Settings & Boards'}
            >
              {isSettingsPinRequired(settings) ? (
                <Lock className="w-4 h-4 text-blue-400" />
              ) : (
                <Settings className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Unconnected Phone Banner */}
        {!userEmail && (
          <div className="p-2.5 mb-2.5 rounded-xl bg-gradient-to-r from-blue-950/50 via-cyan-950/30 to-gray-900 border border-blue-500/30 flex items-center justify-between gap-2.5 shrink-0 shadow-md">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Connect to Your Smart Display</span>
              </div>
              <p className="text-[10px] text-gray-300 truncate mt-0.5">
                Sign in with your verified email to sync live with your display.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-[11px] transition-all flex items-center gap-1 cursor-pointer shadow"
                title="Sign in with Cloud Sync"
              >
                <Cloud className="w-3 h-3" />
                <span>Sign In</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-1.5 mb-2.5 no-scrollbar shrink-0 min-h-[44px]">
          {tabs.map((tab, idx) => {
            const hasExplicitHome = tabs.some((t) => t.isHome);
            const isHome = tab.isHome || (!hasExplicitHome && idx === 0);
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                  tab.id === activeTabId
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-gray-800/60 text-gray-400 hover:text-gray-200'
                }`}
              >
                {isHome && <Home className="w-3.5 h-3.5 text-purple-400" />}
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Persistent View Option Filter: All Tiles | Widgets | Notes & Tasks */}
        <div className="flex items-center justify-between bg-gray-900/90 p-1 rounded-xl border border-gray-800 mb-3 shrink-0">
          {(
            [
              { id: 'all', label: 'All Tiles', count: sortedWidgets.length + activeNotes.length },
              { id: 'widgets', label: 'Widgets', count: sortedWidgets.length },
              { id: 'notes', label: 'Notes & Tasks', count: activeNotes.length },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSetViewMode(v.id)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                viewMode === v.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>{v.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  viewMode === v.id ? 'bg-black/25 text-white' : 'bg-gray-800 text-gray-500'
                }`}
              >
                {v.count}
              </span>
            </button>
          ))}
        </div>

        {/* Quick Add Sticky Note Bar (Visible in 'all' and 'notes' view modes) */}
        {(viewMode === 'all' || viewMode === 'notes') && (
          <div className="p-3 rounded-2xl bg-gray-900/80 border border-gray-800 shadow-xl mb-4 shrink-0">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Quick Add Note / Task
            </span>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder={
                  isShoppingList
                    ? 'Add grocery item to Shopping List note...'
                    : isChecklist
                    ? 'Add checklist task...'
                    : 'Type note...'
                }
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleQuickAdd}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white rounded-xl shadow transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setIsChecklist(!isChecklist && !isShoppingList);
                    setIsShoppingList(false);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
                    isChecklist && !isShoppingList
                      ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                      : 'text-gray-500'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Checklist
                </button>
                <button
                  onClick={() => {
                    const next = !isShoppingList;
                    setIsShoppingList(next);
                    setIsChecklist(next);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer ${
                    isShoppingList
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                      : 'text-gray-500'
                  }`}
                >
                  <span>🛒 Shopping List</span>
                </button>
              </div>
              <span>Instantly syncs to canvas</span>
            </div>
          </div>
        )}

        {/* Unified Vertical Stream Container */}
        <div className="space-y-4 w-full shrink-0">
          {/* SECTION 1: WIDGET TILES (Shown if in 'all' or 'widgets' view) */}
          {(viewMode === 'all' || viewMode === 'widgets') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <LayoutGrid className="w-3.5 h-3.5 text-blue-400" />
                  Canvas Widgets ({sortedWidgets.length})
                </span>
                {onAddWidget && (
                  <button
                    type="button"
                    onClick={() => setIsAddWidgetOpen(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tile</span>
                  </button>
                )}
              </div>

              {sortedWidgets.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500 bg-gray-950/40 rounded-2xl border border-gray-800/40">
                  No widgets on this canvas. Tap "+ Add Tile" to add one!
                </div>
              ) : (
                sortedWidgets.map((widget, idx) => {
                  const currentTab = tabs.find((t) => t.id === activeTabId);
                  const isCanvasLight = isCanvasThemeLight(currentTab?.backgroundTheme);
                  const widgetThemeMode = (widget.config?.themeMode as WidgetThemeMode) || 'auto';
                  const isWidgetLight = widgetThemeMode === 'light' || (widgetThemeMode === 'auto' && isCanvasLight);

                  const IconComp = getWidgetIcon(widget.type);
                  const isFirst = idx === 0;
                  const isLast = idx === sortedWidgets.length - 1;

                  return (
                    <div
                      key={widget.id}
                      className={`rounded-2xl p-3.5 shadow-xl space-y-3 transition-all ${
                        isWidgetLight
                          ? 'bg-white/95 border border-slate-200/90 text-slate-800'
                          : 'bg-gray-900/90 border border-gray-800 text-gray-200'
                      }`}
                    >
                      {/* Widget Header with Icon, Title, and Action Controls */}
                      <div className={`flex items-center justify-between border-b pb-2 ${isWidgetLight ? 'border-slate-200' : 'border-gray-800/80'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 rounded-lg border shrink-0 ${isWidgetLight ? 'bg-slate-100 border-slate-300 text-blue-600' : 'bg-black/50 border-white/5 text-blue-400'}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <span className={`font-bold text-xs block truncate ${isWidgetLight ? 'text-slate-900' : 'text-white'}`}>
                              {widget.title}
                            </span>
                            <span className={`text-[10px] uppercase tracking-wider font-mono ${isWidgetLight ? 'text-slate-500' : 'text-gray-400'}`}>
                              {getWidgetTypeLabel(widget.type)}
                            </span>
                          </div>
                        </div>

                        {/* Controls: Reorder ▲ / ▼, Edit ⚙️, Delete 🗑️ */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Move Up */}
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => handleMoveWidget(widget.id, 'up')}
                            title="Move tile up in mobile order"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Move Down */}
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => handleMoveWidget(widget.id, 'down')}
                            title="Move tile down in mobile order"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Configure Settings ⚙️ */}
                          <button
                            type="button"
                            onClick={() => setEditingWidget(widget)}
                            title="Configure widget settings"
                            className="p-1.5 rounded-lg text-blue-400 hover:text-white hover:bg-blue-600/30 transition-all cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>

                          {/* Remove Widget 🗑️ */}
                          {onRemoveWidget && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remove "${widget.title}" from this canvas?`)) {
                                  onRemoveWidget(widget.id);
                                }
                              }}
                              title="Remove widget from canvas"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Widget Body Content */}
                      <div className={`min-h-12 overflow-hidden rounded-xl p-2.5 border ${
                        isWidgetLight
                          ? 'bg-slate-50/90 border-slate-200'
                          : 'bg-gray-950/60 border-gray-800/40'
                      }`}>
                        {renderWidgetContent(widget, isWidgetLight)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* SECTION 2: STICKY NOTES & CHECKLISTS (Shown if in 'all' or 'notes' view) */}
          {(viewMode === 'all' || viewMode === 'notes') && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-amber-400" />
                Sticky Notes & Checklists ({activeNotes.length})
              </span>

              {activeNotes.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500 bg-gray-950/40 rounded-2xl border border-gray-800/40">
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
                              className="p-1 rounded hover:bg-black/10 text-gray-700 cursor-pointer"
                              title="Edit note"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSaveInlineEdit(note)}
                                className="p-1 rounded bg-emerald-700 text-white cursor-pointer"
                                title="Save changes"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditingNoteId(null)}
                                className="p-1 rounded bg-black/20 text-gray-800 cursor-pointer"
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
                                  className="p-1 rounded bg-red-600/20 text-red-700 hover:bg-red-600/30 cursor-pointer"
                                  title="Delete note"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {note.isShoppingList || note.freeformPos?.isShoppingList ? (
                        <ShoppingListNoteBody
                          note={note}
                          onUpdateItems={(nextItems) =>
                            onUpdateNote(note.id, { checklistItems: nextItems })
                          }
                          onToggleItem={(itemId) => toggleItem(note, itemId)}
                        />
                      ) : note.isChecklist && note.checklistItems ? (
                        <div className="space-y-2 mt-1">
                          {note.checklistItems.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-1.5">
                              <button
                                onClick={() => toggleItem(note, item.id)}
                                className="flex items-center gap-2 text-xs flex-1 text-left cursor-pointer"
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
                                className="px-2.5 py-1 bg-gray-900 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Add
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingChecklistNoteId(note.id)}
                              className="text-[11px] font-semibold text-gray-700 hover:text-black flex items-center gap-1 pt-1 cursor-pointer"
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
          )}
        </div>

        {/* Bottom breathing room spacer for mobile home indicators & scrolling */}
        <div className="h-20 shrink-0" />
      </div>

      <React.Suspense fallback={null}>
        {/* Changelog Modal */}
        {isChangelogOpen && (
          <ChangelogModal
            isOpen={isChangelogOpen}
            onClose={() => setIsChangelogOpen(false)}
          />
        )}

        {/* Widget Settings Modal for modifying tiles on mobile */}
        {editingWidget && (
          <WidgetSettingsModal
            isOpen={Boolean(editingWidget)}
            onClose={() => setEditingWidget(null)}
            widget={editingWidget}
            onOpenPhotoSources={(asCommonSource) => {
              if (editingWidget) {
                const latestWidget =
                  useDashboardStore.getState().widgets.find((w) => w.id === editingWidget.id) ||
                  editingWidget;
                setPhotoSourcesTarget({
                  widget: latestWidget,
                  isCommon:
                    asCommonSource !== undefined
                      ? asCommonSource
                      : latestWidget.config?.useCommonSource !== false,
                });
              }
            }}
            onSave={(widgetId, updates) => {
              if (onUpdateWidget) {
                onUpdateWidget(widgetId, updates);
              }
              setEditingWidget(null);
            }}
          />
        )}

        {/* Photo Sources Modal when triggered from mobile widget settings */}
        {photoSourcesTarget && (() => {
          const activePhotoWidget =
            widgets.find((w) => w.id === photoSourcesTarget.widget.id) || photoSourcesTarget.widget;
          const isUsingCommon = photoSourcesTarget.isCommon;

          return (
            <PhotoSourcesModal
              isOpen={Boolean(photoSourcesTarget)}
              onClose={() => setPhotoSourcesTarget(null)}
              targetWidgetId={isUsingCommon ? undefined : activePhotoWidget.id}
              isCommonSource={isUsingCommon}
              initialWebUrls={
                (isUsingCommon
                  ? (settings.commonPhotoSourceType === 'web' ? settings.commonPhotoSourceUrl : '')
                  : (activePhotoWidget.config?.sourceType === 'web' ? activePhotoWidget.config?.sourceUrl : '')) || ''
              }
              currentSourceLabel={
                isUsingCommon
                  ? settings.commonPhotoSourceLabel ||
                    (settings.commonPhotos?.length ? 'Shared Library' : undefined)
                  : activePhotoWidget.config?.sourceLabel
              }
              currentSourceType={
                isUsingCommon
                  ? settings.commonPhotoSourceType
                  : activePhotoWidget.config?.sourceType
              }
              currentCuratedCategoryId={
                isUsingCommon
                  ? settings.commonPhotoCuratedCategory
                  : activePhotoWidget.config?.curatedCategoryId
              }
              currentPhotoCount={
                isUsingCommon
                  ? settings.commonPhotos?.length
                  : activePhotoWidget.config?.customPhotos?.length
              }
              onPhotosLoaded={(newPhotos, sourceName, sourceUrl, sourceType, applyToAll, plexSyncConfig, curatedCategoryId) => {
                if (applyToAll) {
                  applyCommonPhotosToAllWidgets(
                    newPhotos,
                    sourceName,
                    sourceUrl,
                    sourceType,
                    plexSyncConfig,
                    curatedCategoryId,
                    activePhotoWidget.id
                  );
                } else if (onUpdateWidget && newPhotos.length > 0) {
                  const latestPhotoWidget =
                    useDashboardStore.getState().widgets.find((w) => w.id === activePhotoWidget.id) ||
                    activePhotoWidget;
                  onUpdateWidget(latestPhotoWidget.id, {
                    config: {
                      ...latestPhotoWidget.config,
                      useCommonSource: false,
                      customPhotos: newPhotos,
                      sourceLabel: sourceName,
                      sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
                      sourceType: sourceType || latestPhotoWidget.config?.sourceType,
                      curatedCategoryId:
                        sourceType === 'curated'
                          ? (curatedCategoryId || inferCuratedCategoryId(undefined, sourceName) || 'all')
                          : undefined,
                      plexSyncConfig: sourceType === 'plex' ? plexSyncConfig : undefined,
                    },
                  });
                }
              }}
            />
          );
        })()}

        {/* Add Widget Modal for adding new tiles directly from mobile */}
        {onAddWidget && isAddWidgetOpen && (
          <AddWidgetModal
            isOpen={isAddWidgetOpen}
            onClose={() => setIsAddWidgetOpen(false)}
            activeTabId={activeTabId}
            onAddWidget={(newWidget) => {
              onAddWidget(newWidget);
              setIsAddWidgetOpen(false);
            }}
          />
        )}
      </React.Suspense>
    </>
  );
};
