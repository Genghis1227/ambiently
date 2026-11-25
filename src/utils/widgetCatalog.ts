import type { DashboardWidget, WidgetType } from '../types/dashboard';
import { DEFAULT_FINANCE_WATCHLIST } from '../types/finance';
import { DEFAULT_DECISION_OPTIONS } from './decisionEngine';
import { DEFAULT_SPORTS_LEAGUES } from '../types/phase3Widgets';
import {
  DEFAULT_SOUNDSCAPE_CHANNELS,
  DEFAULT_SOUNDSCAPE_MASTER_VOLUME,
} from './soundscapeEngine';

export type WidgetCategoryId =
  | 'all'
  | 'household'
  | 'time_weather'
  | 'media_ambient'
  | 'text_feeds';

export type WidgetCatalogIconKey =
  | 'cloud_sun'
  | 'clock'
  | 'photo_frame'
  | 'embed'
  | 'chores'
  | 'meals'
  | 'kanban'
  | 'calendar'
  | 'rss'
  | 'countdown'
  | 'textbox'
  | 'sticky_notes'
  | 'image'
  | 'finance'
  | 'timer'
  | 'air_quality'
  | 'sun_moon'
  | 'routines'
  | 'wifi_qr'
  | 'decision_maker'
  | 'sports'
  | 'daily_discovery'
  | 'chalkboard'
  | 'soundscape'
  | 'homelab'
  | 'now_playing';

export interface WidgetCategoryMeta {
  id: WidgetCategoryId;
  label: string;
}

export const WIDGET_CATEGORIES: WidgetCategoryMeta[] = [
  { id: 'all', label: 'All Tiles' },
  { id: 'household', label: 'Household & Planning' },
  { id: 'time_weather', label: 'Time & Weather' },
  { id: 'media_ambient', label: 'Media & Ambient' },
  { id: 'text_feeds', label: 'Text & Feeds' },
];

export interface WidgetVariantSpec {
  type: WidgetType;
  pillLabel: string;
  title: string;
  description: string;
  defaultGridPos: { w: number; h: number };
  defaultConfig: Record<string, any>;
  keywords: string[];
}

export interface WidgetCatalogEntry {
  id: string;
  category: Exclude<WidgetCategoryId, 'all'>;
  title: string;
  description: string;
  iconKey: WidgetCatalogIconKey;
  color: string;
  keywords: string[];
  variants: [WidgetVariantSpec, ...WidgetVariantSpec[]];
}

export interface WeatherDefaults {
  locationName: string;
  latitude: number;
  longitude: number;
  unit: 'F' | 'C';
  timezone?: string;
}

export interface HouseholdInheritedDefaults {
  weather: WeatherDefaults;
  hasCustomWeather: boolean;
  calendarSources?: Array<Record<string, any>>;
  haBaseUrl?: string;
}

export const DEFAULT_WEATHER_DEFAULTS: WeatherDefaults = {
  locationName: 'Austin, TX',
  latitude: 30.2672,
  longitude: -97.7431,
  unit: 'F',
};

