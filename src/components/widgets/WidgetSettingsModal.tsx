import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Check,
  Sliders,
} from 'lucide-react';
import type { DashboardWidget } from '../../types/dashboard';

interface WidgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widget: DashboardWidget | null;
  onSave: (widgetId: string, updates: { title?: string; config: Record<string, any> }) => void;
  onOpenPhotoSources?: () => void;
}

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

  // Clock states
  const [clockFace, setClockFace] = useState<'digital' | 'minimal'>('digital');
  const [showSeconds, setShowSeconds] = useState(true);

  // RSS states
  const [rssFeedUrl, setRssFeedUrl] = useState('');

  // Calendar states
  const [calendarDefaultView, setCalendarDefaultView] = useState<'agenda' | 'month'>('agenda');

  // Populate initial state when modal opens with a widget
  useEffect(() => {
    if (!widget) return;

    setTitle(widget.title || '');

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
    } else if (widget.type === 'clock') {
      setClockFace(widget.config?.clockFace || 'digital');
      setShowSeconds(widget.config?.showSeconds ?? true);
    } else if (widget.type === 'rss') {
      setRssFeedUrl(widget.config?.feedUrl || 'https://news.ycombinator.com/rss');
    } else if (widget.type === 'calendar') {
      setCalendarDefaultView(widget.config?.defaultView || 'agenda');
    }
  }, [widget, isOpen]);

  if (!isOpen || !widget) return null;

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
    } else if (widget.type === 'clock') {
      configUpdates.clockFace = clockFace;
      configUpdates.showSeconds = showSeconds;
    } else if (widget.type === 'rss') {
      configUpdates.feedUrl = rssFeedUrl.trim();
    } else if (widget.type === 'calendar') {
      configUpdates.defaultView = calendarDefaultView;
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
                  Location Name
                </label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g., Austin, TX"
                  className="w-full rounded-xl bg-gray-950 border border-gray-800 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                />
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

          {/* Clock Settings */}
          {widget.type === 'clock' && (
            <div className="space-y-4 pt-2 border-t border-gray-800">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                  Clock Face
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setClockFace('digital')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      clockFace === 'digital'
                        ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400'
                    }`}
                  >
                    Digital (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => setClockFace('minimal')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      clockFace === 'minimal'
                        ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                        : 'bg-gray-950 border border-gray-800 text-gray-400'
                    }`}
                  >
                    Minimalist
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-950 border border-gray-800">
                <span className="text-xs text-gray-300">Show Seconds:</span>
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
