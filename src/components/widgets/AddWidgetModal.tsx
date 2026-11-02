import React from 'react';
import {
  X,
  CloudSun,
  Clock,
  LayoutGrid,
  Image as ImageIcon,
  Calendar,
  Rss,
  Timer,
  Quote,
  StickyNote,
  Tv,
  Plus,
} from 'lucide-react';
import type { WidgetType, DashboardWidget } from '../../types/dashboard';

interface AddWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId: string;
  onAddWidget: (widget: Partial<DashboardWidget>) => void;
}

interface WidgetTemplate {
  type: WidgetType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultGridPos: { w: number; h: number };
  defaultConfig?: Record<string, any>;
  color: string;
}

const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    type: 'weather',
    title: 'Live Weather & Forecast',
    description: 'Current temperature, condition icon, humidity, wind, and a 5-day daily forecast strip.',
    icon: CloudSun,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { locationName: 'Austin, TX', latitude: 30.2672, longitude: -97.7431, unit: 'F' },
    color: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
  },
  {
    type: 'clock',
    title: 'Ambient Clock',
    description: 'Minimalist live digital, typographic, or analog dial clock with date and seconds.',
    icon: Clock,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { clockFace: 'digital', showSeconds: true },
    color: 'from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30',
  },
  {
    type: 'clock_weather',
    title: 'Clock & Weather Combo',
    description: 'Dual tile showing the current time, day, date, and local temperature combined.',
    icon: LayoutGrid,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { locationName: 'Austin, TX', latitude: 30.2672, longitude: -97.7431, unit: 'F' },
    color: 'from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30',
  },
  {
    type: 'photo_frame',
    title: 'Ambient Photo Frame',
    description: 'Slideshow supporting Plex Media Server, Local NAS folders, and Google Drive links.',
    icon: ImageIcon,
    defaultGridPos: { w: 4, h: 8 },
    defaultConfig: { displayStyle: 'ken_burns', rotationIntervalSec: 15 },
    color: 'from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30',
  },
  {
    type: 'embed',
    title: 'Ambient Stream & Web Embed',
    description: '1-click Lofi Beats radio, 4K Cozy Fireplace, NASA Live Earth, Weather Radar, or custom URLs.',
    icon: Tv,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { preset: 'lofi', muted: true, customUrl: '' },
    color: 'from-pink-500/20 to-rose-500/20 text-pink-400 border-pink-500/30',
  },
  {
    type: 'calendar',
    title: 'Family Calendar',
    description: 'Live agenda schedule and monthly calendar grid synced via public iCal URLs.',
    icon: Calendar,
    defaultGridPos: { w: 4, h: 8 },
    defaultConfig: { defaultView: 'agenda' },
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
  },
  {
    type: 'rss',
    title: 'Live News & RSS Feed',
    description: 'Rotating news headlines and article summaries from your favorite RSS feeds.',
    icon: Rss,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { feedUrl: 'https://news.ycombinator.com/rss' },
    color: 'from-orange-500/20 to-red-500/20 text-orange-400 border-orange-500/30',
  },
  {
    type: 'countdown',
    title: 'Milestone Countdown',
    description: 'Real-time countdown timer to upcoming family vacations, birthdays, or holidays.',
    icon: Timer,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { eventName: 'Family Vacation', targetDate: '2026-12-25T00:00:00Z' },
    color: 'from-indigo-500/20 to-violet-500/20 text-indigo-400 border-indigo-500/30',
  },
  {
    type: 'quotes',
    title: 'Daily Inspiration & Affirmations',
    description: 'Rotating collection of timeless quotes, wisdom, and custom family affirmations.',
    icon: Quote,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { quoteMode: 'both', customQuotes: [] },
    color: 'from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/30',
  },
  {
    type: 'sticky_notes',
    title: 'Sticky Notes & Reminders',
    description: 'Card tile for quick messages, reminders, color-coded notes, and task lists.',
    icon: StickyNote,
    defaultGridPos: { w: 4, h: 8 },
    defaultConfig: {},
    color: 'from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30',
  },
];

export const AddWidgetModal: React.FC<AddWidgetModalProps> = ({
  isOpen,
  onClose,
  activeTabId,
  onAddWidget,
}) => {
  if (!isOpen) return null;

  const handleSelectTemplate = (tpl: WidgetTemplate) => {
    onAddWidget({
      tabId: activeTabId,
      type: tpl.type,
      title: tpl.title,
      gridPos: { x: 0, y: 0, w: tpl.defaultGridPos.w, h: tpl.defaultGridPos.h },
      config: tpl.defaultConfig || {},
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Add Widget to Dashboard</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Select any tile below to pin it to your current dashboard view.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Catalog Grid */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3">
          {WIDGET_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <div
                key={tpl.type}
                onClick={() => handleSelectTemplate(tpl)}
                className={`p-4 rounded-xl border bg-gradient-to-br ${tpl.color} hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-between group shadow-lg`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-white">
                      <Icon className="w-4 h-4" />
                      <span>{tpl.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-black/40 text-gray-300">
                      {tpl.defaultGridPos.w}x{tpl.defaultGridPos.h}
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <span className="text-xs font-bold text-white group-hover:underline flex items-center gap-1">
                    <span>+ Add Tile</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