export const WIDGET_CATALOG_ENTRIES: WidgetCatalogEntry[] = [
  {
    id: 'calendar',
    category: 'household',
    title: 'Family Calendar',
    description:
      'Live agenda, multi-day, timeline, and monthly calendar grid synced via iCal URLs with optional Planned Meals overlay.',
    iconKey: 'calendar',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
    keywords: ['schedule', 'events', 'ical', 'google', 'icloud', 'agenda', 'month', 'week'],
    variants: [
      {
        type: 'calendar',
        pillLabel: 'Family Calendar',
        title: 'Family Calendar',
        description: 'Live agenda schedule and monthly calendar grid synced via public iCal URLs.',
        defaultGridPos: { w: 4, h: 8 },
        defaultConfig: { defaultView: 'agenda' },
        keywords: ['calendar', 'schedule', 'agenda', 'ical', 'events'],
      },
    ],
  },
  {
    id: 'meals',
    category: 'household',
    title: 'Family Meal Planner',
    description:
      'Calm Today, Tomorrow, 3-Day, or Week meal outlook with recipe links, counter cooking mode, and smart grocery lists.',
    iconKey: 'meals',
    color: 'from-amber-500/15 to-emerald-500/15 text-amber-300 border-amber-500/30',
    keywords: ['dinner', 'lunch', 'breakfast', 'recipes', 'grocery', 'menu', 'kitchen', 'cooking'],
    variants: [
      {
        type: 'meals',
        pillLabel: 'Meal Planner',
        title: 'Family Meal Planner',
        description:
          'Calm Today, Tomorrow, 3-Day, or Week meal outlook with recipe links and smart grocery lists.',
        defaultGridPos: { w: 4, h: 6 },
        defaultConfig: {
          scope: 'three_day',
          visibleSlots: ['breakfast', 'lunch', 'dinner'],
          showCookAvatar: true,
        },
        keywords: ['meals', 'recipes', 'menu', 'grocery', 'kitchen'],
      },
    ],
  },
  {
    id: 'chores',
    category: 'household',
    title: 'Family Chores & Rewards',
    description:
      'Interactive kid chore checklist grouped by child, point banks, parent approvals, and full-screen reward hub.',
    iconKey: 'chores',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
    keywords: ['kids', 'points', 'rewards', 'allowance', 'tasks', 'routine'],
    variants: [
      {
        type: 'chores',
        pillLabel: 'Chores & Rewards',
        title: 'Family Chores & Rewards',
        description:
          'Interactive kid chore checklist grouped by child, point banks, parent approvals, and reward hub.',
        defaultGridPos: { w: 4, h: 8 },
        defaultConfig: { scope: 'household', defaultExpandedSections: ['today', 'review'] },
        keywords: ['chores', 'rewards', 'points', 'kids'],
      },
    ],
  },
  {
    id: 'kanban',
    category: 'household',
    title: 'Project Board (Kanban)',
    description:
      'Organize household projects and to-do lists across To Do, In Progress, and Done columns; resize wider for 3 columns or drag to edges on compact tiles.',
    iconKey: 'kanban',
    color: 'from-slate-500/15 to-emerald-500/15 text-slate-200 border-slate-500/30',
    keywords: [
      'kanban',
      'board',
      'project board',
      'task board',
      'projects',
      'tasks',
      'todo',
      'to-do',
      'todo list',
      'in progress',
      'done',
      'cards',
      'checklist',
    ],
    variants: [
      {
        type: 'kanban',
        pillLabel: 'Project Board (Kanban)',
        title: 'Project Board (Kanban)',
        description:
          'Organize household projects and to-do lists across To Do, In Progress, and Done columns; resize wider for 3 columns.',
        defaultGridPos: { w: 4, h: 7 },
        defaultConfig: {
          activeColumnId: 'todo',
          displayMode: 'tile',
        },
        keywords: ['kanban', 'project board', 'task board', 'board', 'projects', 'tasks', 'to-do'],
      },
    ],
  },
  {
    id: 'routines',
    category: 'household',
    title: 'Home Check-Ins & Rhythms',
    description:
      'Non-point household trackers for AM/PM pet feeding, meds, alternating-week trash vs. recycling pickup, and Every-N-Days plant/filter care with 1-tap avatar stamps.',
    iconKey: 'routines',
    color: 'from-emerald-500/20 to-cyan-500/20 text-emerald-300 border-emerald-500/30',
    keywords: [
      'routines',
      'check-in',
      'did someone already',
      'pet',
      'dog',
      'cat',
      'feeding',
      'meds',
      'vitamins',
      'weekly',
      'trash',
      'recycling',
      'curbside',
      'filter',
      'plants',
      'habits',
    ],
    variants: [
      {
        type: 'routines',
        pillLabel: 'Home Check-Ins & Rhythms',
        title: 'Home Check-Ins & Rhythms',
        description:
          'Track pet feeding, daily/AM-PM habits, fixed-weekday schedules, alternating recycling weeks, and filter/plant intervals with household avatar check-ins.',
        defaultGridPos: { w: 4, h: 6 },
        defaultConfig: {},
        keywords: ['routines', 'weekly', 'pet', 'trash', 'recycling', 'meds', 'filter', 'plants'],
      },
    ],
  },
  {
    id: 'wifi_qr',
    category: 'household',
    title: 'Guest Wi-Fi & House-Sitter',
    description:
      'Instant scannable Guest Wi-Fi QR code with masked tap-to-reveal password (stored strictly in local db.vault, never synced) and synced House-Sitter emergency contacts & care sheet.',
    iconKey: 'wifi_qr',
    color: 'from-cyan-500/20 to-blue-500/20 text-cyan-300 border-cyan-500/30',
    keywords: [
      'wifi',
      'wi-fi',
      'qr',
      'guest',
      'password',
      'network',
      'house sitter',
      'babysitter',
      'emergency',
      'contacts',
      'vet',
      'vault',
    ],
    variants: [
      {
        type: 'wifi_qr',
        pillLabel: 'Guest Wi-Fi & House-Sitter',
        title: 'Guest Wi-Fi & House-Sitter',
        description:
          'Scannable Guest Wi-Fi QR card kept strictly in device-local db.vault (never synced to cloud), plus synced House-Sitter emergency notes.',
        defaultGridPos: { w: 4, h: 6 },
        defaultConfig: {
          activeView: 'wifi',
          autoHidePasswordSec: 30,
          emergencyContacts: [],
        },
        keywords: ['wifi', 'qr', 'guest', 'babysitter', 'emergency', 'contacts'],
      },
    ],
  },
  {
    id: 'decision_maker',
    category: 'household',
    title: 'Decision Wheel & Poll',
    description:
      'Spin an interactive household prize wheel or run an avatar tap-to-vote poll with 1-click saved Meal Planner recipe & family profile imports.',
    iconKey: 'decision_maker',
    color: 'from-amber-500/20 to-fuchsia-500/20 text-amber-300 border-amber-500/30',
    keywords: [
      'wheel',
      'spin',
      'spinner',
      'poll',
      'vote',
      'voting',
      'decision',
      'random',
      'picker',
      'dinner',
      'movie',
      'tie breaker',
    ],
    variants: [
      {
        type: 'decision_maker',
        pillLabel: 'Decision Wheel & Poll',
        title: 'Decision Wheel & Poll',
        description:
          'Interactive spin-the-wheel and family avatar poll with 1-click recipe & profile imports plus tie-breaker spin.',
        defaultGridPos: { w: 4, h: 6 },
        defaultConfig: {
          mode: 'wheel',
          prompt: 'What should we pick?',
          options: DEFAULT_DECISION_OPTIONS,
          votes: {},
          allowMultiVote: false,
          removeWinnerOnSpin: false,
        },
        keywords: ['wheel', 'spinner', 'poll', 'vote', 'decision', 'dinner', 'movie'],
      },
    ],
  },
  {
    id: 'sticky_notes',
    category: 'household',
    title: 'Sticky Notes & Reminders',
    description:
      'Card tile for quick messages, reminders, color-coded notes, and task lists.',
    iconKey: 'sticky_notes',
    color: 'from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30',
    keywords: ['notes', 'shopping list', 'reminders', 'checklist', 'post-it'],
    variants: [
      {
        type: 'sticky_notes',
        pillLabel: 'Sticky Notes',
        title: 'Sticky Notes & Reminders',
        description: 'Card tile for quick messages, reminders, color-coded notes, and task lists.',
        defaultGridPos: { w: 4, h: 8 },
        defaultConfig: {},
        keywords: ['sticky notes', 'reminders', 'checklist'],
      },
    ],
  },
  {
    id: 'timer',
    category: 'household',
    title: 'Kitchen Timer',
    description:
      'Concurrent named kitchen timers with quick presets, editable durations, +1m/-1m adjustments, and audio chimes.',
    iconKey: 'timer',
    color: 'from-amber-500/20 to-rose-500/20 text-amber-300 border-amber-500/30',
    keywords: [
      'timer',
      'timers',
      'kitchen timer',
      'cooking timer',
      'countdown',
      'alarm',
      'pasta',
      'oven',
      'bake',
    ],
    variants: [
      {
        type: 'timer',
        pillLabel: 'Kitchen Timer',
        title: 'Kitchen Timer',
        description:
          'Concurrent named kitchen timers with quick presets, editable durations, +1m/-1m adjustments, and audio chimes.',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          chimeEnabled: true,
          timers: [
            {
              id: 'timer-default-1',
              label: 'Kitchen Timer',
              durationSec: 600,
              status: 'idle',
              remainingSec: 600,
            },
          ],
        },
        keywords: ['timer', 'kitchen timer', 'cooking timer', 'countdown', 'alarm'],
      },
    ],
  },
  {
    id: 'clock_group',
    category: 'time_weather',
    title: 'Clock & Time',
    description:
      'Live Clock + Weather combo, minimalist or analog Ambient Clock, or World Timezone multi-city display—switchable anytime.',
    iconKey: 'clock',
    color: 'from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30',
    keywords: ['clock', 'time', 'analog', 'digital', 'world clock', 'timezone', 'weather combo'],
    variants: [
      {
        type: 'clock_weather',
        pillLabel: 'Clock + Weather',
        title: 'Clock & Weather Combo',
        description: 'Dual tile showing the current time, day, date, and local temperature combined.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: {
          locationName: 'Austin, TX',
          latitude: 30.2672,
          longitude: -97.7431,
          unit: 'F',
          showSeconds: true,
        },
        keywords: ['clock weather', 'combo', 'time', 'temperature'],
      },
      {
        type: 'clock',
        pillLabel: 'Clock Only',
        title: 'Ambient Clock',
        description:
          'Minimalist live digital, typographic, or analog dial clock with optional seconds and city timezone.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: { clockFace: 'digital', showSeconds: true },
        keywords: ['ambient clock', 'clock only', 'analog', 'digital', 'minimalist'],
      },
      {
        type: 'world_clock',
        pillLabel: 'World Cities',
        title: 'World Timezone Clock',
        description:
          'City-lookup timezone tile showing live time, day/night status, and hour offset for global cities.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: {
          clockFace: 'digital',
          showSeconds: true,
          cities: [
            { id: 'wc-tokyo', cityName: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' },
          ],
        },
        keywords: ['world', 'timezone', 'cities', 'international', 'tokyo'],
      },
    ],
  },
  {
    id: 'weather',
    category: 'time_weather',
    title: 'Live Weather & Forecast',
    description:
      'Current temperature, condition icon, humidity, wind, and a 5-day daily forecast strip.',
    iconKey: 'cloud_sun',
    color: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
    keywords: ['forecast', 'temperature', 'rain', 'wind', 'climate', '5-day'],
    variants: [
      {
        type: 'weather',
        pillLabel: 'Live Weather',
        title: 'Live Weather & Forecast',
        description:
          'Current temperature, condition icon, humidity, wind, and a 5-day daily forecast strip.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: {
          locationName: 'Austin, TX',
          latitude: 30.2672,
          longitude: -97.7431,
          unit: 'F',
        },
        keywords: ['weather', 'forecast', 'temperature'],
      },
    ],
  },
  {
    id: 'air_quality',
    category: 'time_weather',
    title: 'Air Quality, Pollen & UV',
    description:
      'Live US AQI index, regional Tree/Grass/Weed pollen outlook, particulate air metrics, and daytime UV safety strip.',
    iconKey: 'air_quality',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
    keywords: [
      'aqi',
      'air quality',
      'pollen',
      'allergy',
      'allergies',
      'uv',
      'uv index',
      'smoke',
      'pm2.5',
      'ozone',
    ],
    variants: [
      {
        type: 'air_quality',
        pillLabel: 'AQI, Pollen & UV',
        title: 'Air Quality, Pollen & UV',
        description:
          'Live US AQI, Tree/Grass/Weed pollen outlook, and daytime UV safety strip (zero API key).',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          locationName: 'Austin, TX',
          latitude: 30.2672,
          longitude: -97.7431,
          showPollen: true,
          showUvStrip: true,
          refreshIntervalMin: 30,
        },
        keywords: ['aqi', 'air quality', 'pollen', 'uv', 'allergy'],
      },
    ],
  },
  {
    id: 'sun_moon',
    category: 'time_weather',
    title: 'Sun Arc & Moon Phase',
    description:
      '100% offline solar horizon arc with sunrise, sunset, golden hour, daily daylight delta, and lunar illumination phase.',
    iconKey: 'sun_moon',
    color: 'from-amber-500/20 to-indigo-500/20 text-amber-300 border-amber-500/30',
    keywords: [
      'sun',
      'moon',
      'sunrise',
      'sunset',
      'golden hour',
      'lunar',
      'moon phase',
      'daylight',
      'astronomy',
      'solstice',
    ],
    variants: [
      {
        type: 'sun_moon',
        pillLabel: 'Sun & Moon',
        title: 'Sun Arc & Moon Phase',
        description:
          'Offline sunrise/sunset arc, golden hour windows, daylight change, and illuminated lunar phase.',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          locationName: 'Austin, TX',
          latitude: 30.2672,
          longitude: -97.7431,
          showGoldenHour: true,
          showMoonDetails: true,
        },
        keywords: ['sun', 'moon', 'sunrise', 'sunset', 'golden hour', 'moon phase'],
      },
    ],
  },
  {
    id: 'countdown',
    category: 'time_weather',
    title: 'Milestone Countdown',
    description:
      'Real-time countdown timer to upcoming family vacations, birthdays, or holidays.',
    iconKey: 'countdown',
    color: 'from-indigo-500/20 to-violet-500/20 text-indigo-400 border-indigo-500/30',
    keywords: ['timer', 'vacation', 'birthday', 'holiday', 'days until'],
    variants: [
      {
        type: 'countdown',
        pillLabel: 'Countdown',
        title: 'Milestone Countdown',
        description:
          'Real-time countdown timer to upcoming family vacations, birthdays, or holidays.',
        defaultGridPos: { w: 4, h: 4 },
        // No targetDate: counts down to the next 25 December until a date is chosen
        defaultConfig: { eventName: 'Family Vacation' },
        keywords: ['countdown', 'milestone', 'vacation', 'birthday'],
      },
    ],
  },
  {
    id: 'photo_frame',
    category: 'media_ambient',
    title: 'Ambient Photo Frame',
    description: 'Slideshow supporting Plex Media Server, Local NAS folders, and Google Drive links.',
    iconKey: 'photo_frame',
    color: 'from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30',
    keywords: ['photos', 'slideshow', 'plex', 'google drive', 'polaroid', 'mosaic', 'gallery'],
    variants: [
      {
        type: 'photo_frame',
        pillLabel: 'Photo Frame',
        title: 'Ambient Photo Frame',
        description:
          'Slideshow supporting Plex Media Server, Local NAS folders, and Google Drive links.',
        defaultGridPos: { w: 4, h: 8 },
        defaultConfig: { displayStyle: 'ken_burns', rotationIntervalSec: 15 },
        keywords: ['photo frame', 'photos', 'slideshow', 'plex'],
      },
    ],
  },
  {
    id: 'image',
    category: 'media_ambient',
    title: 'Single Image or GIF',
    description:
      'Display an animated GIF from GIPHY, a transparent canvas sticker, or any picture with search & URL support.',
    iconKey: 'image',
    color: 'from-fuchsia-500/20 to-pink-500/20 text-fuchsia-400 border-fuchsia-500/30',
    keywords: ['gif', 'giphy', 'sticker', 'art', 'picture', 'upload'],
    variants: [
      {
        type: 'image',
        pillLabel: 'Image / GIF',
        title: 'Single Image or GIF',
        description:
          'Display an animated GIF from GIPHY, a transparent canvas sticker, or any picture.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: { fit: 'contain' },
        keywords: ['image', 'gif', 'giphy', 'sticker'],
      },
    ],
  },
  {
    id: 'embed',
    category: 'media_ambient',
    title: 'Ambient Stream & Web Embed',
    description:
      '1-click Lofi Beats radio, 4K Cozy Fireplace, NASA Live Earth, Weather Radar, or custom URLs.',
    iconKey: 'embed',
    color: 'from-pink-500/20 to-rose-500/20 text-pink-400 border-pink-500/30',
    keywords: ['lofi', 'fireplace', 'music', 'stream', 'radar', 'youtube', 'iframe', 'web'],
    variants: [
      {
        type: 'embed',
        pillLabel: 'Stream / Web',
        title: 'Ambient Stream & Web Embed',
        description:
          '1-click Lofi Beats radio, 4K Cozy Fireplace, NASA Live Earth, Weather Radar, or custom URLs.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: { preset: 'lofi', muted: true, customUrl: '' },
        keywords: ['embed', 'stream', 'lofi', 'fireplace', 'radar'],
      },
    ],
  },
  {
    id: 'chalkboard',
    category: 'media_ambient',
    title: 'Family Chalkboard & Doodle Pad',
    description:
      'Smooth touch, mouse, and stylus sketchpad with multi-color chalk, marker, eraser, undo, and transparent Sticker Mode.',
    iconKey: 'chalkboard',
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
    keywords: [
      'chalkboard',
      'doodle',
      'sketchpad',
      'draw',
      'drawing',
      'whiteboard',
      'chalk',
      'kids',
      'art',
      'sketch',
    ],
    variants: [
      {
        type: 'chalkboard',
        pillLabel: 'Chalkboard & Doodles',
        title: 'Family Chalkboard & Doodle Pad',
        description:
          'Interactive touch and stylus drawing pad with Slate, Warm Cork, Whiteboard, and floating Sticker surfaces.',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          surface: 'slate',
          defaultTool: 'chalk',
          defaultColor: '#f8fafc',
          defaultSize: 'medium',
          showToolbar: true,
          confirmBeforeClear: true,
          allowDrawingWhenLocked: true,
          strokes: [],
        },
        keywords: ['chalkboard', 'doodle', 'sketchpad', 'draw', 'whiteboard', 'chalk'],
      },
    ],
  },
  {
    id: 'soundscape',
    category: 'media_ambient',
    title: 'Ambient Soundscape Mixer',
    description:
      'Offline procedural Web Audio mixer blending rain, fireplace crackle, brown noise, ocean waves, and forest wind with Night Mode fade-out.',
    iconKey: 'soundscape',
    color: 'from-cyan-500/20 to-indigo-500/20 text-cyan-300 border-cyan-500/30',
    keywords: [
      'soundscape',
      'audio',
      'ambient',
      'rain',
      'fireplace',
      'brown noise',
      'ocean',
      'wind',
      'sleep',
      'focus',
      'relax',
      'mixer',
    ],
    variants: [
      {
        type: 'soundscape',
        pillLabel: 'Soundscape Mixer',
        title: 'Ambient Soundscape Mixer',
        description:
          '5-channel procedural Web Audio ambient mixer with presets, sleep timer, and automatic Scheduled Night Mode fade-out.',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          channels: DEFAULT_SOUNDSCAPE_CHANNELS,
          masterVolume: DEFAULT_SOUNDSCAPE_MASTER_VOLUME,
          activePreset: 'cozy_hearth',
          fadeOutOnNightMode: true,
          defaultSleepTimerMin: 0,
        },
        keywords: ['soundscape', 'ambient', 'rain', 'fireplace', 'brown noise', 'ocean', 'mixer'],
      },
    ],
  },
  {
    id: 'text_group',
    category: 'text_feeds',
    title: 'Text & Quotes',
    description:
      'Custom typography canvas headings or rotating family affirmations & timeless wisdom—switch modes anytime.',
    iconKey: 'textbox',
    color: 'from-cyan-500/20 to-amber-500/20 text-cyan-300 border-cyan-500/30',
    keywords: ['text', 'heading', 'banner', 'label', 'quotes', 'affirmations', 'inspiration'],
    variants: [
      {
        type: 'textbox',
        pillLabel: 'Heading / Text',
        title: 'Text Box & Canvas Heading',
        description:
          'Formatted text, titles, announcements, or custom labels with transparent background & typography options.',
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
        },
        keywords: ['textbox', 'heading', 'title', 'label', 'banner', 'announcement'],
      },
      {
        type: 'quotes',
        pillLabel: 'Rotating Quotes',
        title: 'Daily Inspiration & Affirmations',
        description:
          'Rotating collection of timeless quotes, wisdom, and custom family affirmations.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: { quoteMode: 'both', customQuotes: [] },
        keywords: ['quotes', 'inspiration', 'affirmations', 'wisdom', 'daily'],
      },
    ],
  },
  {
    id: 'rss',
    category: 'text_feeds',
    title: 'Live News & RSS Feed',
    description: 'Rotating news headlines and article summaries from your favorite RSS feeds.',
    iconKey: 'rss',
    color: 'from-orange-500/20 to-red-500/20 text-orange-400 border-orange-500/30',
    keywords: ['news', 'rss', 'headlines', 'blog', 'ticker', 'articles'],
    variants: [
      {
        type: 'rss',
        pillLabel: 'News & RSS',
        title: 'Live News & RSS Feed',
        description: 'Rotating news headlines and article summaries from your favorite RSS feeds.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: { feedUrl: 'https://tony.trinhism.com/index.xml' },
        keywords: ['rss', 'news', 'headlines', 'feed'],
      },
    ],
  },
  {
    id: 'finance',
    category: 'text_feeds',
    title: 'Markets & Watchlist',
    description:
      'Live stocks, ETFs, market indices, and crypto watchlist with sparklines and adaptive card/ticker layouts.',
    iconKey: 'finance',
    color: 'from-emerald-500/20 to-cyan-500/20 text-emerald-400 border-emerald-500/30',
    keywords: [
      'finance',
      'stocks',
      'stock',
      'market',
      'markets',
      'ticker',
      'crypto',
      'bitcoin',
      'etf',
      'indices',
      'watchlist',
      'watch list',
      'sp500',
      'portfolio',
    ],
    variants: [
      {
        type: 'finance',
        pillLabel: 'Markets & Watchlist',
        title: 'Markets & Watchlist',
        description:
          'Live stocks, ETFs, indices, and crypto prices with 1D/5D/1M sparklines (zero API key required).',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          watchlist: DEFAULT_FINANCE_WATCHLIST,
          range: '1d',
          displayMode: 'auto',
          showSparkline: true,
          showAbsoluteChange: true,
          refreshIntervalMin: 5,
        },
        keywords: [
          'finance',
          'stocks',
          'market',
          'ticker',
          'crypto',
          'bitcoin',
          'etf',
          'watchlist',
          'watch list',
        ],
      },
    ],
  },
  {
    id: 'sports',
    category: 'text_feeds',
    title: 'Live Sports Scoreboard',
    description:
      'Live scores, game clocks, TV broadcast channels, and favorite teams across NFL, NBA, MLB, NHL, MLS, Premier League, and NCAA.',
    iconKey: 'sports',
    color: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
    keywords: [
      'sports',
      'scoreboard',
      'scores',
      'nfl',
      'nba',
      'mlb',
      'nhl',
      'mls',
      'soccer',
      'epl',
      'premier league',
      'ncaa',
      'football',
      'basketball',
      'baseball',
      'hockey',
    ],
    variants: [
      {
        type: 'sports',
        pillLabel: 'Live Sports Scoreboard',
        title: 'Live Sports Scoreboard',
        description:
          'Zero-key live scoreboard and team schedule across pro and college leagues with adaptive card, grid, and ticker layouts.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: {
          leagues: DEFAULT_SPORTS_LEAGUES,
          followedTeams: [],
          showOnlyFollowedTeams: false,
          displayMode: 'auto',
          showRecords: true,
          showBroadcast: true,
          refreshIntervalMin: 5,
        },
        keywords: [
          'sports',
          'scoreboard',
          'scores',
          'nfl',
          'nba',
          'mlb',
          'nhl',
          'mls',
          'epl',
          'ncaa',
        ],
      },
    ],
  },
  {
    id: 'daily_discovery',
    category: 'text_feeds',
    title: 'Daily Discovery & Trivia',
    description:
      'Tap-to-reveal family trivia and riddles, daily vocabulary word, and "On This Day" history cards with built-in offline pack.',
    iconKey: 'daily_discovery',
    color: 'from-yellow-500/20 to-amber-500/20 text-yellow-400 border-yellow-500/30',
    keywords: [
      'trivia',
      'riddle',
      'riddles',
      'word of the day',
      'vocabulary',
      'on this day',
      'history',
      'discovery',
      'facts',
      'quiz',
    ],
    variants: [
      {
        type: 'daily_discovery',
        pillLabel: 'Daily Discovery & Trivia',
        title: 'Daily Discovery',
        description:
          'Daily trivia, riddles, vocabulary word, and Wikimedia "On This Day" history cards for table talk.',
        defaultGridPos: { w: 4, h: 4 },
        defaultConfig: {
          mode: 'rotate',
          triviaCategory: 'all',
          autoRotateSec: 30,
          autoRevealAnswer: false,
        },
        keywords: [
          'trivia',
          'riddle',
          'riddles',
          'word of the day',
          'on this day',
          'history',
          'discovery',
        ],
      },
    ],
  },
  {
    id: 'homelab',
    category: 'text_feeds',
    title: 'Home Lab & Home Assistant',
    description:
      'Self-hosted service uptime grid (Plex, NAS, Pi-hole, Immich, Uptime Kuma) and read-only Home Assistant entity badges with local db.vault tokens.',
    iconKey: 'homelab',
    color: 'from-cyan-500/20 to-emerald-500/20 text-cyan-300 border-cyan-500/30',
    keywords: [
      'homelab',
      'home lab',
      'uptime',
      'uptime kuma',
      'home assistant',
      'pihole',
      'pi-hole',
      'immich',
      'proxmox',
      'jellyfin',
      'nas',
      'synology',
      'truenas',
      'server',
      'smart home',
      'latency',
    ],
    variants: [
      {
        type: 'homelab',
        pillLabel: 'Home Lab & HA',
        title: 'Home Lab & Home Assistant',
        description:
          'LAN service health checks, interactive Home Assistant controls, and camera snapshots with local db.vault tokens.',
        defaultGridPos: { w: 4, h: 5 },
        defaultConfig: {
          services: [],
          haBaseUrl: '',
          haEntities: [],
          cameras: [],
          displayMode: 'auto',
          showLatency: true,
          refreshIntervalSec: 60,
        },
        keywords: ['homelab', 'uptime kuma', 'home assistant', 'pihole', 'nas', 'immich', 'proxmox'],
      },
    ],
  },
  {
    id: 'now_playing',
    category: 'media_ambient',
    title: 'Now Playing Media',
    description:
      'Live track artwork, playback progress, and optional controls via Home Assistant media players or Plex active sessions.',
    iconKey: 'now_playing',
    color: 'from-emerald-500/20 to-amber-500/20 text-emerald-300 border-emerald-500/30',
    keywords: [
      'now playing',
      'music',
      'audio',
      'sonos',
      'spotify',
      'plex',
      'media player',
      'album art',
      'playback',
      'track',
      'podcast',
    ],
    variants: [
      {
        type: 'now_playing',
        pillLabel: 'Now Playing',
        title: 'Now Playing',
        description:
          'Artwork, track details, progress bar, and Home Assistant / Plex playback monitoring.',
        defaultGridPos: { w: 4, h: 3 },
        defaultConfig: {
          source: 'home_assistant',
          haBaseUrl: '',
          haEntityId: '',
          allowControls: true,
          requirePinForControls: false,
          displayMode: 'auto',
          showProgress: true,
          refreshIntervalSec: 15,
        },
        keywords: ['now playing', 'music', 'plex', 'sonos', 'spotify', 'media player'],
      },
    ],
  },
];

