import React, { useEffect } from 'react';
import {
  X,
  CloudSun,
  Clock,
  Globe,
  LayoutGrid,
  Image as ImageIcon,
  Calendar,
  Rss,
  Timer,
  Quote,
  StickyNote,
  Tv,
  Plus,
  Type,
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
    description: 'Minimalist live digital, typographic, or analog dial clock with optional seconds and city timezone.',
    icon: Clock,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { clockFace: 'digital', showSeconds: true },
    color: 'from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30',
  },
  {
    type: 'world_clock',
    title: 'World Timezone Clock',
    description: 'City-lookup timezone tile showing live time, day/night status, and hour offset for 1 or more global cities.',
    icon: Globe,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: {
      clockFace: 'digital',
      showSeconds: true,
      cities: [
        { id: 'wc-tokyo', cityName: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
      ],
    },
    color: 'from-teal-500/20 to-cyan-500/20 text-teal-400 border-teal-500/30',
  },
  {
    type: 'clock_weather',
    title: 'Clock & Weather Combo',
    description: 'Dual tile showing the current time, day, date, and local temperature combined.',
    icon: LayoutGrid,
    defaultGridPos: { w: 4, h: 4 },
    defaultConfig: { locationName: 'Austin, TX', latitude: 30.2672, longitude: -97.7431, unit: 'F', showSeconds: true },
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
    defaultConfig: { feedUrl: 'https://tony.trinhism.com/index.xml' },
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
    type: 'textbox',
    title: 'Text Box & Canvas Heading',
    description: 'Formatted text, titles, announcements, or custom labels with transparent background & typography options.',
    icon: Type,
    defaultGridPos: { w: 4, h: 2 },
    defaultConfig: {
      content: 'Ambient Smart Display\nCommand Center',
      fontSize: '2xl',
      fontWeight: 'bold',
      textAlign: 'center',
      fontFamily: 'sans',
      textColor: '#ffffff',
      textShadow: true,
      textTransform: 'none',
      letterSpacing: 'normal',
      bgStyle: 'transparent',
    },
    color: 'from-blue-500/20 to-cyan-500/20 text-cyan-300 border-cyan-500/30',
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
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] cursor-default"
      >
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
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grid of Available Widget Templates */}
        <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WIDGET_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.type}
                onClick={() => handleSelectTemplate(tpl)}
                className="flex items-start gap-3.5 p-3.5 rounded-xl bg-gray-800/40 hover:bg-gray-800/80 border border-gray-800 hover:border-gray-700 text-left transition-all cursor-pointer group"
              >
                <div
                  className={`p-3 rounded-xl bg-gradient-to-br border ${tpl.color} shrink-0 group-hover:scale-105 transition-transform`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                      {tpl.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
