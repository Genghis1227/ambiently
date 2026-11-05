import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DashboardWidget } from '../../types/dashboard';
import { type CalendarSource, normalizeCalendarUrl } from '../../services/feeds';
import { CalendarUrlGuideModal } from '../calendar/CalendarUrlGuideModal';
import type { QuoteItem } from '../../services/quotes';
import { EMBED_PRESETS, type EmbedPresetId } from './MediaEmbedWidget';
import { DEFAULT_WORLD_CITIES, type WorldClockCity } from './WorldClockWidget';
import type { TextBoxConfig } from './TextBoxWidget';
import { CURATED_RSS_FEEDS } from '../../data/curatedFeeds';
import { MediaSearchModal } from './MediaSearchModal';
import { Sparkles } from 'lucide-react';

interface WidgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: DashboardWidget | null;
  onSave: (widgetId: string, updates: { title?: string; config: Record<string, any> }) => void;
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
  const [title, setTitle] = useState('');

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

  // RSS states
  const [rssFeedUrl, setRssFeedUrl] = useState('');
  const [rssTextSize, setRssTextSize] = useState<'auto' | 'sm' | 'base' | 'lg' | 'xl'>('auto');

  // Calendar states
  const [calendarDefaultView, setCalendarDefaultView] = useState<'agenda' | '3day' | 'week' | 'month'>('agenda');
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>(DEFAULT_CALENDAR_SOURCES);
  const [newCalName, setNewCalName] = useState('');
  const [newCalUrl, setNewCalUrl] = useState('');
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

  // Single Image / GIF states
  const [imageUrl, setImageUrl] = useState('');
  const [imageFit, setImageFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [imageCaption, setImageCaption] = useState('');
  const [imageTransparentBg, setImageTransparentBg] = useState(false);
  const [imageLinkUrl, setImageLinkUrl] = useState('');
  const [isMediaSearchOpen, setIsMediaSearchOpen] = useState(false);

  // Populate initial state when modal opens with a widget
  useEffect(() => {
    if (!widget) return;

    setTitle(widget.title || '');
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
      setCalendarSources(
        Array.isArray(widget.config?.sources) && widget.config.sources.length > 0
          ? widget.config.sources
          : DEFAULT_CALENDAR_SOURCES
      );
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
      setTextBgStyle(widget.config?.bgStyle || 'transparent');
    } else if (widget.type === 'image') {
      setImageUrl(widget.config?.url || '');
      setImageFit(widget.config?.fit || 'contain');
      setImageCaption(widget.config?.caption || '');
      setImageTransparentBg(Boolean(widget.config?.transparentBg));
      setImageLinkUrl(widget.config?.linkUrl || '');
    }
  }, [widget, isOpen, settings.commonPhotos]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  const handleAddCalendarSource = () => {
    if (!newCalUrl.trim()) return;
    const normalized = normalizeCalendarUrl(newCalUrl);
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

  const handleSave = () => {
    const configUpdates: Record<string, any> = { ...widget.config };

    if (widget.type === 'countdown') {
      const dtString = `${countdownDate || '2026-12-25'}T${countdownTime || '00:00'}:00`;
      const iso = new Date(dtString).toISOString();
      configUpdates.eventName = title.trim() || 'Upcoming Milestone';
      configUpdates.targetDate = iso;
    } else if (widget.type === 'photo_frame') {
      configUpdates.useCommonSource = useCommonSource;
      configUpdates.displayStyle = photoStyle;
      configUpdates.rotationIntervalSec = photoIntervalSec;
      configUpdates.polaroidCount = polaroidCount;
      configUpdates.polaroidSizeMode = polaroidSizeMode;
      configUpdates.photoOrder = photoOrder;
      configUpdates.showCaptions = showCaptions;
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
      configUpdates.bgStyle = textBgStyle;
    } else if (widget.type === 'image') {
      configUpdates.url = imageUrl.trim();
      configUpdates.fit = imageFit;
      configUpdates.caption = imageCaption.trim();
      configUpdates.transparentBg = imageTransparentBg;
      configUpdates.linkUrl = imageLinkUrl.trim();
    }

    onSave(widget.id, {
      title: title.trim() || widget.title,
      config: configUpdates,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
          {widget.type === 'photo_frame' && (
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
                          widget.config.sourceType || 'web'
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
                      Syncs with all shared photo frames ({settings.commonPhotos?.length ? `${settings.commonPhotos.length.toLocaleString()} photos` : 'Curated Scenery'})
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
                      Independent album ({widget.config?.customPhotos?.length ? `${widget.config.customPhotos.length.toLocaleString()} photos` : 'Curated Scenery'})
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
                      {widget.config.sourceUrl && (
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
                        widget.config.sourceLabel || 'Google Photos & Web',
                        widget.config.sourceUrl,
                        widget.config.sourceType || 'web'
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
                      onClose();
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
                            : widget.config?.sourceLabel) && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold truncate max-w-[160px]">
                              {useCommonSource
                                ? (settings.commonPhotoSourceLabel || 'Shared Library')
                                : widget.config?.sourceLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 block mt-0.5">
                          Google Photos shared albums, Local PC / NAS Folders, Plex Media Server, or Curated Scenery
                        </span>
                        {/* Display active source link if available */}
                        {(() => {
                          const activeUrl = useCommonSource
                            ? (settings.commonPhotoSourceUrl || widget.config?.sourceUrl)
                            : widget.config?.sourceUrl;
                          if (!activeUrl) return null;
                          return (
                            <div className="text-[10px] font-mono text-blue-300/90 truncate max-w-[340px] mt-1 bg-black/40 px-2 py-0.5 rounded border border-blue-500/20">
                              🔗 {activeUrl}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform shrink-0 ml-2">
                      ➔
                    </span>
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Picture Presentation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ken_burns', label: 'Ken Burns (Slow Pan & Zoom)' },
                    { id: 'mosaic', label: 'Mosaic Collage' },
                    { id: 'polaroid', label: 'Scattered Polaroids' },
                    { id: 'filmstrip', label: 'Filmstrip' },
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
            </div>
          )}

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

                  {/* Active Cities List */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block">
                      Active Timezone Cities ({worldCities.length}) —{' '}
                      {worldCities.length === 1 ? 'Single Hero Clock' : 'Multi-City List'}
                    </span>
                    {worldCities.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950 border border-gray-800 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">
                            {c.cityName}
                            {c.country ? `, ${c.country}` : ''}
                          </span>
                          <span className="text-[10px] font-mono text-cyan-400 ml-2">
                            {c.timezone}
                          </span>
                        </div>
                        {worldCities.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setWorldCities(worldCities.filter((item) => item.id !== c.id))
                            }
                            className="p-1 text-gray-500 hover:text-red-400 cursor-pointer"
                            title="Remove city"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
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
                  onChange={(e) => setNewCalUrl(e.target.value)}
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
                    onClick={handleAddCalendarSource}
                    disabled={!newCalUrl.trim()}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Feed</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RSS Settings */}
          {widget.type === 'rss' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              {/* Curated Feeds Picker */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                  Featured & Recommended Feeds
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {CURATED_RSS_FEEDS.map((feed) => {
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
                    textBgStyle === 'glass'
                      ? 'bg-gray-950/40 backdrop-blur-md border-white/10'
                      : textBgStyle === 'solid'
                      ? 'bg-gray-900 border-gray-800'
                      : 'bg-black/30 border-dashed border-gray-700/60'
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
                      { id: 'transparent', label: 'Clean' },
                      { id: 'glass', label: 'Glass' },
                      { id: 'solid', label: 'Dark' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setTextBgStyle(bg.id as any)}
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
                    {imageUrl ? (
                      <img
                        src={imageUrl}
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
                  onChange={(e) => setImageUrl(e.target.value)}
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
        onSelect={(selectedUrl, selectedTitle) => {
          setImageUrl(selectedUrl);
          if (selectedTitle && !imageCaption) {
            setImageCaption(selectedTitle);
          }
        }}
        initialUrl={imageUrl}
      />
    </div>
  );
};