export interface ModeSwitchOption {
  type: WidgetType;
  label: string;
  subtitle: string;
  defaultTitle: string;
}

export const CLOCK_MODE_OPTIONS: ModeSwitchOption[] = [
  {
    type: 'clock_weather',
    label: 'Clock + Weather',
    subtitle: 'Time & local forecast',
    defaultTitle: 'Clock & Weather',
  },
  {
    type: 'clock',
    label: 'Clock Only',
    subtitle: 'Local or single city',
    defaultTitle: 'Ambient Clock',
  },
  {
    type: 'world_clock',
    label: 'World Cities',
    subtitle: 'Multi-timezone list',
    defaultTitle: 'World Timezone Clock',
  },
];

export const TEXT_MODE_OPTIONS: ModeSwitchOption[] = [
  {
    type: 'textbox',
    label: 'Heading / Text',
    subtitle: 'Custom typography',
    defaultTitle: 'Text Box & Canvas Heading',
  },
  {
    type: 'quotes',
    label: 'Rotating Quotes',
    subtitle: 'Curated & family affirmations',
    defaultTitle: 'Daily Inspiration & Affirmations',
  },
];

const CLOCK_DEFAULT_TITLES = new Set([
  'clock & weather',
  'clock & weather combo',
  'ambient clock',
  'world timezone clock',
  'clock & time',
  'widget',
  '',
]);

