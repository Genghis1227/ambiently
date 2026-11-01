export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const APP_VERSION = '0.0.6';

export const RELEASES: ReleaseEntry[] = [
  {
    version: 'v0.0.6',
    date: 'November 1, 2026',
    title: 'Documentation Suite & Changelog Modal',
    highlights: [
      'Added subtle, non-intrusive version tag buttons in Settings and Mobile Companion headers.',
      'Implemented ChangelogModal displaying release notes, dates, and direct links to GitHub.',
      'Created CHANGELOG.md, FEATURES.md, and ARCHITECTURE.md documentation suite.',
      'Updated README.md with official banner and Supabase configuration guides.',
    ],
  },
  {
    version: 'v0.0.5',
    date: 'November 1, 2026',
    title: 'Mobile Companion Mode & Supabase Cloud Sync',
    highlights: [
      'Automatic responsive mobile companion UI on viewports < 768px with quick sticky-note & checklist adder.',
      'Remote tab switcher allowing phones to command what is displayed on the wall/desk kiosk.',
      'Supabase multi-tenant cloud sync with passwordless Magic Link authentication.',
      'Bidirectional push & pull syncing local IndexedDB (Dexie) with Supabase Postgres.',
      'Created supabase/schema.sql with Row Level Security (RLS) policies and Realtime publications.',
    ],
  },
  {
    version: 'v0.0.4',
    date: 'November 1, 2026',
    title: 'Multi-Source Photo Frame & Offline Cache API',
    highlights: [
      'Multi-source photo frame supporting 4 display styles: Ken Burns ambient pan/zoom, 4-quadrant Mosaic, angled Polaroid Stack, and scrolling Filmstrip.',
      'Local folder photo picking via Chromium File System Access API (showDirectoryPicker).',
      'Curated ambient photography fallback with Unsplash.',
      'Integrated Cache Storage API caching the last 30 photos for 0ms offline display resilience.',
      'Ambient corner clock and date overlay with author attribution.',
    ],
  },
  {
    version: 'v0.0.3',
    date: 'November 1, 2026',
    title: 'Cloudflare Edge Proxy, Multi-Calendar & RSS',
    highlights: [
      'Deployed serverless Cloudflare Pages Functions (/functions/api/ical and /functions/api/rss).',
      'Unified multi-calendar feed parser normalizing webcal:// and .ics feeds via ical.js.',
      'Dual calendar views: Chronological Agenda List and 7-column interactive Monthly Grid matrix.',
      'Color-coded event tags and date badges with All-Day event support.',
      'RSS/Atom XML feed proxy parsing top headlines and external article links.',
    ],
  },
  {
    version: 'v0.0.2',
    date: 'November 1, 2026',
    title: 'Core Direct-API Widgets & Sticky Notes',
    highlights: [
      'Open-Meteo zero-key weather integration with geocoding, current conditions, and 3-day forecast.',
      'Live minimalist digital clock with live seconds counter, AM/PM tag, and SVG analog face.',
      'Sticky Notes board with rich text, interactive checklists, and 6-color ambient pastel palette.',
      'Sticky note expiration engine (Permanent, 24h, 3d, custom date/time) with approaching-expiry warning glows.',
      'Recoverable Trash & Archive drawer with 1-click note restoration.',
      'Live Event Countdown tile and Thought of the Day rotating quotes widget.',
    ],
  },
  {
    version: 'v0.0.1',
    date: 'November 1, 2026',
    title: 'Brand Assets & Automated PWA Icon Suite',
    highlights: [
      'Wired official brand assets and logos into assets/brand/.',
      'Implemented automated scripts/generate-icons.js pipeline executing on every build.',
      'Dynamically generates standard PWA icons, apple-touch-icon, OpenGraph banner, and 80% safe zone maskable Android icons.',
      'Updated index.html OpenGraph meta tags and Vite Workbox precache list.',
    ],
  },
  {
    version: 'v0.0.0',
    date: 'October 31, 2026',
    title: 'Architecture Foundation & Kiosk Shell',
    highlights: [
      'Scaffolded Vite + React 19 + TypeScript + Tailwind CSS PWA with AGPLv3 license.',
      '0ms offline-first local state engine with Dexie.js (IndexedDB) and Zustand store.',
      'File System Access API auto-save bridge to local ambiently-data.json.',
      'Dual-mode layout engine: 12x8 snapped Bento Grid and draggable Corkboard.',
      'Configurable Navigation Dock (Left, Top, Right, Bottom) with automated carousel.',
      'Kiosk hardware controls: Screen Wake Lock API, Fullscreen API, and Night Mode with pixel-shifting OLED clock.',
      'Kid-proof 4-digit PIN pad overlay with a 4-second hold parent challenge.',
    ],
  },
];
