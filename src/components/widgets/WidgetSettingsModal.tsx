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
} from 'lucide-react';
import type { DashboardWidget } from '../../types/dashboard';
import type { CalendarSource } from '../../services/feeds';

interface WidgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: DashboardWidget | null;
  onSave: (widgetId: string, updates: { title?: string; config: Record<string, any> }) => void;
  onOpenPhotoSources?: () => void;
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

  // Weather states
  const [locationName, setLocationName] = useState('Austin, TX');
  const [tempUnit, setTempUnit] = useState<'F' | 'C'>('F');
  const [latitude, setLatitude] = useState<number>(30.2672);
  const [longitude, setLongitude] = useState<number>(-97.7431);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');

  // Clock states
  const [clockFace, setClockFace] = useState<'digital' | 'minimal' | 'analog'>('digital');
  const [showSeconds, setShowSeconds] = useState(true);

  // RSS states
  const [rssFeedUrl, setRssFeedUrl] = useState('');

  // Calendar states
  const [calendarDefaultView, setCalendarDefaultView] = useState<'agenda' | 'month'>('agenda');
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>(DEFAULT_CALENDAR_SOURCES);
  const [newCalName, setNewCalName] = useState('');
  const [newCalUrl, setNewCalUrl] = useState('');
  const [newCalColor, setNewCalColor] = useState(CALENDAR_COLORS[0]);

  // Populate initial state when modal opens with a widget
  useEffect(() => {
    if (!widget) return;

    setTitle(widget.title || '');
    setGeoStatus('');

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
    } else if (widget.type === 'weather' || widget.type === 'clock_weather') {
      setLocationName(widget.config?.locationName || 'Austin, TX');
      setTempUnit(widget.config?.unit || 'F');
      setLatitude(widget.config?.latitude ?? 30.2672);
      setLongitude(widget.config?.longitude ?? -97.7431);
      setClockFace(widget.config?.clockFace || widget.config?.face || 'digital');
    } else if (widget.type === 'clock') {
      setClockFace(widget.config?.clockFace || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
    } else if (widget.type === 'rss') {
      setRssFeedUrl(widget.config?.feedUrl || 'https://news.ycombinator.com/rss');
    } else if (widget.type === 'calendar') {
      setCalendarDefaultView(widget.config?.defaultView || 'agenda');
      setCalendarSources(
        Array.isArray(widget.config?.sources) && widget.config.sources.length > 0
          ? widget.config.sources
          : DEFAULT_CALENDAR_SOURCES
      );
    }
  }, [widget, isOpen]);

  if (!isOpen || !widget) return null;

  const handleLookupCity = async () => {
    if (!locationName.trim()) return;
    setGeoLoading(true);
    setGeoStatus('Searching coordinates...');
    try {
      const q = encodeURIComponent(locationName.trim().split(',')[0]);
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`
      );
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const hit = data.results[0];
        const formatted = hit.admin1
          ? `${hit.name}, ${hit.admin1}`
          : `${hit.name}, ${hit.country || ''}`;
        setLocationName(formatted);
        setLatitude(Number(hit.latitude.toFixed(4)));
        setLongitude(Number(hit.longitude.toFixed(4)));
        setGeoStatus(`Found: ${formatted} (${hit.latitude.toFixed(2)}, ${hit.longitude.toFixed(2)})`);
      } else {
        setGeoStatus('City not found. Try just the city name (e.g., Seattle).');
      }
    } catch {
      setGeoStatus('Failed to lookup coordinates.');
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
    } else if (widget.type === 'weather' || widget.type === 'clock_weather') {
      configUpdates.locationName = locationName.trim();
      configUpdates.unit = tempUnit;
      configUpdates.latitude = Number(latitude);
      configUpdates.longitude = Number(longitude);
      if (widget.type === 'clock_weather') {
        configUpdates.face = clockFace;
        configUpdates.clockFace = clockFace;
      }
    } else if (widget.type === 'clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
    } else if (widget.type === 'rss') {
      configUpdates.feedUrl = rssFeedUrl.trim();
    } else if (widget.type === 'calendar') {
      configUpdates.defaultView = calendarDefaultView;
      configUpdates.sources = calendarSources;
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
                    { id: 'polaroid', label: 'Classic Polaroid' },
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

              {/* Prominent Photo Sources Connector Button */}
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
                    onClick={handleLookupCity}
                    disabled={geoLoading}
                    className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                    title="Auto-lookup latitude and longitude for this city"
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

          {/* Clock Settings (For both Clock and Clock + Weather Combo) */}
          {(widget.type === 'clock' || widget.type === 'clock_weather') && (
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

              {widget.type === 'clock' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-950 border border-gray-800">
                  <span className="text-xs text-gray-300">Show Seconds Hand / Ticker:</span>
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