const TEXT_DEFAULT_TITLES = new Set([
  'text box & canvas heading',
  'daily inspiration & affirmations',
  'text & quotes',
  'widget',
  '',
]);

export function isClockFamilyType(type?: WidgetType): type is 'clock' | 'clock_weather' | 'world_clock' {
  return type === 'clock' || type === 'clock_weather' || type === 'world_clock';
}

export function isTextFamilyType(type?: WidgetType): type is 'textbox' | 'quotes' {
  return type === 'textbox' || type === 'quotes';
}

export function isDefaultModeFamilyTitle(family: 'clock' | 'text', title?: string): boolean {
  const normalized = (title || '').trim().toLowerCase();
  return family === 'clock'
    ? CLOCK_DEFAULT_TITLES.has(normalized)
    : TEXT_DEFAULT_TITLES.has(normalized);
}

export function getDefaultTitleForWidgetType(type: WidgetType): string {
  const modeMatch = [...CLOCK_MODE_OPTIONS, ...TEXT_MODE_OPTIONS].find((opt) => opt.type === type);
  if (modeMatch) return modeMatch.defaultTitle;
  for (const entry of WIDGET_CATALOG_ENTRIES) {
    const variant = entry.variants.find((v) => v.type === type);
    if (variant) return variant.title;
  }
  return 'Widget';
}

