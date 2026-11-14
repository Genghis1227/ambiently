import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Settings,
  Check,
  FolderOpen,
  Plus,
  Trash2,
  Search,
  Calendar,
  Tv,
  Quote,
  Globe,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ImageIcon,
  Share2,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
  Sun,
  Moon,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Columns,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { resolveCuratedPhotos } from '../../services/photos';
import { normalizeTileOnlyWidgetConfig } from '../../utils/photoSourceIsolation';
import { photoSyncService } from '../../services/photoSyncService';
import {
  formatCooldownRemaining,
  formatRelativeSyncTime,
  getManualRescanCooldownRemainingMs,
  getPhotoSyncTargetKey,
  isTargetRescannable,
} from '../../utils/photoSyncPolicy';
import { isWidgetStickerMode } from '../../utils/widgetStickerMode';
import type { DashboardWidget, ImageWidgetConfig, WidgetThemeMode } from '../../types/dashboard';
import { type CalendarSource, normalizeCalendarUrl, testCalendarFeed } from '../../services/feeds';
import { CalendarUrlGuideModal } from '../calendar/CalendarUrlGuideModal';
import type { QuoteItem } from '../../services/quotes';
import { EMBED_PRESETS, type EmbedPresetId } from './MediaEmbedWidget';
import { DEFAULT_WORLD_CITIES, type WorldClockCity, getZoneOffsetMinutes } from './WorldClockWidget';
import type { TextBoxConfig } from './TextBoxWidget';
import { CURATED_RSS_FEEDS, RSS_FEED_CATEGORIES, type RssFeedCategory } from '../../data/curatedFeeds';
import { MediaSearchModal, type MediaSelectionMeta } from './MediaSearchModal';
import { resolveOptimizedImageMedia } from '../../utils/mediaOptimization';
import { useVaultMediaUrl } from '../../utils/localMediaVault';
import { Sparkles, Utensils, Kanban } from 'lucide-react';
import { useChoreStore } from '../../store/choreStore';
import { useMealStore } from '../../stores/useMealStore';
import { useKanbanStore } from '../../stores/useKanbanStore';
import type { MealSlot, WeekStartDay, WidgetMealScope } from '../../types/meals';
import {
  DEFAULT_KANBAN_ACTIVE_COLUMN,
  KANBAN_COLUMNS,
  resolveWidgetActiveBoardId,
  resolveWidgetActiveColumnId,
  type KanbanColumnId,
} from '../../types/kanban';
import { HouseholdAvatar } from '../common/HouseholdAvatar';

interface WidgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: DashboardWidget | null;
  onSave: (
    widgetId: string,
    updates: {
      title?: string;
      config: Record<string, any>;
      freeformPos?: DashboardWidget['freeformPos'];
    }
  ) => void;
  onOpenPhotoSources?: (asCommonSource?: boolean) => void;
}

interface GeoHit {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

const DEFAULT_CALENDAR_SOURCES: CalendarSource[] = [
  {
    id: 'us-holidays',
    name: 'US Holidays',
    url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics',
    color: '#3b82f6',
    enabled: true,
  },
];

const CALENDAR_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#ef4444', // Red
];

