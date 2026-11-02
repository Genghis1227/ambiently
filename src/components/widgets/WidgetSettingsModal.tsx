import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Check,
  Sliders,
  Plus,
  Trash2,
  Search,
  Calendar,
  Tv,
  Quote,
  Globe,
} from 'lucide-react';
import type { DashboardWidget } from '../../types/dashboard';
import type { CalendarSource } from '../../services/feeds';
import type { QuoteItem } from '../../services/quotes';
import { EMBED_PRESETS, type EmbedPresetId } from './MediaEmbedWidget';
import { DEFAULT_WORLD_CITIES, type WorldClockCity } from './WorldClockWidget';

interface WidgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: DashboardWidget | null;
  onSave: (widgetId: string, updates: { title?: string; config: Record<string, any> }) => void;
  onOpenPhotoSources?: () => void;
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
  const [title, setTitle] = useState('');

  // Countdown states
  const [countdownDate, setCountdownDate] = useState('');
  const [countdownTime, setCountdownTime] = useState('00:00');

  // Photo Frame states
  const [photoStyle, setPhotoStyle] = useState<string>('ken_burns');
  const [photoIntervalSec, setPhotoIntervalSec] = useState<number>(15);
  const [polaroidCount, setPolaroidCount] = useState<number>(widget?.config?.polaroidCount || 12);
  const [polaroidSizeMode, setPolaroidSizeMode] = useState<'mixed' | 'uniform' | 'small' | 'large'>(widget?.config?.polaroidSizeMode || 'mixed');

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
  const [worldCities, setWorldCities] = useState<WorldClockCity[]>(DEFAULT_WORLD_CITIES);
  const [worldCitySearch, setWorldCitySearch] = useState('');

  // RSS states
  const [rssFeedUrl, setRssFeedUrl] = useState('');

  // Calendar states
  const [calendarDefaultView, setCalendarDefaultView] = useState<'agenda' | 'month'>('agenda');
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>(DEFAULT_CALENDAR_SOURCES);
  const [newCalName, setNewCalName] = useState('');
  const [newCalUrl, setNewCalUrl] = useState('');
  const [newCalColor, setNewCalColor] = useState(CALENDAR_COLORS[0]);

  // Embed states
  const [embedPreset, setEmbedPreset] = useState<EmbedPresetId>('lofi');
  const [embedCustomUrl, setEmbedCustomUrl] = useState('');
  const [embedMuted, setEmbedMuted] = useState(true);

  // Quotes states
  const [quoteMode, setQuoteMode] = useState<'curated' | 'custom' | 'both'>('both');
  const [customQuotes, setCustomQuotes] = useState<QuoteItem[]>([]);
  const [newQuoteText, setNewQuoteText] = useState('');
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('');

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
      setPhotoStyle(widget.config?.displayStyle || 'ken_burns');
      setPhotoIntervalSec(widget.config?.rotationIntervalSec || 15);
      setPolaroidCount(widget.config?.polaroidCount || 12);
      setPolaroidSizeMode(widget.config?.polaroidSizeMode || 'mixed');
    } else if (widget.type === 'weather' || widget.type === 'clock_weather') {
      setLocationName(widget.config?.locationName || 'Austin, TX');
      setTempUnit(widget.config?.unit || 'F');
      setLatitude(widget.config?.latitude ?? 30.2672);
      setLongitude(widget.config?.longitude ?? -97.7431);
      setTimezone(widget.config?.timezone || '');
      setClockFace(widget.config?.clockFace || widget.config?.face || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
    } else if (widget.type === 'clock') {
      setClockFace(widget.config?.clockFace || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
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
      setRssFeedUrl(widget.config?.feedUrl || 'https://news.ycombinator.com/rss');
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
    }
  }, [widget, isOpen]);

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
    const added: CalendarSource = {
      id: `cal-${Date.now()}`,
      name: newCalName.trim() || 'Custom Calendar',
      url: newCalUrl.trim(),
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
      configUpdates.displayStyle = photoStyle;
      configUpdates.rotationIntervalSec = photoIntervalSec;
      configUpdates.polaroidCount = polaroidCount;
      configUpdates.polaroidSizeMode = polaroidSizeMode;
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
      }
    } else if (widget.type === 'clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
      configUpdates.timezone = timezone || undefined;
      configUpdates.locationName = locationName.trim() || undefined;
    } else if (widget.type === 'world_clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
      configUpdates.cities = worldCities.length > 0 ? worldCities : DEFAULT_WORLD_CITIES;
    } else if (widget.type === 'rss') {
      configUpdates.feedUrl = rssFeedUrl.trim();
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
    }

    onSave(widget.id, {
      title: title.trim() || widget.title,
      config: configUpdates,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
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
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Slideshow Animation Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ken_burns', label: 'Ken Burns (Slow Pan)' },
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

              {onOpenPhotoSources && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPhotoSources();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-purple-500/20 border border-amber-500/40 hover:border-amber-400 text-white transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Sliders className="w-4 h-4 text-amber-400" />
                      <div className="text-left">
                        <span className="text-xs font-bold block text-amber-200">
                          Connect Photo Sources
                        </span>
                        <span className="text-[10px] text-gray-300">
                          Plex PIN QR Code, Local NAS Folders, Google Drive / Web links
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform">
                      ➔
                    </span>
                  </button>
                </div>
              )}
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarDefaultView('agenda')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      calendarDefaultView === 'agenda'
                        ? 'bg-emerald-600/30 border border-emerald-500 text-emerald-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    Agenda Schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDefaultView('month')}
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      calendarDefaultView === 'month'
                        ? 'bg-emerald-600/30 border border-emerald-500 text-emerald-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    Monthly Grid
                  </button>
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
                <span className="text-xs font-bold text-gray-200 block">
                  + Add Google, Apple, or Outlook iCal Feed (.ics / webcal://)
                </span>
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
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  RSS Feed URL
                </label>
                <input
                  type="url"
                  value={rssFeedUrl}
                  onChange={(e) => setRssFeedUrl(e.target.value)}
                  placeholder="https://news.ycombinator.com/rss"
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
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
    </div>
  );
};