export function extractHouseholdInheritedDefaults(
  existingWidgets: DashboardWidget[]
): HouseholdInheritedDefaults {
  const sortedActive = existingWidgets
    .filter((w) => !w.deleted_at)
    .slice()
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());

  let weather: WeatherDefaults = { ...DEFAULT_WEATHER_DEFAULTS };
  let hasCustomWeather = false;
  let preferredUnit: 'F' | 'C' | null = null;

  for (const w of sortedActive) {
    if (w.type !== 'weather' && w.type !== 'clock_weather') continue;
    const unit = w.config?.unit;
    if (unit === 'F' || unit === 'C') {
      preferredUnit = unit;
      break;
    }
  }

  for (const w of sortedActive) {
    if (
      w.type !== 'weather' &&
      w.type !== 'clock_weather' &&
      w.type !== 'air_quality' &&
      w.type !== 'sun_moon'
    ) {
      continue;
    }
    const cfg = w.config || {};
    const lat = Number(cfg.latitude);
    const lon = Number(cfg.longitude);
    if (
      typeof cfg.locationName === 'string' &&
      cfg.locationName.trim().length > 0 &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    ) {
      weather = {
        locationName: cfg.locationName.trim(),
        latitude: lat,
        longitude: lon,
        unit: preferredUnit ?? (cfg.unit === 'C' ? 'C' : 'F'),
        ...(typeof cfg.timezone === 'string' && cfg.timezone.trim()
          ? { timezone: cfg.timezone.trim() }
          : {}),
      };
      hasCustomWeather = true;
      break;
    }
  }

  let calendarSources: Array<Record<string, any>> | undefined;
  for (const w of sortedActive) {
    if (w.type !== 'calendar') continue;
    const sources = w.config?.sources;
    if (Array.isArray(sources) && sources.length > 0) {
      calendarSources = sources.map((s) => ({ ...s }));
      break;
    }
  }

  let haBaseUrl: string | undefined;
  for (const w of sortedActive) {
    if (w.type !== 'homelab' && w.type !== 'now_playing') continue;
    const rawUrl = typeof w.config?.haBaseUrl === 'string' ? w.config.haBaseUrl.trim() : '';
    if (rawUrl) {
      haBaseUrl = rawUrl;
      break;
    }
  }

  return {
    weather,
    hasCustomWeather,
    calendarSources,
    ...(haBaseUrl ? { haBaseUrl } : {}),
  };
}