export const WidgetSettingsModal: React.FC<WidgetSettingsModalProps> = ({
  isOpen,
  onClose,
  widget,
  onSave,
  onOpenPhotoSources,
}) => {
  const settings = useDashboardStore((state) => state.settings);
  const applyCommonPhotosToAllWidgets = useDashboardStore((state) => state.applyCommonPhotosToAllWidgets);
  const photoSyncState = useDashboardStore((state) => state.photoSyncState);
  const photoSyncMeta = useDashboardStore((state) => state.photoSyncMeta);
  const [photoSyncNowTick, setPhotoSyncNowTick] = useState<number>(() => Date.now());
  const [photoRescanNotice, setPhotoRescanNotice] = useState<string>('');
  const [title, setTitle] = useState('');
  const [themeMode, setThemeMode] = useState<WidgetThemeMode>('auto');
  const [widgetTransparentBg, setWidgetTransparentBg] = useState<boolean>(false);

  // Countdown states
  const [countdownDate, setCountdownDate] = useState('');
  const [countdownTime, setCountdownTime] = useState('00:00');

  // Photo Frame states
  const [useCommonSource, setUseCommonSource] = useState<boolean>(true);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string>('');
  const [photoStyle, setPhotoStyle] = useState<string>('ken_burns');
  const [photoIntervalSec, setPhotoIntervalSec] = useState<number>(15);
  const [polaroidCount, setPolaroidCount] = useState<number>(widget?.config?.polaroidCount || 12);
  const [polaroidSizeMode, setPolaroidSizeMode] = useState<'mixed' | 'uniform' | 'small' | 'large'>(widget?.config?.polaroidSizeMode || 'mixed');
  const [photoOrder, setPhotoOrder] = useState<'random' | 'sequential'>('random');
  const [showCaptions, setShowCaptions] = useState<boolean>(widget?.config?.showCaptions ?? true);
  const [showDateTaken, setShowDateTaken] = useState<boolean>(widget?.config?.showDateTaken ?? false);
  const [mosaicKenBurns, setMosaicKenBurns] = useState<boolean>(widget?.config?.mosaicKenBurns ?? false);

  // Weather & Clock states
  const [locationName, setLocationName] = useState('Austin, TX');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const [latitude, setLatitude] = useState<number>(30.2672);
  const [longitude, setLongitude] = useState<number>(-97.7431);
  const [timezone, setTimezone] = useState<string>('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [geoHits, setGeoHits] = useState<GeoHit[]>([]);

  // Clock & World Clock states
  const [clockFace, setClockFace] = useState<'digital' | 'minimal' | 'analog'>('digital');
  const [showSeconds, setShowSeconds] = useState(true);
  const [clockAlign, setClockAlign] = useState<'center' | 'left'>('center');
  const [worldCities, setWorldCities] = useState<WorldClockCity[]>(DEFAULT_WORLD_CITIES);
  const [worldCitySearch, setWorldCitySearch] = useState('');
  const [cityDragIndex, setCityDragIndex] = useState<number | null>(null);
  const [cityDragOverIndex, setCityDragOverIndex] = useState<number | null>(null);

  // RSS states
  const [rssFeedUrl, setRssFeedUrl] = useState('');
  const [rssTextSize, setRssTextSize] = useState<'auto' | 'sm' | 'base' | 'lg' | 'xl'>('auto');

  // Calendar states
  const [calendarDefaultView, setCalendarDefaultView] = useState<'agenda' | '3day' | 'week' | 'month'>('agenda');
  const [multiDayLayout, setMultiDayLayout] = useState<'cards' | 'timeline'>(widget?.config?.multiDayLayout || 'cards');
  const [calendarShowMeals, setCalendarShowMeals] = useState<boolean>(true);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>(DEFAULT_CALENDAR_SOURCES);
  const [newCalName, setNewCalName] = useState('');
  const [newCalUrl, setNewCalUrl] = useState('');
  const [calCheck, setCalCheck] = useState<{ status: 'idle' | 'checking' | 'ok' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [newCalColor, setNewCalColor] = useState(CALENDAR_COLORS[0]);
  const [isCalendarGuideOpen, setIsCalendarGuideOpen] = useState(false);

  // Embed states
  const [embedPreset, setEmbedPreset] = useState<EmbedPresetId>('lofi');
  const [embedCustomUrl, setEmbedCustomUrl] = useState('');
  const [embedMuted, setEmbedMuted] = useState(true);

  // Quotes states
  const [quoteMode, setQuoteMode] = useState<'curated' | 'custom' | 'both'>('both');
  const [quoteIntervalSec, setQuoteIntervalSec] = useState<number>(3600);
  const [customQuotes, setCustomQuotes] = useState<QuoteItem[]>([]);
  const [newQuoteText, setNewQuoteText] = useState('');
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('');

  // Text Box states
  const [textContent, setTextContent] = useState('');
  const [textFontSize, setTextFontSize] = useState<NonNullable<TextBoxConfig['fontSize']>>('2xl');
  const [textFontWeight, setTextFontWeight] = useState<NonNullable<TextBoxConfig['fontWeight']>>('bold');
  const [textAlignment, setTextAlignment] = useState<NonNullable<TextBoxConfig['textAlign']>>('center');
  const [textFamily, setTextFamily] = useState<NonNullable<TextBoxConfig['fontFamily']>>('sans');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textShadow, setTextShadow] = useState(true);
  const [textTransform, setTextTransform] = useState<NonNullable<TextBoxConfig['textTransform']>>('none');
  const [letterSpacing, setLetterSpacing] = useState<NonNullable<TextBoxConfig['letterSpacing']>>('normal');
  const [textBgStyle, setTextBgStyle] = useState<NonNullable<TextBoxConfig['bgStyle']>>('transparent');
  const [textTransparentBg, setTextTransparentBg] = useState<boolean>(true);

  // Single Image / GIF states
  const [imageUrl, setImageUrl] = useState('');
  const [imageMp4Url, setImageMp4Url] = useState<string | undefined>(undefined);
  const [imageMediaSource, setImageMediaSource] = useState<ImageWidgetConfig['mediaSource'] | undefined>(undefined);
  const [imageFit, setImageFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [imageCaption, setImageCaption] = useState('');
  const [imageTransparentBg, setImageTransparentBg] = useState(true);
  const [imageLinkUrl, setImageLinkUrl] = useState('');
  const [isMediaSearchOpen, setIsMediaSearchOpen] = useState(false);
  const { resolvedUrl: resolvedImagePreviewUrl } = useVaultMediaUrl(imageUrl);
  const previewMedia = resolveOptimizedImageMedia({
    url: resolvedImagePreviewUrl,
    mp4Url: imageMp4Url,
    mediaSource: imageMediaSource,
  });

  // Chores widget states
  const choreProfiles = useChoreStore((s) => s.snapshot.profiles);
  const setChoreParentDrawerOpen = useChoreStore((s) => s.setParentDrawerOpen);
  const [choreDisplayMode, setChoreDisplayMode] = useState<'tile' | 'hub'>('tile');
  const [choreScope, setChoreScope] = useState<string>('household');
  const [choreIncludeParents, setChoreIncludeParents] = useState<boolean>(false);
  const [choreExpandedSections, setChoreExpandedSections] = useState<('today' | 'review' | 'completed')[]>([
    'today',
    'review',
  ]);

  // Meal Planner widget states
  const boardNotes = useDashboardStore((state) => state.notes);
  const [mealScope, setMealScope] = useState<WidgetMealScope>('three_day');
  const [mealWeekStartsOn, setMealWeekStartsOn] = useState<WeekStartDay>('sunday');
  const [mealVisibleSlots, setMealVisibleSlots] = useState<MealSlot[]>([
    'breakfast',
    'lunch',
    'dinner',
  ]);
  const [mealShowCookAvatar, setMealShowCookAvatar] = useState<boolean>(true);
  const [mealListNoteId, setMealListNoteId] = useState<string>('');

  // Kanban widget states
  const kanbanBoards = useKanbanStore((s) => s.boards);
  const [kanbanBoardId, setKanbanBoardId] = useState<string>('');
  const [kanbanColumnId, setKanbanColumnId] = useState<KanbanColumnId>(DEFAULT_KANBAN_ACTIVE_COLUMN);
  const [kanbanDisplayMode, setKanbanDisplayMode] = useState<'tile' | 'view'>('tile');
  const [rssCategoryFilter, setRssCategoryFilter] = useState<'All' | RssFeedCategory>('All');
  const [rssSearchQuery, setRssSearchQuery] = useState('');

  // Prevents re-renders or background photo syncs from resetting active form edits while modal is open
  const lastOpenedWidgetIdRef = useRef<string | null>(null);

  // Populate initial state when modal opens with a widget
  useEffect(() => {
    if (!isOpen || !widget) {
      lastOpenedWidgetIdRef.current = null;
      return;
    }

    // Only populate on initial open or when editing a different widget instance
    if (lastOpenedWidgetIdRef.current === widget.id) {
      return;
    }
    lastOpenedWidgetIdRef.current = widget.id;

    const resolvedStickerMode = isWidgetStickerMode(
      widget,
      settings.defaultWidgetStyle || 'auto'
    );
    setTitle(widget.title || '');
    setThemeMode((widget.config?.themeMode as WidgetThemeMode) || 'auto');
    setWidgetTransparentBg(resolvedStickerMode);
    setGeoStatus('');
    setGeoHits([]);

    if (widget.type === 'countdown') {
      const targetStr = widget.config?.targetDate || '2026-12-25T00:00:00Z';
      try {
        const d = new Date(targetStr);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        setCountdownDate(`${yyyy}-${mm}-${dd}`);
        setCountdownTime(`${hh}:${min}`);
      } catch {
        setCountdownDate('2026-12-25');
        setCountdownTime('00:00');
      }
    } else if (widget.type === 'photo_frame') {
      const explicitCommon = widget.config?.useCommonSource;
      if (explicitCommon !== undefined) {
        setUseCommonSource(explicitCommon);
      } else {
        const hasCustomPhotos = Boolean(widget.config?.customPhotos && widget.config.customPhotos.length > 0);
        const hasCommonLibrary = Boolean(settings.commonPhotos && settings.commonPhotos.length > 0);
        setUseCommonSource(hasCommonLibrary ? true : !hasCustomPhotos);
      }
      setPhotoStyle(widget.config?.displayStyle || 'ken_burns');
      setPhotoIntervalSec(widget.config?.rotationIntervalSec || 15);
      setPolaroidCount(widget.config?.polaroidCount || 12);
      setPolaroidSizeMode(widget.config?.polaroidSizeMode || 'mixed');
      setPhotoOrder(widget.config?.photoOrder || 'random');
      setShowCaptions(widget.config?.showCaptions ?? true);
      setShowDateTaken(widget.config?.showDateTaken ?? false);
      setMosaicKenBurns(widget.config?.mosaicKenBurns ?? false);
    } else if (widget.type === 'weather' || widget.type === 'clock_weather') {
      setLocationName(widget.config?.locationName || 'Austin, TX');
      setTempUnit(widget.config?.unit || 'F');
      setLatitude(widget.config?.latitude ?? 30.2672);
      setLongitude(widget.config?.longitude ?? -97.7431);
      setTimezone(widget.config?.timezone || '');
      setClockFace(widget.config?.clockFace || widget.config?.face || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
      setClockAlign(widget.config?.clockAlign || 'center');
    } else if (widget.type === 'clock') {
      setClockFace(widget.config?.clockFace || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
      setClockAlign(widget.config?.clockAlign || 'center');
      setTimezone(widget.config?.timezone || '');
      setLocationName(widget.config?.locationName || '');
    } else if (widget.type === 'world_clock') {
      setClockFace(widget.config?.clockFace || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
      setWorldCities(
        Array.isArray(widget.config?.cities) && widget.config.cities.length > 0
          ? widget.config.cities
          : DEFAULT_WORLD_CITIES
      );
      setWorldCitySearch('');
    } else if (widget.type === 'rss') {
      setRssFeedUrl(widget.config?.feedUrl || 'https://tony.trinhism.com/index.xml');
      setRssTextSize(widget.config?.textSize || 'auto');
    } else if (widget.type === 'calendar') {
      setCalendarDefaultView(widget.config?.defaultView || 'agenda');
      setMultiDayLayout(widget.config?.multiDayLayout || 'cards');
      setCalendarShowMeals(widget.config?.showMeals !== false);
      setCalendarSources(
        Array.isArray(widget.config?.sources) && widget.config.sources.length > 0
          ? widget.config.sources
          : DEFAULT_CALENDAR_SOURCES
      );
      setNewCalName('');
      setNewCalUrl('');
      setCalCheck({ status: 'idle' });
    } else if (widget.type === 'embed') {
      setEmbedPreset(widget.config?.preset || 'lofi');
      setEmbedCustomUrl(widget.config?.customUrl || '');
      setEmbedMuted(widget.config?.muted ?? true);
    } else if (widget.type === 'quotes') {
      setQuoteMode(widget.config?.quoteMode || 'both');
      setCustomQuotes(Array.isArray(widget.config?.customQuotes) ? widget.config.customQuotes : []);
      setQuoteIntervalSec(widget.config?.rotationIntervalSec ?? widget.config?.quoteIntervalSec ?? 3600);
    } else if (widget.type === 'textbox') {
      setTextContent(widget.config?.content ?? 'Welcome to Ambiently\nSmart Display & Dashboard');
      setTextFontSize(widget.config?.fontSize || '2xl');
      setTextFontWeight(widget.config?.fontWeight || 'bold');
      setTextAlignment(widget.config?.textAlign || 'center');
      setTextFamily(widget.config?.fontFamily || 'sans');
      setTextColor(widget.config?.textColor || '#ffffff');
      setTextShadow(widget.config?.textShadow ?? true);
      setTextTransform(widget.config?.textTransform || 'none');
      setLetterSpacing(widget.config?.letterSpacing || 'normal');
      setTextTransparentBg(resolvedStickerMode);
      setTextBgStyle(
        resolvedStickerMode
          ? 'transparent'
          : widget.config?.bgStyle && widget.config.bgStyle !== 'transparent'
          ? widget.config.bgStyle
          : 'glass'
      );
    } else if (widget.type === 'image') {
      setImageUrl(widget.config?.url || '');
      setImageMp4Url(widget.config?.mp4Url || undefined);
      setImageMediaSource(widget.config?.mediaSource || undefined);
      setImageFit(widget.config?.fit || 'contain');
      setImageCaption(widget.config?.caption || '');
      setImageTransparentBg(resolvedStickerMode);
      setImageLinkUrl(widget.config?.linkUrl || '');
    } else if (widget.type === 'chores') {
      setChoreDisplayMode(
        widget.config?.displayMode === 'hub' || widget.freeformPos?.isFullScreen ? 'hub' : 'tile'
      );
      setChoreScope(widget.config?.scope || 'household');
      setChoreIncludeParents(Boolean(widget.config?.includeParents));
      setChoreExpandedSections(
        Array.isArray(widget.config?.defaultExpandedSections)
          ? widget.config.defaultExpandedSections
          : ['today', 'review']
      );
    } else if (widget.type === 'meals') {
      const cfgScope = widget.config?.scope;
      setMealScope(
        cfgScope === 'today' ||
          cfgScope === 'tomorrow' ||
          cfgScope === 'three_day' ||
          cfgScope === 'full_week'
          ? cfgScope
          : 'three_day'
      );
      const cfgWeekStart = widget.config?.weekStartsOn || useMealStore.getState().weekStartsOn;
      setMealWeekStartsOn(cfgWeekStart === 'monday' ? 'monday' : 'sunday');
      const validSlots: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
      const cfgSlots = Array.isArray(widget.config?.visibleSlots)
        ? (widget.config.visibleSlots as MealSlot[]).filter((s) => validSlots.includes(s))
        : validSlots;
      setMealVisibleSlots(cfgSlots.length > 0 ? cfgSlots : validSlots);
      setMealShowCookAvatar(widget.config?.showCookAvatar !== false);
      setMealListNoteId(typeof widget.config?.listNoteId === 'string' ? widget.config.listNoteId : '');
    } else if (widget.type === 'kanban') {
      const allBoards = useKanbanStore.getState().boards;
      setKanbanBoardId(resolveWidgetActiveBoardId(widget.config, allBoards));
      setKanbanColumnId(resolveWidgetActiveColumnId(widget.config));
      setKanbanDisplayMode(widget.config?.displayMode === 'view' ? 'view' : 'tile');
    }
  }, [widget, isOpen, settings.commonPhotos, settings.defaultWidgetStyle]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || widget?.type !== 'photo_frame') return;
    setPhotoRescanNotice('');
    setPhotoSyncNowTick(Date.now());
    void photoSyncService.init();
    const timer = setInterval(() => setPhotoSyncNowTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [isOpen, widget?.type, widget?.id]);

  if (!isOpen || !widget) return null;

  const handleLookupCity = async (queryOverride?: string) => {
    const rawQuery = (queryOverride ?? locationName).trim();
    if (!rawQuery) return;
    setGeoLoading(true);
    setGeoStatus('Searching cities & timezones...');
    setGeoHits([]);
    try {
      const q = encodeURIComponent(rawQuery.split(',')[0]);
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`
      );
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const hits: GeoHit[] = data.results;
        setGeoHits(hits);
        const hit = hits[0];
        const formatted = hit.admin1
          ? `${hit.name}, ${hit.admin1}`
          : `${hit.name}, ${hit.country || ''}`;
        if (widget.type !== 'world_clock') {
          setLocationName(formatted);
          setLatitude(Number(hit.latitude.toFixed(4)));
          setLongitude(Number(hit.longitude.toFixed(4)));
          if (hit.timezone) setTimezone(hit.timezone);
          setGeoStatus(
            `Found: ${formatted}${hit.timezone ? ` • ${hit.timezone}` : ''}`
          );
        } else {
          setGeoStatus(`Select a city below to add or set its timezone:`);
        }
      } else {
        setGeoStatus('City not found. Try just the city name (e.g., Tokyo, London, Seattle).');
      }
    } catch {
      setGeoStatus('Failed to lookup city.');
    } finally {
      setGeoLoading(false);
    }
  };

  // Reads the calendar once before adding it, so a wrong or private link is caught here rather than
  // showing up later as an empty calendar
  const handleAddCalendarSource = async (skipCheck: boolean = false) => {
    if (!newCalUrl.trim()) return;
    const normalized = normalizeCalendarUrl(newCalUrl);
    if (skipCheck) {
      setCalCheck({ status: 'idle' });
    } else {
      setCalCheck({ status: 'checking' });
      const result = await testCalendarFeed(normalized.url);
      if (!result.ok) {
        setCalCheck({ status: 'error', message: result.error });
        return;
      }
      setCalCheck({
        status: 'ok',
        message: `Added. It has ${result.count} event${result.count === 1 ? '' : 's'} between 2 months ago and 3 months from now.`,
      });
    }
    const added: CalendarSource = {
      id: `cal-${Date.now()}`,
      name: newCalName.trim() || 'Custom Calendar',
      url: normalized.url,
      color: newCalColor,
      enabled: true,
    };
    setCalendarSources([...calendarSources, added]);
    setNewCalName('');
    setNewCalUrl('');
  };

  const handleToggleCalendarSource = (id: string) => {
    setCalendarSources(
      calendarSources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleRemoveCalendarSource = (id: string) => {
    setCalendarSources(calendarSources.filter((s) => s.id !== id));
  };

  const handleAddCustomQuote = () => {
    if (!newQuoteText.trim()) return;
    const item: QuoteItem = {
      id: `cq-${Date.now()}`,
      quote: newQuoteText.trim(),
      author: newQuoteAuthor.trim() || 'Family Affirmation',
    };
    setCustomQuotes([item, ...customQuotes]);
    setNewQuoteText('');
    setNewQuoteAuthor('');
  };

  const handleRemoveCustomQuote = (id: string) => {
    setCustomQuotes(customQuotes.filter((q) => q.id !== id));
  };

  const handleReorderCity = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= worldCities.length ||
      toIdx >= worldCities.length
    )
      return;
    const next = [...worldCities];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setWorldCities(next);
  };

  const handleMoveCity = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    handleReorderCity(idx, targetIdx);
  };

  const handleSortCitiesByOffset = () => {
    const now = new Date();
    const sorted = [...worldCities].sort((a, b) => {
      const offA = getZoneOffsetMinutes(now, a.timezone);
      const offB = getZoneOffsetMinutes(now, b.timezone);
      return offA - offB;
    });
    setWorldCities(sorted);
  };

  const handleSortCitiesByName = () => {
    const sorted = [...worldCities].sort((a, b) => a.cityName.localeCompare(b.cityName));
    setWorldCities(sorted);
  };

  const handleReverseCities = () => {
    setWorldCities([...worldCities].reverse());
  };

  const handleSave = () => {
    const configUpdates: Record<string, any> = {
      ...widget.config,
      themeMode,
    };

    if (
      [
        'clock',
        'world_clock',
        'clock_weather',
        'weather',
        'countdown',
        'quotes',
        'photo_frame',
      ].includes(widget.type)
    ) {
      configUpdates.transparentBg = widgetTransparentBg;
    }

    if (widget.type === 'countdown') {
      const dtString = `${countdownDate || '2026-12-25'}T${countdownTime || '00:00'}:00`;
      const iso = new Date(dtString).toISOString();
      configUpdates.eventName = title.trim() || 'Upcoming Milestone';
      configUpdates.targetDate = iso;
    } else if (widget.type === 'photo_frame') {
      if (useCommonSource) {
        configUpdates.useCommonSource = true;
        if (
          widget.config?.useCommonSource === false &&
          !(Array.isArray(widget.config?.customPhotos) && widget.config.customPhotos.length > 0)
        ) {
          configUpdates.sourceType = undefined;
          configUpdates.sourceLabel = undefined;
          configUpdates.sourceUrl = undefined;
          configUpdates.plexSyncConfig = undefined;
          configUpdates.curatedCategoryId = undefined;
        }
      } else {
        Object.assign(configUpdates, normalizeTileOnlyWidgetConfig(widget.config));
      }
      configUpdates.displayStyle = photoStyle;
      configUpdates.rotationIntervalSec = photoIntervalSec;
      configUpdates.polaroidCount = polaroidCount;
      configUpdates.polaroidSizeMode = polaroidSizeMode;
      configUpdates.photoOrder = photoOrder;
      configUpdates.showCaptions = showCaptions;
      configUpdates.showDateTaken = showDateTaken;
      configUpdates.mosaicKenBurns = mosaicKenBurns;
    } else if (widget.type === 'weather' || widget.type === 'clock_weather') {
      configUpdates.locationName = locationName.trim();
      configUpdates.unit = tempUnit;
      configUpdates.latitude = Number(latitude);
      configUpdates.longitude = Number(longitude);
      configUpdates.timezone = timezone || undefined;
      if (widget.type === 'clock_weather') {
        configUpdates.face = clockFace;
        configUpdates.clockFace = clockFace;
        configUpdates.showSeconds = showSeconds;
        configUpdates.clockAlign = clockAlign;
      }
    } else if (widget.type === 'clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
      configUpdates.clockAlign = clockAlign;
      configUpdates.timezone = timezone || undefined;
      configUpdates.locationName = locationName.trim() || undefined;
    } else if (widget.type === 'world_clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
      configUpdates.cities = worldCities.length > 0 ? worldCities : DEFAULT_WORLD_CITIES;
    } else if (widget.type === 'rss') {
      configUpdates.feedUrl = rssFeedUrl.trim();
      configUpdates.textSize = rssTextSize;
    } else if (widget.type === 'calendar') {
      configUpdates.defaultView = calendarDefaultView;
      configUpdates.multiDayLayout = multiDayLayout;
      configUpdates.showMeals = calendarShowMeals;
      configUpdates.sources = calendarSources;
    } else if (widget.type === 'embed') {
      configUpdates.preset = embedPreset;
      configUpdates.customUrl = embedCustomUrl.trim();
      configUpdates.muted = embedMuted;
    } else if (widget.type === 'quotes') {
      configUpdates.quoteMode = quoteMode;
      configUpdates.customQuotes = customQuotes;
      configUpdates.rotationIntervalSec = quoteIntervalSec;
      configUpdates.quoteIntervalSec = quoteIntervalSec;
    } else if (widget.type === 'textbox') {
      configUpdates.content = textContent;
      configUpdates.fontSize = textFontSize;
      configUpdates.fontWeight = textFontWeight;
      configUpdates.textAlign = textAlignment;
      configUpdates.fontFamily = textFamily;
      configUpdates.textColor = textColor;
      configUpdates.textShadow = textShadow;
      configUpdates.textTransform = textTransform;
      configUpdates.letterSpacing = letterSpacing;
      configUpdates.bgStyle = textTransparentBg ? 'transparent' : textBgStyle === 'transparent' ? 'glass' : textBgStyle;
      configUpdates.transparentBg = textTransparentBg;
    } else if (widget.type === 'image') {
      configUpdates.url = imageUrl.trim();
      configUpdates.mp4Url = imageMp4Url;
      configUpdates.mediaSource = imageMediaSource;
      configUpdates.fit = imageFit;
      configUpdates.caption = imageCaption.trim();
      configUpdates.transparentBg = imageTransparentBg;
      configUpdates.linkUrl = imageLinkUrl.trim();
    }

    let freeformPosUpdate: DashboardWidget['freeformPos'] | undefined;

    if (widget.type === 'chores') {
      configUpdates.displayMode = choreDisplayMode;
      configUpdates.scope = choreScope;
      configUpdates.includeParents = choreIncludeParents;
      configUpdates.defaultExpandedSections = choreExpandedSections;

      const existingPos = widget.freeformPos || {
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.45,
        hRatio: 0.55,
        zIndex: 5,
        rotation: 0,
      };
      const wasFullScreen =
        Boolean(widget.freeformPos?.isFullScreen) || widget.config?.displayMode === 'hub';

      if (choreDisplayMode === 'hub') {
        freeformPosUpdate = {
          ...existingPos,
          xRatio: 0,
          yRatio: 0,
          wRatio: 1,
          hRatio: 1,
          rotation: 0,
          isFullScreen: true,
        };
      } else if (wasFullScreen) {
        freeformPosUpdate = {
          ...existingPos,
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.45,
          hRatio: 0.55,
          rotation: 0,
          isFullScreen: false,
        };
      }
    } else if (widget.type === 'meals') {
      const orderedSlots: MealSlot[] = (['breakfast', 'lunch', 'dinner'] as const).filter((s) =>
        mealVisibleSlots.includes(s)
      );
      configUpdates.scope = mealScope;
      configUpdates.weekStartsOn = mealWeekStartsOn;
      configUpdates.visibleSlots =
        orderedSlots.length > 0 ? orderedSlots : ['breakfast', 'lunch', 'dinner'];
      configUpdates.showCookAvatar = mealShowCookAvatar;
      configUpdates.listNoteId = mealListNoteId || undefined;
      void useMealStore.getState().setWeekStartsOn(mealWeekStartsOn);
    } else if (widget.type === 'kanban') {
      const resolvedBoardId =
        kanbanBoardId || resolveWidgetActiveBoardId(widget.config, useKanbanStore.getState().boards);
      configUpdates.widgetInstanceId = widget.id;
      configUpdates.activeBoardId = resolvedBoardId;
      configUpdates.activeColumnId = kanbanColumnId;
      configUpdates.displayMode = kanbanDisplayMode;

      const existingPos = widget.freeformPos || {
        xRatio: 0.1,
        yRatio: 0.1,
        wRatio: 0.45,
        hRatio: 0.55,
        zIndex: 5,
        rotation: 0,
      };
      const wasFullScreen =
        Boolean(widget.freeformPos?.isFullScreen) || widget.config?.displayMode === 'view';

      if (kanbanDisplayMode === 'view') {
        freeformPosUpdate = {
          ...existingPos,
          xRatio: 0,
          yRatio: 0,
          wRatio: 1,
          hRatio: 1,
          rotation: 0,
          isFullScreen: true,
        };
      } else if (wasFullScreen) {
        freeformPosUpdate = {
          ...existingPos,
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.45,
          hRatio: 0.55,
          rotation: 0,
          isFullScreen: false,
        };
      }
    }

    onSave(widget.id, {
      title: title.trim() || widget.title,
      config: configUpdates,
      ...(freeformPosUpdate ? { freeformPos: freeformPosUpdate } : {}),
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onMouseDown={(e) => {
        (e.currentTarget as any).__backdropMouseDown =
          e.target === e.currentTarget &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && (e.currentTarget as any).__backdropMouseDown) {
          onClose();
        }
        (e.currentTarget as any).__backdropMouseDown = false;
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Tile Settings</h2>
              <p className="text-xs text-gray-400">Configure title and preferences for this tile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Universal Title Input */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
              Tile Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Vacation Countdown, Family Photos..."
              className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Tile Appearance & Color Theme */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
              Card Appearance & Theme
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setThemeMode('auto')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  themeMode === 'auto'
                    ? 'bg-blue-600/20 border-blue-500 text-white font-semibold shadow'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
              >
                <span className="text-xs font-semibold">Auto</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Inherits canvas</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode('light')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  themeMode === 'light'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold shadow'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold">Light</span>
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">Daylight card</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  themeMode === 'dark'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold shadow'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold">Dark</span>
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">Night slate card</span>
              </button>
            </div>

            {[
              'clock',
              'world_clock',
              'clock_weather',
              'weather',
              'countdown',
              'quotes',
              'photo_frame',
            ].includes(widget.type) && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800/60">
                <div>
                  <span className="text-xs text-gray-300 block font-semibold">
                    Sticker / No Outline Mode
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {widget.type === 'photo_frame'
                      ? 'Removes the outer card mat (and Polaroid backdrop) so photos float cleanly on canvas'
                      : 'Removes the card box and inner outlines so content floats directly on canvas'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWidgetTransparentBg(!widgetTransparentBg)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ml-3 ${
                    widgetTransparentBg ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      widgetTransparentBg ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Countdown Settings */}
          {widget.type === 'countdown' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Target Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={countdownDate}
                    onChange={(e) => setCountdownDate(e.target.value)}
                    className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Target Time
                </label>
                <input
                  type="time"
                  value={countdownTime}
                  onChange={(e) => setCountdownTime(e.target.value)}
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                💡 The countdown updates every second live on your board!
              </div>
            </div>
          )}

          {/* Photo Frame Settings */}
          {widget.type === 'photo_frame' && (() => {
            const tilePreviewConfig =
              !useCommonSource && widget.config?.useCommonSource !== false
                ? { ...widget.config, ...normalizeTileOnlyWidgetConfig(widget.config) }
                : widget.config;
            const sharedPhotoCount = settings.commonPhotos?.length
              ? settings.commonPhotos.length
              : settings.commonPhotoSourceType === 'curated' || settings.commonPhotoCuratedCategory
              ? resolveCuratedPhotos(settings.commonPhotoCuratedCategory, settings.commonPhotoSourceLabel).length
              : 0;
            const tilePhotoCount = tilePreviewConfig?.customPhotos?.length
              ? tilePreviewConfig.customPhotos.length
              : tilePreviewConfig?.sourceType === 'curated' || tilePreviewConfig?.curatedCategoryId
              ? resolveCuratedPhotos(tilePreviewConfig?.curatedCategoryId, tilePreviewConfig?.sourceLabel).length
              : 0;

            return (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              {/* Photo Source Mode: Common vs Tile-Specific */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Photo Library Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        (!settings.commonPhotos || settings.commonPhotos.length === 0) &&
                        widget.config?.customPhotos &&
                        widget.config.customPhotos.length > 0
                      ) {
                        await applyCommonPhotosToAllWidgets(
                          widget.config.customPhotos,
                          widget.config.sourceLabel || 'Google Photos & Web',
                          widget.config.sourceUrl,
                          widget.config.sourceType || 'web',
                          widget.config.plexSyncConfig,
                          widget.config.curatedCategoryId,
                          widget.id
                        );
                        setSyncSuccessMessage(
                          `✓ Synced ${widget.config.customPhotos.length.toLocaleString()} photos as the Shared Board Library!`
                        );
                        setTimeout(() => setSyncSuccessMessage(''), 4000);
                      }
                      setUseCommonSource(true);
                    }}
                    className={`p-3 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      useCommonSource
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/50'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span>Shared Board Library</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Syncs with all shared photo frames ({sharedPhotoCount ? `${sharedPhotoCount.toLocaleString()} photos` : 'Curated Scenery'})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUseCommonSource(false)}
                    className={`p-3 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      !useCommonSource
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/50'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>This Tile Only</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      Independent album ({tilePhotoCount ? `${tilePhotoCount.toLocaleString()} photos` : 'Curated Scenery'})
                    </span>
                  </button>
                </div>
              </div>

              {/* Status Message */}
              {syncSuccessMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{syncSuccessMessage}</span>
                </div>
              )}

              {/* Quick Promote / Sync to Shared Board Library (Only when on 'This Tile Only' and this album differs from the shared library) */}
              {!useCommonSource &&
                widget.config?.customPhotos &&
                widget.config.customPhotos.length > 0 &&
                (!settings.commonPhotos ||
                  settings.commonPhotos.length === 0 ||
                  (widget.config.sourceUrl && widget.config.sourceUrl !== settings.commonPhotoSourceUrl) ||
                  (!widget.config.sourceUrl &&
                    (widget.config.sourceLabel !== settings.commonPhotoSourceLabel ||
                      widget.config.customPhotos.length !== settings.commonPhotos.length))) && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/60 to-purple-950/40 border border-blue-500/30 flex items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                      <Share2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Make this Album the Shared Board Library</span>
                      </div>
                      <div className="text-[11px] text-gray-300">
                        This tile has {widget.config.customPhotos.length.toLocaleString()} photos loaded{widget.config.sourceLabel ? ` (${widget.config.sourceLabel})` : ''}. Share across all photo frames?
                      </div>
                      {((!widget.config.sourceType || widget.config.sourceType === 'web') && widget.config.sourceUrl) && (
                        <div className="text-[10px] font-mono text-blue-300 truncate max-w-[320px] mt-1 bg-black/40 px-2 py-0.5 rounded border border-blue-500/20">
                          🔗 {widget.config.sourceUrl}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!widget.config?.customPhotos) return;
                      await applyCommonPhotosToAllWidgets(
                        widget.config.customPhotos,
                        widget.config.sourceLabel || (widget.config.sourceType === 'plex' ? 'Plex Media Server' : 'Google Photos & Web'),
                        widget.config.sourceType === 'web' ? widget.config.sourceUrl : undefined,
                        widget.config.sourceType || 'web',
                        widget.config.plexSyncConfig,
                        widget.config.curatedCategoryId,
                        widget.id
                      );
                      setUseCommonSource(true);
                      setSyncSuccessMessage(
                        `✓ Synced ${widget.config.customPhotos.length.toLocaleString()} photos as the Shared Board Library!`
                      );
                      setTimeout(() => setSyncSuccessMessage(''), 4000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all shrink-0 cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Set as Shared</span>
                  </button>
                </div>
              )}

              {/* Photo Sources Hub Trigger */}
              {onOpenPhotoSources && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    {useCommonSource ? 'Shared Library Album' : 'Tile-Specific Album'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      handleSave();
                      onOpenPhotoSources(useCommonSource);
                    }}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-blue-500/15 to-purple-500/15 border border-amber-500/30 hover:border-amber-400 text-white transition-all cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
                        <FolderOpen className="w-5 h-5" />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {useCommonSource ? 'Configure Shared Board Library' : 'Configure Custom Photos'}
                          </span>
                          {(useCommonSource
                            ? (settings.commonPhotoSourceLabel || (settings.commonPhotos?.length ? 'Shared Library' : undefined))
                            : tilePreviewConfig?.sourceLabel) && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold truncate max-w-[160px]">
                              {useCommonSource
                                ? (settings.commonPhotoSourceLabel || 'Shared Library')
                                : tilePreviewConfig?.sourceLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          Google Photos shared albums, Local PC / NAS Folders, Plex Media Server, or Curated Scenery
                        </span>
                        {/* Display active source link or provider indicator */}
                        {(() => {
                          const activeType = useCommonSource
                            ? (settings.commonPhotoSourceType || 'curated')
                            : (tilePreviewConfig?.sourceType || 'curated');

                          if (activeType === 'web') {
                            const activeUrl = useCommonSource
                              ? settings.commonPhotoSourceUrl
                              : tilePreviewConfig?.sourceUrl;
                            if (!activeUrl) return null;
                            return (
                              <div className="text-[10px] font-mono text-blue-300/90 truncate max-w-[340px] mt-1 bg-black/40 px-2 py-0.5 rounded border border-blue-500/20">
                                🔗 {activeUrl}
                              </div>
                            );
                          }

                          if (activeType === 'plex') {
                            const label = useCommonSource
                              ? (settings.commonPhotoSourceLabel || 'Plex Library')
                              : (tilePreviewConfig?.sourceLabel || 'Plex Library');
                            return (
                              <div className="text-[10px] font-mono text-amber-300/90 truncate max-w-[340px] mt-1 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1.5">
                                <span>📺</span>
                                <span>Plex Media Server: <strong className="text-amber-200">{label}</strong></span>
                              </div>
                            );
                          }

                          if (activeType === 'local') {
                            const label = useCommonSource
                              ? (settings.commonPhotoSourceLabel || 'Local PC / NAS')
                              : (tilePreviewConfig?.sourceLabel || 'Local PC / NAS');
                            return (
                              <div className="text-[10px] font-mono text-emerald-300/90 truncate max-w-[340px] mt-1 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1.5">
                                <span>📁</span>
                                <span>Local Storage: <strong className="text-emerald-200">{label}</strong></span>
                              </div>
                            );
                          }

                          return null;
                        })()}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2">
                      ➔
                    </span>
                  </button>
                </div>
              )}

              {/* Active Rescan Control & Anti-Spam Cooldown */}
              {(() => {
                const activeType = useCommonSource
                  ? settings.commonPhotoSourceType
                  : tilePreviewConfig?.sourceType;
                const activeUrl = useCommonSource
                  ? settings.commonPhotoSourceUrl
                  : tilePreviewConfig?.sourceUrl;
                const activePlexConfig = useCommonSource
                  ? settings.commonPhotoPlexConfig
                  : tilePreviewConfig?.plexSyncConfig;
                const activeLabel = useCommonSource
                  ? settings.commonPhotoSourceLabel
                  : tilePreviewConfig?.sourceLabel;

                if (!isTargetRescannable(activeType, activeUrl, activePlexConfig, activeLabel)) {
                  return null;
                }

                const syncTargetId = useCommonSource ? undefined : widget.id;
                const targetKey = getPhotoSyncTargetKey(syncTargetId);
                const targetMeta = photoSyncMeta[targetKey];
                const cooldownRemainingMs = getManualRescanCooldownRemainingMs(targetMeta, photoSyncNowTick);
                const isSyncBusy = Boolean(photoSyncState?.isActive);

                return (
                  <div className="p-3 rounded-xl bg-gray-900/70 border border-gray-800 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-gray-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>
                          Last synced:{' '}
                          <strong className="text-white">
                            {formatRelativeSyncTime(targetMeta?.lastSuccessAt, photoSyncNowTick)}
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isSyncBusy || cooldownRemainingMs > 0}
                        onClick={async () => {
                          setPhotoRescanNotice('');
                          const res = await photoSyncService.rescanTarget({
                            targetWidgetId: syncTargetId,
                            reason: 'manual',
                          });
                          setPhotoRescanNotice(res.message);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-500/30 text-blue-300 text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                        title={
                          cooldownRemainingMs > 0
                            ? `Cooldown prevents rapid rescans. Available again in ${formatCooldownRemaining(cooldownRemainingMs)}.`
                            : 'Check Google Photos, Google Drive, or Plex for new photos'
                        }
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncBusy ? 'animate-spin' : ''}`} />
                        <span>
                          {isSyncBusy
                            ? 'Syncing…'
                            : cooldownRemainingMs > 0
                            ? `Rescan in ${formatCooldownRemaining(cooldownRemainingMs)}`
                            : 'Rescan Now'}
                        </span>
                      </button>
                    </div>
                    {(targetMeta?.lastResultSummary || photoRescanNotice || targetMeta?.lastError) && (
                      <div className="text-[10px] text-gray-400 flex flex-wrap items-center justify-between gap-2">
                        <span>{targetMeta?.lastResultSummary}</span>
                        {(photoRescanNotice || targetMeta?.lastError) && (
                          <span
                            className={
                              targetMeta?.lastError &&
                              (!targetMeta.lastSuccessAt ||
                                (targetMeta.lastErrorAt || 0) > targetMeta.lastSuccessAt)
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                            }
                          >
                            {photoRescanNotice || targetMeta?.lastError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Picture Presentation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ken_burns', label: 'Single Photo (Ken Burns Pan & Zoom)' },
                    { id: 'mosaic', label: 'Mosaic Collage (4-Grid)' },
                    { id: 'polaroid', label: 'Scattered Polaroids' },
                    { id: 'filmstrip', label: 'Cinematic Filmstrip' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setPhotoStyle(s.id)}
                      className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer ${
                        photoStyle === s.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {photoStyle === 'mosaic' && (
                <div
                  onClick={() => setMosaicKenBurns(!mosaicKenBurns)}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                    mosaicKenBurns
                      ? 'bg-blue-950/30 border-blue-500/50 shadow-sm'
                      : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="space-y-0.5 pr-3">
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className={`w-3.5 h-3.5 ${mosaicKenBurns ? 'text-blue-400' : 'text-gray-400'}`} />
                      <span>Ken Burns Pan & Zoom Effect</span>
                      {mosaicKenBurns && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {mosaicKenBurns
                        ? 'Active quadrant pans and zooms gently with focus indicator; click any photo to focus'
                        : 'Enable gentle pan & zoom motion on the focused photo (default is static 4-grid)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMosaicKenBurns(!mosaicKenBurns);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      mosaicKenBurns ? 'bg-blue-600' : 'bg-gray-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        mosaicKenBurns ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

              {photoStyle === 'polaroid' && (
                <div className="p-3.5 rounded-xl bg-gray-950 border border-gray-800 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-gray-300">
                        Polaroids Density & Count ({polaroidCount} Photos)
                      </label>
                      <span className="text-[10px] font-mono text-cyan-400">
                        {polaroidCount >= 30 ? 'Fill Complete Screen' : `${polaroidCount} Scattered`}
                      </span>
                    </div>
                    <div className="flex gap-1.5 mb-2">
                      {[
                        { count: 6, label: '6 (Light)' },
                        { count: 12, label: '12 (Desk)' },
                        { count: 18, label: '18 (Dense)' },
                        { count: 24, label: '24 (Wall)' },
                        { count: 32, label: '32 (Fill Screen)' },
                      ].map((item) => (
                        <button
                          key={item.count}
                          type="button"
                          onClick={() => setPolaroidCount(item.count)}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            polaroidCount === item.count
                              ? 'bg-blue-600 text-white shadow'
                              : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="36"
                      step="2"
                      value={polaroidCount}
                      onChange={(e) => setPolaroidCount(Number(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                      Card Size Variation
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'mixed', label: 'Random / Mixed Sizes', desc: 'Mix of S, M, and L hero prints' },
                        { id: 'uniform', label: 'Uniform Medium', desc: 'All matching classic size' },
                        { id: 'small', label: 'Compact Snapshots', desc: 'Mini polaroids for high density' },
                        { id: 'large', label: 'Large Hero Prints', desc: 'Prominent, high-visibility cards' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setPolaroidSizeMode(mode.id as any)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            polaroidSizeMode === mode.id
                              ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                              : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-semibold text-white">{mode.label}</div>
                          <div className="text-[10px] text-gray-500">{mode.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Rotation Interval (Slideshow Speed)
                </label>
                <div className="flex gap-2">
                  {[5, 10, 15, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setPhotoIntervalSec(sec)}
                      className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        photoIntervalSec === sec
                          ? 'bg-purple-600/30 border border-purple-500 text-purple-300'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Photo Playback Order</span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {photoOrder === 'sequential' ? 'Sequential' : 'Shuffle'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'random', label: '🔀 Random Shuffle (Default)', desc: 'Surprise mix across entire collection' },
                    { id: 'sequential', label: '➡️ Sequential Order', desc: 'In upload or folder order' },
                  ].map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => setPhotoOrder(ord.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        photoOrder === ord.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                    >
                      <div className="text-xs font-semibold text-white">{ord.label}</div>
                      <div className="text-[10px] text-gray-500">{ord.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo Captions & Counter Toggle (Clean Picture Mode) */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-950 border border-gray-800">
                <div className="space-y-0.5 pr-3">
                  <div className="text-xs font-semibold text-white">Album Name & Photo Numbers</div>
                  <div className="text-[11px] text-gray-400">
                    {showCaptions
                      ? 'Showing album titles, handwritten labels, and photo counter'
                      : 'Clean picture mode: album name, labels, and numbers hidden'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCaptions(!showCaptions)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    showCaptions ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                  title={showCaptions ? 'Switch to clean picture mode' : 'Show album name and numbers'}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      showCaptions ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Photo Date Taken Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-950 border border-gray-800">
                <div className="space-y-0.5 pr-3">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Show Date Taken</span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {showDateTaken
                      ? 'Displaying photo capture date or year taken (from EXIF metadata or timeline)'
                      : 'Capture date hidden'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDateTaken(!showDateTaken)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    showDateTaken ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                  title={showDateTaken ? 'Hide date taken' : 'Show date taken on photos'}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      showDateTaken ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            );
          })()}

          {/* Ambient Stream & Web Embed Settings */}
          {widget.type === 'embed' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2">
                  <Tv className="w-3.5 h-3.5 text-pink-400" />
                  <span>Ambient Stream Preset</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EMBED_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setEmbedPreset(p.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        embedPreset === p.id
                          ? 'bg-pink-600/20 border-pink-500 text-pink-200'
                          : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{p.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Custom YouTube Link or Web Embed URL
                </label>
                <input
                  type="url"
                  value={embedCustomUrl}
                  onChange={(e) => {
                    setEmbedCustomUrl(e.target.value);
                    if (e.target.value.trim()) {
                      setEmbedPreset('custom');
                    }
                  }}
                  placeholder="https://www.youtube.com/watch?v=... or https://..."
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Standard YouTube links are automatically converted to clean, ad-free embeds.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-950 border border-gray-800">
                <span className="text-xs text-gray-300">Start Stream Muted (Recommended for Kiosks):</span>
                <button
                  type="button"
                  onClick={() => setEmbedMuted(!embedMuted)}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    embedMuted ? 'bg-pink-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      embedMuted ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Custom Quotes & Family Affirmations Settings */}
          {widget.type === 'quotes' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Quote Rotation Source
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'both', label: 'Mix Both' },
                    { id: 'custom', label: 'Custom Only' },
                    { id: 'curated', label: 'Curated Only' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setQuoteMode(m.id as any)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        quoteMode === m.id
                          ? 'bg-amber-600/30 border border-amber-500 text-amber-300'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Update Interval</span>
                  <span className="text-amber-400 font-mono text-[11px] normal-case">
                    {[
                      { label: '30s', value: 30 },
                      { label: '1 min', value: 60 },
                      { label: '5 min', value: 300 },
                      { label: '15 min', value: 900 },
                      { label: '30 min', value: 1800 },
                      { label: '1 hr', value: 3600 },
                      { label: '4 hrs', value: 14400 },
                      { label: 'Daily (24h)', value: 86400 },
                      { label: 'Manual Only', value: 0 },
                    ].find((o) => o.value === quoteIntervalSec)?.label || `${quoteIntervalSec}s`}
                  </span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {[
                    { label: '30s', value: 30 },
                    { label: '1m', value: 60 },
                    { label: '5m', value: 300 },
                    { label: '15m', value: 900 },
                    { label: '30m', value: 1800 },
                    { label: '1h', value: 3600 },
                    { label: '4h', value: 14400 },
                    { label: 'Daily', value: 86400 },
                    { label: 'Manual', value: 0 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setQuoteIntervalSec(opt.value)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        quoteIntervalSec === opt.value
                          ? 'bg-amber-600/30 border border-amber-500 text-amber-300 font-bold'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add Custom Quote Form */}
              <div className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 space-y-2.5">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Quote className="w-3.5 h-3.5" />
                  <span>+ Add Custom Quote, Family Motto, or Affirmation</span>
                </span>
                <textarea
                  rows={2}
                  value={newQuoteText}
                  onChange={(e) => setNewQuoteText(e.target.value)}
                  placeholder="Write a quote, affirmation, or family reminder..."
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newQuoteAuthor}
                    onChange={(e) => setNewQuoteAuthor(e.target.value)}
                    placeholder="Author / Family Member (e.g., Mom, Dad, Stoic Daily)"
                    className="flex-1 rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomQuote}
                    disabled={!newQuoteText.trim()}
                    className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {customQuotes.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block">
                    Saved Custom Quotes ({customQuotes.length})
                  </span>
                  {customQuotes.map((cq) => (
                    <div
                      key={cq.id}
                      className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-200 italic">"{cq.quote}"</div>
                        <div className="text-[10px] text-amber-400/80 mt-0.5">— {cq.author}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomQuote(cq.id)}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remove quote"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Weather Settings */}
          {(widget.type === 'weather' || widget.type === 'clock_weather') && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  City / Location Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookupCity()}
                    placeholder="e.g., Austin, TX or Tokyo"
                    className="flex-1 rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleLookupCity()}
                    disabled={geoLoading}
                    className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                    title="Auto-lookup latitude, longitude, and timezone for this city"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{geoLoading ? 'Searching...' : 'Lookup City'}</span>
                  </button>
                </div>
                {geoStatus && (
                  <span className="text-[11px] text-cyan-400 mt-1 block">{geoStatus}</span>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Temperature Unit
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTempUnit('F')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tempUnit === 'F'
                        ? 'bg-amber-600/30 border border-amber-500 text-amber-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400'
                    }`}
                  >
                    Fahrenheit (°F)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempUnit('C')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      tempUnit === 'C'
                        ? 'bg-amber-600/30 border border-amber-500 text-amber-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400'
                    }`}
                  >
                    Celsius (°C)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Clock Settings (For Clock, Clock + Weather Combo, and World Timezone Clock) */}
          {(widget.type === 'clock' ||
            widget.type === 'clock_weather' ||
            widget.type === 'world_clock') && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Clock Face Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'digital', label: 'Digital' },
                    { id: 'minimal', label: 'Minimalist' },
                    { id: 'analog', label: 'Analog Dial' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setClockFace(f.id as any)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        clockFace === f.id
                          ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clock Alignment (Center vs Left) */}
              {(widget.type === 'clock_weather' || widget.type === 'clock') && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Clock Text Alignment
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'center', label: 'Centered (Default)' },
                      { id: 'left', label: 'Left Aligned' },
                    ].map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setClockAlign(a.id as 'center' | 'left')}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          clockAlign === a.id
                            ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                            : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Universal Show Seconds Toggle for ALL Clock & Time Tiles */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-950 border border-gray-800">
                <span className="text-xs text-gray-300 font-medium">
                  Display Seconds (Ticker / Second Hand):
                </span>
                <button
                  type="button"
                  onClick={() => setShowSeconds(!showSeconds)}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    showSeconds ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      showSeconds ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* City Timezone Lookup for Standalone Ambient Clock */}
              {widget.type === 'clock' && (
                <div className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>City Timezone Lookup (Optional)</span>
                    </span>
                    {timezone && (
                      <button
                        type="button"
                        onClick={() => {
                          setTimezone('');
                          setLocationName('');
                          setGeoStatus('Reset to Local Device Time');
                        }}
                        className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                      >
                        Reset to Local Time
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLookupCity()}
                      placeholder="Type a city (e.g., Tokyo, London, Paris, Seattle)..."
                      className="flex-1 rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleLookupCity()}
                      disabled={geoLoading}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Lookup</span>
                    </button>
                  </div>
                  {timezone && (
                    <div className="text-[11px] text-emerald-400 font-mono">
                      Active Timezone: {timezone}
                    </div>
                  )}
                  {geoHits.length > 1 && (
                    <div className="space-y-1 pt-1">
                      {geoHits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => {
                            const label = `${hit.name}${hit.country ? `, ${hit.country}` : ''}`;
                            setLocationName(label);
                            if (hit.timezone) setTimezone(hit.timezone);
                            setTitle(label);
                            setGeoHits([]);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[11px] text-gray-300 flex items-center justify-between cursor-pointer"
                        >
                          <span>
                            {hit.name}
                            {hit.admin1 ? `, ${hit.admin1}` : ''}
                            {hit.country ? ` (${hit.country})` : ''}
                          </span>
                          <span className="font-mono text-cyan-400">{hit.timezone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* World Timezone Clock Multi-City Manager */}
              {widget.type === 'world_clock' && (
                <div className="space-y-3 pt-2 border-t border-gray-800">
                  <div className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 space-y-2.5">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Search City to Set or Add Timezone</span>
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={worldCitySearch}
                        onChange={(e) => setWorldCitySearch(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && handleLookupCity(worldCitySearch)
                        }
                        placeholder="Type any city (e.g., Tokyo, London, Ho Chi Minh, New York)..."
                        className="flex-1 rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleLookupCity(worldCitySearch)}
                        disabled={geoLoading || !worldCitySearch.trim()}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>{geoLoading ? '...' : 'Lookup'}</span>
                      </button>
                    </div>

                    {geoStatus && (
                      <span className="text-[11px] text-cyan-400 block">{geoStatus}</span>
                    )}

                    {/* Search Results with Set Primary vs Add to List */}
                    {geoHits.length > 0 && (
                      <div className="space-y-1.5 pt-1 max-h-40 overflow-y-auto">
                        {geoHits.map((hit) => {
                          const tz = hit.timezone || 'UTC';
                          return (
                            <div
                              key={hit.id}
                              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-900 border border-gray-800 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-white truncate">
                                  {hit.name}
                                  {hit.admin1 ? `, ${hit.admin1}` : ''}
                                  {hit.country ? ` (${hit.country})` : ''}
                                </div>
                                <div className="text-[10px] font-mono text-cyan-400">{tz}</div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setWorldCities([
                                      {
                                        id: `wc-${hit.id}`,
                                        cityName: hit.name,
                                        country: hit.country,
                                        timezone: tz,
                                      },
                                    ]);
                                    setTitle(`${hit.name} Time`);
                                    setGeoHits([]);
                                    setWorldCitySearch('');
                                  }}
                                  className="px-2 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold cursor-pointer"
                                  title="Set as single-city hero clock"
                                >
                                  Set Only
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!worldCities.some((c) => c.cityName === hit.name && c.timezone === tz)) {
                                      setWorldCities([
                                        ...worldCities,
                                        {
                                          id: `wc-${hit.id}-${Date.now()}`,
                                          cityName: hit.name,
                                          country: hit.country,
                                          timezone: tz,
                                        },
                                      ]);
                                    }
                                    setGeoHits([]);
                                    setWorldCitySearch('');
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold cursor-pointer"
                                  title="Add to multi-city timezone list"
                                >
                                  + Add City
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Active Cities List with Sorter */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block">
                        Active Timezone Cities ({worldCities.length}) —{' '}
                        {worldCities.length === 1 ? 'Single Hero Clock' : 'Multi-City List'}
                      </span>
                      {worldCities.length > 1 && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500 font-medium mr-0.5">Quick Sort:</span>
                          <button
                            type="button"
                            onClick={handleSortCitiesByOffset}
                            title="Sort cities by timezone offset (West to East)"
                            className="px-2 py-0.5 rounded-md bg-gray-950 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <ArrowUpDown className="w-2.5 h-2.5 text-cyan-400" />
                            <span>By Time</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleSortCitiesByName}
                            title="Sort cities alphabetically (A to Z)"
                            className="px-2 py-0.5 rounded-md bg-gray-950 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-medium transition-colors cursor-pointer"
                          >
                            A-Z
                          </button>
                          <button
                            type="button"
                            onClick={handleReverseCities}
                            title="Reverse current city order"
                            className="px-2 py-0.5 rounded-md bg-gray-950 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-[10px] font-medium transition-colors cursor-pointer"
                          >
                            Reverse
                          </button>
                        </div>
                      )}
                    </div>

                    {worldCities.length > 1 && (
                      <p className="text-[10px] text-gray-500 leading-tight">
                        💡 Grab the handle to drag & drop cities into your preferred order, or use the ▲ / ▼ arrows.
                      </p>
                    )}

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {worldCities.map((c, idx) => {
                        const isDragging = cityDragIndex === idx;
                        const isDragOver = cityDragOverIndex === idx && cityDragIndex !== idx;
                        const isFirst = idx === 0;
                        const isLast = idx === worldCities.length - 1;

                        return (
                          <div
                            key={c.id}
                            draggable={worldCities.length > 1}
                            onDragStart={(e) => {
                              if (worldCities.length <= 1) return;
                              e.dataTransfer.setData('text/plain', String(idx));
                              e.dataTransfer.effectAllowed = 'move';
                              setCityDragIndex(idx);
                            }}
                            onDragOver={(e) => {
                              if (worldCities.length <= 1) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (cityDragOverIndex !== idx) setCityDragOverIndex(idx);
                            }}
                            onDragLeave={() => {
                              if (cityDragOverIndex === idx) setCityDragOverIndex(null);
                            }}
                            onDrop={(e) => {
                              if (worldCities.length <= 1) return;
                              e.preventDefault();
                              if (cityDragIndex !== null) {
                                handleReorderCity(cityDragIndex, idx);
                              }
                              setCityDragIndex(null);
                              setCityDragOverIndex(null);
                            }}
                            onDragEnd={() => {
                              setCityDragIndex(null);
                              setCityDragOverIndex(null);
                            }}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                              isDragging ? 'opacity-35 scale-[0.98]' : ''
                            } ${
                              isDragOver
                                ? 'border-cyan-400 ring-2 ring-cyan-500/50 bg-cyan-950/40'
                                : 'bg-gray-950 border-gray-800 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                              {worldCities.length > 1 && (
                                <div
                                  className="cursor-grab active:cursor-grabbing p-1 text-gray-500 hover:text-cyan-400 hover:bg-gray-800 rounded touch-none shrink-0"
                                  title="Grab and drag to sort city"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="font-bold text-white block truncate">
                                  {c.cityName}
                                  {c.country ? `, ${c.country}` : ''}
                                </span>
                                <span className="text-[10px] font-mono text-cyan-400">
                                  {c.timezone}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {worldCities.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isFirst}
                                    onClick={() => handleMoveCity(idx, 'up')}
                                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                    title="Move city up"
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isLast}
                                    onClick={() => handleMoveCity(idx, 'down')}
                                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                    title="Move city down"
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {worldCities.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWorldCities(worldCities.filter((item) => item.id !== c.id))
                                  }
                                  className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer ml-1"
                                  title="Remove city"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Calendar Settings & Multi-Source iCal Feed Manager */}
          {widget.type === 'calendar' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Default Calendar View
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['agenda', '3day', 'week', 'month'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCalendarDefaultView(mode)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        calendarDefaultView === mode
                          ? 'bg-emerald-600/30 border border-emerald-500 text-emerald-300'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {mode === 'agenda'
                        ? 'Agenda'
                        : mode === '3day'
                        ? '3-Day'
                        : mode === 'week'
                        ? 'Weekly'
                        : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>3-Day & Week Display Layout</span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {multiDayLayout === 'timeline' ? '24h Timeline' : 'Cards'}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMultiDayLayout('cards')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      multiDayLayout === 'cards'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-0.5">
                      <Columns className="w-3.5 h-3.5 text-blue-400" />
                      <span>Cards in Order of Time</span>
                    </div>
                    <div className="text-[10.5px] text-gray-400 leading-snug">
                      Chronological day cards with start/end badges, color bars, and no empty night scrolling
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMultiDayLayout('timeline')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      multiDayLayout === 'timeline'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-200'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-0.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      <span>24-Hour Timeline Grid</span>
                    </div>
                    <div className="text-[10.5px] text-gray-400 leading-snug">
                      Vertical hourly schedule with time gutter (12 AM–11 PM) and red current-time marker
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-950/80 border border-gray-800">
                <div>
                  <span className="text-xs font-semibold text-gray-200 block">
                    Show Planned Family Meals
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    Overlay Breakfast, Lunch, and Dinner entries from your Family Meal Planner on the calendar.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={calendarShowMeals}
                  onClick={() => setCalendarShowMeals((prev) => !prev)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                    calendarShowMeals ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      calendarShowMeals ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Active Calendar Feeds List */}
              <div className="space-y-2 pt-2 border-t border-gray-800/70">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Connected iCal / Webcal Feeds ({calendarSources.length})</span>
                </label>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {calendarSources.map((src) => (
                    <div
                      key={src.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={src.enabled}
                          onChange={() => handleToggleCalendarSource(src.id)}
                          className="rounded accent-emerald-500 cursor-pointer"
                        />
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: src.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-200 truncate">{src.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{src.url}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCalendarSource(src.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remove calendar feed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New iCal / Webcal URL Form */}
              <div className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-200 block">
                    + Add Google, Apple, or Outlook iCal Feed (.ics / webcal://)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCalendarGuideOpen(true)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold hover:underline cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>How to find URL</span>
                  </button>
                </div>

                {/* Helpful quick guide & official Google documentation link */}
                <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-gray-300 leading-relaxed space-y-1">
                  <div className="flex items-center justify-between font-semibold text-blue-300">
                    <span>Google Calendar URL path:</span>
                    <a
                      href="https://support.google.com/calendar/answer/37648?hl=en"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 text-[10px] font-normal"
                    >
                      Official Google Guide <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-gray-300 text-[11px]">
                    Go to <strong className="text-white">Settings</strong> &gt; <strong className="text-white">Settings for my calendars</strong> &gt; <strong className="text-white">Integrate calendar</strong> &gt; copy <strong className="text-emerald-400">Secret address in iCal format</strong> (.ics).
                  </p>
                </div>

                <input
                  type="text"
                  value={newCalName}
                  onChange={(e) => setNewCalName(e.target.value)}
                  placeholder="Calendar Label (e.g., Family Schedule, Work)"
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="url"
                  value={newCalUrl}
                  onChange={(e) => {
                    setNewCalUrl(e.target.value);
                    setCalCheck({ status: 'idle' });
                  }}
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  className="w-full rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                />

                {/* Live Guiding Feedback */}
                {(() => {
                  const validation = normalizeCalendarUrl(newCalUrl);
                  if (validation.warning) {
                    return (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-start gap-2 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          {validation.warning}{' '}
                          <button
                            type="button"
                            onClick={() => setIsCalendarGuideOpen(true)}
                            className="text-amber-300 underline font-bold cursor-pointer"
                          >
                            View step-by-step guide
                          </button>
                        </div>
                      </div>
                    );
                  }
                  if (validation.isConverted) {
                    return (
                      <p className="text-[11px] text-cyan-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Auto-converted to direct iCal feed address
                      </p>
                    );
                  }
                  if (!validation.warning && newCalUrl.trim().endsWith('.ics')) {
                    return (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Valid iCal format (.ics) detected
                      </p>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400 mr-1">Color Tag:</span>
                    {CALENDAR_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewCalColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                          newCalColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-70'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddCalendarSource()}
                    disabled={!newCalUrl.trim() || calCheck.status === 'checking'}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{calCheck.status === 'checking' ? 'Checking...' : 'Add Feed'}</span>
                  </button>
                </div>
                {calCheck.status === 'ok' && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1" role="status">
                    <Check className="w-3 h-3" /> {calCheck.message}
                  </p>
                )}
                {calCheck.status === 'error' && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-[11px] leading-relaxed" role="alert">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-400" />
                    Couldn't read this calendar: {calCheck.message}{' '}
                    <button
                      type="button"
                      onClick={() => handleAddCalendarSource(true)}
                      className="underline font-bold text-red-100 cursor-pointer"
                    >
                      Add anyway
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RSS Settings */}
          {widget.type === 'rss' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              {/* Curated Feeds Picker */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Curated RSS Directory ({CURATED_RSS_FEEDS.length} Feeds)
                  </label>
                  <div className="relative w-44">
                    <Search className="w-3 h-3 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={rssSearchQuery}
                      onChange={(e) => setRssSearchQuery(e.target.value)}
                      placeholder="Filter feeds..."
                      className="w-full rounded-lg bg-gray-950 border border-gray-800 pl-7 pr-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-1 mb-2.5">
                  {RSS_FEED_CATEGORIES.map((cat) => {
                    const isActive = rssCategoryFilter === cat;
                    const count =
                      cat === 'All'
                        ? CURATED_RSS_FEEDS.length
                        : CURATED_RSS_FEEDS.filter((f) => f.category === cat).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setRssCategoryFilter(cat)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                          isActive
                            ? 'bg-orange-500/20 border-orange-500/70 text-orange-300'
                            : 'bg-gray-950/70 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        {cat} <span className="opacity-60 font-mono">({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {CURATED_RSS_FEEDS.filter((feed) => {
                    if (rssCategoryFilter !== 'All' && feed.category !== rssCategoryFilter) {
                      return false;
                    }
                    if (rssSearchQuery.trim()) {
                      const q = rssSearchQuery.trim().toLowerCase();
                      return (
                        feed.name.toLowerCase().includes(q) ||
                        feed.description.toLowerCase().includes(q) ||
                        feed.category.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  }).map((feed) => {
                    const isSelected = rssFeedUrl.trim().toLowerCase() === feed.url.toLowerCase();
                    return (
                      <button
                        key={feed.id}
                        type="button"
                        onClick={() => {
                          setRssFeedUrl(feed.url);
                          if (!title || CURATED_RSS_FEEDS.some((f) => f.name === title)) {
                            setTitle(feed.name);
                          }
                        }}
                        className={`flex flex-col text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-orange-500/15 border-orange-500/80 shadow-sm'
                            : 'bg-gray-950/60 border-gray-800/80 hover:bg-gray-800/50 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className="text-xs font-bold text-white truncate">
                            {feed.name}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 uppercase tracking-wider ${feed.badgeColor}`}
                          >
                            {feed.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                          {feed.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom RSS URL Input */}
              <div className="pt-2 border-t border-gray-800/60">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Custom RSS / Atom URL</span>
                  <span className="text-[10px] text-gray-500 font-normal">Any public .xml or /rss link</span>
                </label>
                <input
                  type="url"
                  value={rssFeedUrl}
                  onChange={(e) => setRssFeedUrl(e.target.value)}
                  placeholder="https://tony.trinhism.com/index.xml"
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Text Size & Readability Scale */}
              <div className="pt-2 border-t border-gray-800/60">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                  Text Size & Readability
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {[
                    { id: 'auto', label: 'Adaptive', desc: 'Auto-scales with tile' },
                    { id: 'sm', label: 'Compact', desc: 'Small text' },
                    { id: 'base', label: 'Normal', desc: 'Standard' },
                    { id: 'lg', label: 'Large', desc: 'Big headlines' },
                    { id: 'xl', label: 'Jumbo', desc: 'Wall kiosk & TV' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRssTextSize(opt.id as any)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        rssTextSize === opt.id
                          ? 'bg-orange-500/20 border-orange-500 text-white shadow-xs'
                          : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                      }`}
                    >
                      <div className="text-xs font-bold leading-tight">{opt.label}</div>
                      <div className="text-[10px] text-gray-500 truncate mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Text Box & Canvas Heading Settings */}
          {widget.type === 'textbox' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              {/* Live Preview Box */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Live Preview</span>
                  <span className="text-[10px] text-gray-500 font-normal">WYSIWYG on canvas</span>
                </label>
                <div
                  className={`w-full min-h-[90px] rounded-xl p-4 flex flex-col justify-center border transition-all ${
                    textTransparentBg || textBgStyle === 'transparent'
                      ? 'bg-black/30 border-transparent'
                      : textBgStyle === 'glass'
                      ? 'bg-gray-950/40 backdrop-blur-md border-white/10'
                      : 'bg-gray-900 border-gray-800'
                  }`}
                >
                  <div
                    className={`w-full leading-snug break-words ${
                      textAlignment === 'left'
                        ? 'text-left'
                        : textAlignment === 'right'
                        ? 'text-right'
                        : 'text-center'
                    } ${
                      textFamily === 'serif'
                        ? 'font-serif'
                        : textFamily === 'mono'
                        ? 'font-mono'
                        : textFamily === 'script'
                        ? 'font-serif italic'
                        : 'font-sans'
                    } ${
                      textFontSize === 'xs'
                        ? 'text-xs'
                        : textFontSize === 'sm'
                        ? 'text-sm'
                        : textFontSize === 'base'
                        ? 'text-base'
                        : textFontSize === 'lg'
                        ? 'text-lg'
                        : textFontSize === 'xl'
                        ? 'text-xl'
                        : textFontSize === '3xl'
                        ? 'text-3xl'
                        : textFontSize === '4xl'
                        ? 'text-4xl'
                        : textFontSize === '5xl'
                        ? 'text-5xl'
                        : 'text-2xl'
                    } ${
                      textFontWeight === 'normal'
                        ? 'font-normal'
                        : textFontWeight === 'medium'
                        ? 'font-medium'
                        : textFontWeight === 'semibold'
                        ? 'font-semibold'
                        : textFontWeight === 'extrabold'
                        ? 'font-extrabold'
                        : 'font-bold'
                    } ${
                      letterSpacing === 'wide'
                        ? 'tracking-wide'
                        : letterSpacing === 'widest'
                        ? 'tracking-widest'
                        : 'tracking-normal'
                    }`}
                    style={{
                      color: textColor,
                      textTransform: textTransform !== 'none' ? textTransform : undefined,
                      ...(textShadow
                        ? {
                            textShadow:
                              '0 2px 8px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.95)',
                          }
                        : {}),
                    }}
                  >
                    {textContent || (
                      <span className="opacity-40 italic font-normal text-sm">
                        Enter your message below...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Text Content Editor */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Text Content</span>
                  <span className="text-[10px] text-gray-500 font-normal">Supports multi-line & Markdown</span>
                </label>
                <textarea
                  rows={3}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Enter message, heading, or notes..."
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-3 text-xs text-white focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
                />
                {/* Markdown Shortcut Helper Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-gray-500 mr-0.5">Quick Tags:</span>
                  {[
                    { label: '# Header 1', prefix: '# ' },
                    { label: '## Header 2', prefix: '## ' },
                    { label: '**Bold**', wrap: '**' },
                    { label: '*Italic*', wrap: '*' },
                    { label: '__Underline__', wrap: '__' },
                    { label: '- Bullet', prefix: '- ' },
                  ].map((tag) => (
                    <button
                      key={tag.label}
                      type="button"
                      onClick={() => {
                        if (tag.wrap) {
                          setTextContent((prev) => `${prev} ${tag.wrap}text${tag.wrap}`);
                        } else if (tag.prefix) {
                          setTextContent((prev) => (prev ? `${prev}\n${tag.prefix}` : tag.prefix));
                        }
                      }}
                      className="px-2 py-0.5 rounded-md bg-gray-800 hover:bg-gray-700 text-[10px] font-mono text-gray-300 transition-colors cursor-pointer"
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size Selector */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Font Size
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setTextFontSize(sz)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        textFontSize === sz
                          ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                          : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {sz.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Typography Family & Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Font Style
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'sans', label: 'Clean Sans' },
                      { id: 'serif', label: 'Serif' },
                      { id: 'mono', label: 'Mono' },
                      { id: 'script', label: 'Script' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTextFamily(f.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          textFamily === f.id
                            ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                            : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Weight
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'normal', label: 'Regular' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'bold', label: 'Bold' },
                      { id: 'extrabold', label: 'Heavy' },
                    ].map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setTextFontWeight(w.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          textFontWeight === w.id
                            ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                            : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Text Alignment & Background Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Alignment
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { id: 'left', icon: AlignLeft, label: 'Left' },
                      { id: 'center', icon: AlignCenter, label: 'Center' },
                      { id: 'right', icon: AlignRight, label: 'Right' },
                    ].map((al) => {
                      const Icon = al.icon;
                      return (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => setTextAlignment(al.id as any)}
                          title={al.label}
                          className={`flex-1 py-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                            textAlignment === al.id
                              ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                              : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Background Style
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'transparent', label: 'No Box' },
                      { id: 'glass', label: 'Glass' },
                      { id: 'solid', label: 'Dark' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => {
                          setTextBgStyle(bg.id as any);
                          setTextTransparentBg(bg.id === 'transparent');
                        }}
                        className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          textBgStyle === bg.id
                            ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                            : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sticker / Frameless Mode (Remove Box Outline) */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
                <div>
                  <span className="text-xs text-gray-300 block font-semibold">
                    Sticker / Transparent Mode (Remove Box Outline)
                  </span>
                  <span className="text-[10px] text-gray-500">
                    Removes the card outline and background box so text floats directly on canvas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !textTransparentBg;
                    setTextTransparentBg(next);
                    setTextBgStyle(next ? 'transparent' : textBgStyle === 'transparent' ? 'glass' : textBgStyle);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    textTransparentBg ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      textTransparentBg ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Text Color Swatches & Drop Shadow */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Text Color
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={textShadow}
                      onChange={(e) => setTextShadow(e.target.checked)}
                      className="rounded bg-gray-950 border-gray-800 text-blue-600"
                    />
                    <span>High-Contrast Shadow</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: 'White', color: '#ffffff' },
                    { label: 'Slate', color: '#cbd5e1' },
                    { label: 'Cyan', color: '#38bdf8' },
                    { label: 'Amber', color: '#fbbf24' },
                    { label: 'Emerald', color: '#34d399' },
                    { label: 'Rose', color: '#f472b6' },
                    { label: 'Purple', color: '#c084fc' },
                    { label: 'Coral', color: '#f87171' },
                    { label: 'Yellow', color: '#facc15' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => setTextColor(c.color)}
                      style={{ backgroundColor: c.color }}
                      title={c.label}
                      className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                        textColor === c.color
                          ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-gray-900 border-black/40'
                          : 'border-white/20 hover:scale-110 opacity-80 hover:opacity-100'
                      }`}
                    />
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[10px] text-gray-500 font-mono">Custom:</span>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Single Image or GIF Settings */}
          {widget.type === 'image' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              {/* Media Preview & Change Button */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5 flex items-center justify-between">
                  <span>Image / GIF Preview</span>
                  {imageUrl && (
                    <span className="text-[10px] text-emerald-400 font-mono">Active</span>
                  )}
                </label>
                <div className="flex gap-3 items-center p-3 rounded-xl bg-gray-950 border border-gray-800">
                  <div
                    className={`w-20 h-20 rounded-xl overflow-hidden border border-gray-800 shrink-0 flex items-center justify-center ${
                      imageTransparentBg
                        ? 'bg-[linear-gradient(45deg,#1f2937_25%,transparent_25%),linear-gradient(-45deg,#1f2937_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f2937_75%),linear-gradient(-45deg,transparent_75%,#1f2937_75%)] bg-[size:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0]'
                        : 'bg-black/50'
                    }`}
                  >
                    {previewMedia.videoUrl ? (
                      <video
                        src={previewMedia.videoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full"
                        style={{ objectFit: imageFit }}
                      />
                    ) : previewMedia.optimizedImgUrl || previewMedia.fallbackImgUrl ? (
                      <img
                        src={previewMedia.optimizedImgUrl || previewMedia.fallbackImgUrl}
                        alt="Preview"
                        className="w-full h-full"
                        style={{ objectFit: imageFit }}
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsMediaSearchOpen(true)}
                      className="w-full py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                    >
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      <span>{imageUrl ? 'Change Image / Search GIPHY' : 'Browse GIPHY & Images'}</span>
                    </button>
                    <span className="text-[10px] text-gray-500 block leading-tight">
                      Search animated GIFs, transparent stickers, or free photos.
                    </span>
                  </div>
                </div>
              </div>

              {/* Direct URL Input */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Or Direct Image / GIF URL
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setImageMp4Url(undefined);
                    setImageMediaSource('custom');
                  }}
                  placeholder="https://.../animation.gif"
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Object Fit Selector */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Image Scaling (Object Fit)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'contain' as const, label: 'Contain', desc: 'Preserves aspect ratio' },
                    { id: 'cover' as const, label: 'Cover', desc: 'Fills frame completely' },
                    { id: 'fill' as const, label: 'Stretch', desc: 'Stretches to borders' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setImageFit(opt.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        imageFit === opt.id
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold shadow-sm'
                          : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs block">{opt.label}</span>
                      <span className="text-[10px] text-gray-500 font-normal">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Frame Style (Card vs Transparent Sticker) */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
                <div>
                  <span className="text-xs text-gray-300 block font-semibold">Transparent Sticker Mode</span>
                  <span className="text-[10px] text-gray-500">
                    Removes dark background card so GIFs and stickers float directly on canvas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setImageTransparentBg(!imageTransparentBg)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    imageTransparentBg ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      imageTransparentBg ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Optional Caption */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Optional Caption (Banner at bottom)
                </label>
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="e.g. Happy Friday! ☕"
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Optional Click-through Link */}
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">
                  Optional Click-through Link
                </label>
                <input
                  type="url"
                  value={imageLinkUrl}
                  onChange={(e) => setImageLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* Chores & Rewards Settings */}
          {widget.type === 'chores' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                  Canvas Presentation Mode
                </label>
                <p className="text-[11px] text-gray-400 mb-2.5">
                  Choose a resizable Bento checklist card or make this canvas a dedicated full-screen 3-column Chore &amp; Reward Hub in your board rotation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChoreDisplayMode('tile')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      choreDisplayMode === 'tile'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs block font-semibold">Compact Bento Tile</span>
                      <span className="text-[10px] text-gray-400 font-normal leading-snug block mt-0.5">
                        Resizable checklist card alongside other tiles
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChoreDisplayMode('hub')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      choreDisplayMode === 'hub'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0 mt-0.5">
                      <Columns className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs block font-semibold">Full-Screen Hub on Canvas</span>
                      <span className="text-[10px] text-gray-400 font-normal leading-snug block mt-0.5">
                        3-column Point Banks, Chores &amp; Reward Store (rotates with canvases)
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                  Widget View Scope
                </label>
                <p className="text-[11px] text-gray-400 mb-2.5">
                  Show everyone grouped together (Household View) or pin this view to a single family member.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChoreScope('household')}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      choreScope === 'household'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-sm shrink-0">
                      🏠
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs block font-semibold">Household View</span>
                      <span className="text-[10px] text-gray-400 font-normal">
                        All children sub-grouped
                      </span>
                    </div>
                  </button>

                  {choreProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setChoreScope(profile.id)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        choreScope === profile.id
                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                          : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                      }`}
                    >
                      <HouseholdAvatar profile={profile} size="sm" />
                      <div className="min-w-0">
                        <span className="text-xs block font-semibold truncate">{profile.name}</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          Pinned single profile ({profile.balance} pts)
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {choreScope === 'household' && (
                  <div className="mt-2.5 flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-950/80 border border-gray-800">
                    <div>
                      <span className="text-xs font-semibold text-gray-200 block">
                        Include Parent Profiles in Household View
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        By default, Household View focuses on kids. Enable to display parent chores too.
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={choreIncludeParents}
                      onClick={() => setChoreIncludeParents((prev) => !prev)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                        choreIncludeParents ? 'bg-emerald-600' : 'bg-gray-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          choreIncludeParents ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                  Default Expanded Accordion Sections
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'today' as const, label: "Today's Chores" },
                    { id: 'review' as const, label: 'Parent Review' },
                    { id: 'completed' as const, label: 'Completed Today' },
                  ].map((sec) => {
                    const isChecked = choreExpandedSections.includes(sec.id);
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setChoreExpandedSections((prev) =>
                            prev.includes(sec.id)
                              ? prev.filter((s) => s !== sec.id)
                              : [...prev, sec.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-800/80 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400">
                  Manage chore templates, profiles, avatars, and point pricing in the Parent Drawer.
                </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setChoreParentDrawerOpen(true, 'templates');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 border border-gray-700 transition-colors cursor-pointer"
                  >
                    Manage Chores &amp; Profiles
                  </button>
                </div>
              </div>
            )}

            {/* Family Meal Planner Settings */}
            {widget.type === 'meals' && (
              <div className="space-y-4 pt-2 border-t border-gray-800">
                <div>
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5 mb-1.5">
                    <Utensils className="w-3.5 h-3.5 text-amber-300" />
                    <span>Meal Outlook Scope</span>
                  </label>
                  <p className="text-[11px] text-gray-400 mb-2.5">
                    Choose how many upcoming days this Bento tile displays at a glance.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'today', label: 'Today', desc: 'Focused today view' },
                        { id: 'tomorrow', label: 'Tomorrow', desc: 'Compact next-day' },
                        { id: 'three_day', label: '3-Day Outlook', desc: 'Today + 2 days' },
                        { id: 'full_week', label: 'Full Week', desc: '7-box weekly grid' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMealScope(opt.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          mealScope === opt.id
                            ? 'bg-amber-500/15 border-amber-400/60 text-amber-200 font-semibold'
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        <span className="text-xs block font-semibold">{opt.label}</span>
                        <span className="text-[10px] text-gray-400 font-normal block mt-0.5">
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                    Week Starts On
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'sunday', label: 'Sunday' },
                        { id: 'monday', label: 'Monday' },
                      ] as const
                    ).map((dayOpt) => (
                      <button
                        key={dayOpt.id}
                        type="button"
                        onClick={() => {
                          setMealWeekStartsOn(dayOpt.id);
                          void useMealStore.getState().setWeekStartsOn(dayOpt.id);
                        }}
                        className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          mealWeekStartsOn === dayOpt.id
                            ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-200 font-semibold'
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        {dayOpt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                    Visible Meal Slots
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'breakfast', label: 'Breakfast' },
                        { id: 'lunch', label: 'Lunch' },
                        { id: 'dinner', label: 'Dinner' },
                      ] as const
                    ).map((slotOpt) => {
                      const isActive = mealVisibleSlots.includes(slotOpt.id);
                      return (
                        <button
                          key={slotOpt.id}
                          type="button"
                          onClick={() => {
                            setMealVisibleSlots((prev) => {
                              if (prev.includes(slotOpt.id)) {
                                return prev.length > 1
                                  ? prev.filter((s) => s !== slotOpt.id)
                                  : prev;
                              }
                              return [...prev, slotOpt.id];
                            });
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-200 font-semibold'
                              : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                          }`}
                        >
                          {slotOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-950/80 border border-gray-800">
                  <div>
                    <span className="text-xs font-semibold text-gray-200 block">
                      Show Assigned Cook Avatar
                    </span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">
                      Display mini profile badge on scheduled meal pills when a cook is assigned.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={mealShowCookAvatar}
                    onClick={() => setMealShowCookAvatar((prev) => !prev)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                      mealShowCookAvatar ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        mealShowCookAvatar ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                    Target Shopping List Sticky Note
                  </label>
                  <p className="text-[11px] text-gray-400 mb-2">
                    Choose which canvas checklist sticky note receives grocery items when you tap &ldquo;To Sticky Note&rdquo;.
                  </p>
                  <select
                    value={mealListNoteId}
                    onChange={(e) => setMealListNoteId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-200 focus:outline-none focus:border-amber-500/60"
                  >
                    <option value="">
                      Auto (Dedicated 🛒 Shopping List Sticky Note — creates if missing)
                    </option>
                    {boardNotes
                      .filter(
                        (n) =>
                          (n.isShoppingList || n.freeformPos?.isShoppingList || n.isChecklist) &&
                          !n.deleted_at &&
                          !n.archivedAt
                      )
                      .sort((a, b) => {
                        const aShop = Boolean(a.isShoppingList || a.freeformPos?.isShoppingList);
                        const bShop = Boolean(b.isShoppingList || b.freeformPos?.isShoppingList);
                        return aShop === bShop ? 0 : aShop ? -1 : 1;
                      })
                      .map((n) => {
                        const isShop = Boolean(n.isShoppingList || n.freeformPos?.isShoppingList);
                        const firstLine = (n.title || n.content || '')
                          .split('\n')[0]
                          .replace(/^#+\s*/, '')
                          .trim();
                        return (
                          <option key={n.id} value={n.id}>
                            {isShop ? `[Shopping List] ${firstLine || '🛒 Shopping List'}` : firstLine || 'Untitled Checklist Note'}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>
            )}

            {/* KANBAN WIDGET SETTINGS */}
            {widget.type === 'kanban' && (
              <div className="space-y-4 pt-2 border-t border-gray-800">
                <div>
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5 mb-1.5">
                    <Kanban className="w-3.5 h-3.5 text-slate-300" />
                    <span>Pinned Kanban Board (This Widget Only)</span>
                  </label>
                  <p className="text-[11px] text-gray-400 mb-2">
                    Each Project Kanban tile selects its own active board independently across your Bento tabs.
                  </p>
                  <select
                    value={kanbanBoardId}
                    onChange={(e) => setKanbanBoardId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/60"
                  >
                    {kanbanBoards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                    Compact View Default Column
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {KANBAN_COLUMNS.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => setKanbanColumnId(col.id)}
                        className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          kanbanColumnId === col.id
                            ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-200 font-semibold'
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        {col.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                    Canvas Presentation Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'tile' as const, label: 'Compact Single-Column Tile' },
                      { id: 'view' as const, label: 'Full 3-Column Swimlane View' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setKanbanDisplayMode(opt.id)}
                        className={`p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          kanbanDisplayMode === opt.id
                            ? 'bg-emerald-600/20 border-emerald-500/60 text-emerald-200 font-semibold'
                            : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-blue-500/25 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      <CalendarUrlGuideModal
        isOpen={isCalendarGuideOpen}
        onClose={() => setIsCalendarGuideOpen(false)}
      />

      <MediaSearchModal
        isOpen={isMediaSearchOpen}
        onClose={() => setIsMediaSearchOpen(false)}
        onSelect={(selectedUrl, selectedTitle, meta?: MediaSelectionMeta) => {
          setImageUrl(selectedUrl);
          setImageMp4Url(meta?.mp4Url);
          setImageMediaSource(meta?.mediaSource);
          if (selectedTitle && !imageCaption) {
            setImageCaption(selectedTitle);
          }
        }}
        initialUrl={imageUrl}
      />
    </div>
  );
};