export function buildWidgetPayloadFromVariant(
  variant: WidgetVariantSpec,
  activeTabId: string,
  existingWidgets: DashboardWidget[]
): Partial<DashboardWidget> {
  const inherited = extractHouseholdInheritedDefaults(existingWidgets);
  const nextConfig: Record<string, any> = { ...variant.defaultConfig };

  if (variant.type === 'weather' || variant.type === 'clock_weather') {
    nextConfig.locationName = inherited.weather.locationName;
    nextConfig.latitude = inherited.weather.latitude;
    nextConfig.longitude = inherited.weather.longitude;
    nextConfig.unit = inherited.weather.unit;
    if (inherited.weather.timezone) {
      nextConfig.timezone = inherited.weather.timezone;
    }
  } else if (variant.type === 'air_quality' || variant.type === 'sun_moon') {
    nextConfig.locationName = inherited.weather.locationName;
    nextConfig.latitude = inherited.weather.latitude;
    nextConfig.longitude = inherited.weather.longitude;
    if (inherited.weather.timezone) {
      nextConfig.timezone = inherited.weather.timezone;
    }
  } else if (variant.type === 'calendar' && inherited.calendarSources) {
    nextConfig.sources = inherited.calendarSources;
  } else if (
    (variant.type === 'homelab' || variant.type === 'now_playing') &&
    inherited.haBaseUrl &&
    !nextConfig.haBaseUrl
  ) {
    nextConfig.haBaseUrl = inherited.haBaseUrl;
  }

  return {
    tabId: activeTabId,
    type: variant.type,
    title: variant.title,
    gridPos: { x: 0, y: 0, w: variant.defaultGridPos.w, h: variant.defaultGridPos.h },
    config: nextConfig,
  };
}

export function countActiveTabWidgetsForEntry(
  entry: WidgetCatalogEntry,
  widgets: DashboardWidget[],
  activeTabId: string
): number {
  const allowedTypes = new Set<WidgetType>(entry.variants.map((v) => v.type));
  let count = 0;
  for (const w of widgets) {
    if (w.deleted_at) continue;
    if (w.tabId !== activeTabId) continue;
    if (allowedTypes.has(w.type)) count += 1;
  }
  return count;
}

function buildVariantSearchHaystack(entry: WidgetCatalogEntry, variant: WidgetVariantSpec): string {
  return [
    entry.title,
    entry.description,
    ...entry.keywords,
    variant.type,
    variant.pillLabel,
    variant.title,
    variant.description,
    ...variant.keywords,
  ]
    .join(' ')
    .toLowerCase();
}

function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}

export interface FilteredWidgetCatalogItem {
  entry: WidgetCatalogEntry;
  matchedVariantType?: WidgetType;
}

export function filterWidgetCatalog(
  entries: WidgetCatalogEntry[],
  category: WidgetCategoryId,
  searchQuery: string
): FilteredWidgetCatalogItem[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];

  const results: FilteredWidgetCatalogItem[] = [];

  for (const entry of entries) {
    if (category !== 'all' && entry.category !== category) {
      continue;
    }

    if (tokens.length === 0) {
      results.push({ entry });
      continue;
    }

    const entryHaystack = [
      entry.title,
      entry.description,
      ...entry.keywords,
      ...entry.variants.flatMap((v) => [
        v.type,
        v.pillLabel,
        v.title,
        v.description,
        ...v.keywords,
      ]),
    ]
      .join(' ')
      .toLowerCase();

    if (!matchesAllTokens(entryHaystack, tokens)) {
      continue;
    }

    let matchedVariantType: WidgetType | undefined;
    if (entry.variants.length > 1) {
      const primaryHaystack = buildVariantSearchHaystack(entry, entry.variants[0]);
      const primaryOnlyHaystack = [
        entry.variants[0].type,
        entry.variants[0].pillLabel,
        entry.variants[0].title,
        entry.variants[0].description,
        ...entry.variants[0].keywords,
      ]
        .join(' ')
        .toLowerCase();

      const secondaryMatch = entry.variants.slice(1).find((variant) => {
        const variantOnlyHaystack = [
          variant.type,
          variant.pillLabel,
          variant.title,
          variant.description,
          ...variant.keywords,
        ]
          .join(' ')
          .toLowerCase();
        return (
          matchesAllTokens(variantOnlyHaystack, tokens) &&
          !matchesAllTokens(primaryOnlyHaystack, tokens)
        );
      });

      if (secondaryMatch) {
        matchedVariantType = secondaryMatch.type;
      } else if (!matchesAllTokens(primaryHaystack, tokens)) {
        const fallbackSecondary = entry.variants
          .slice(1)
          .find((v) => matchesAllTokens(buildVariantSearchHaystack(entry, v), tokens));
        if (fallbackSecondary) {
          matchedVariantType = fallbackSecondary.type;
        }
      }
    }

    results.push({
      entry,
      ...(matchedVariantType ? { matchedVariantType } : {}),
    });
  }

  return results;
}
