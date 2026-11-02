export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const APP_VERSION = '0.0.12';

export const RELEASES: ReleaseEntry[] = [
  {
    version: "v0.0.12",
    date: "November 1, 2026",
    title: "Pure Dynamic Canvas Platform, Tile Resizing & Settings",
    highlights: [
      "Unified platform into a pure dynamic canvas architecture, sunsetting BentoGrid and hardcoded Photos tabs.",
      "Every board is now a customizable Corkboard canvas supporting widgets, sticky notes, and full-screen photo displays.",
      "+ Add Canvas creator modal with 16 custom icons (Pin, Photos, Home, Calendar, Coffee, Heart, Star, Music, and more).",
      "Tab reordering in Settings with 1-click Move Up and Move Down controls.",
      "Interactive corner resize handles on every widget and sticky note for fluid canvas scaling.",
      "Dedicated Tile Settings Modal (⚙️) to customize titles, dates, slideshow styles, and weather/clock preferences.",
    ],
  },
  {
    version: "v0.0.11",
    date: "November 1, 2026",
    title: "Views Manager, Corkboard Fullscreen Tiles & Bento Touch Movement",
    highlights: [
      "Dashboard Views & Tabs Manager in Settings to select visible tabs (Overview Bento Grid is now an optional tab).",
      "Corkboard set as the unified primary smart-display board for freeform notes, checklists, and widgets.",
      "1-Click Fullscreen / Canvas Fill toggle on Corkboard widgets (expand Photo Frame or others to 100% borderless display).",
      "Interactive touch and pointer drag-and-drop tile reordering and collision swapping on Bento Grid.",
      "1-Click quick-swap button on Bento Grid tiles for effortless reordering on touchscreens.",
      "Relocated Support & Donate panel to the bottom of the Settings modal above Danger Zone.",
      "Replaced technical Supabase and Magic Link jargon with user-friendly Cloud Sync & Multi-Device Backup wording.",
    ],
  },
  {
    version: "v0.0.10",
    date: "November 1, 2026",
    title: "Mobile & Tablet Touch Dragging Optimization",
    highlights: [
      "Fixed touch-drag gesture handling on mobile phones and tablets across iOS Safari and Android Chrome.",
      "Added touch-action: none and WebKit touch callout suppression to prevent browser scroll interception.",
      "Calibrated local container coordinate offsets for 1:1 finger tracking precision.",
      "Disabled CSS transitions during active dragging for fluid 60fps/120fps zero-latency movement.",
      "Isolated pointer capture to card containers to eliminate sub-element text selection.",
    ],
  },
  {
    version: "v0.0.9",
    date: "November 1, 2026",
    title: "Plex OAuth Photo Streamer, Standalone Weather & Universal Backup Hub",
    highlights: [
      "Plex Media Server OAuth PIN flow & high-res photo library streaming with secure HTTPS connections.",
      "Universal 1-Click JSON Backup & Restore Hub supporting all desktop and mobile browsers.",
      "Danger Zone Factory Reset with two-step confirmation safeguard.",
      "Dedicated Standalone Weather Widget with 5-day daily forecast strip via Open-Meteo.",
      "Dedicated Standalone Clock Widget for minimalist ambient time display.",
      "Visual Widget Catalog (+ Add Tile) to add or remove any widget on Overview or Family Board.",
      "Prominent Photo Sources Hub modal supporting Plex, Local Folders, Google Drive, and Curated Presets.",
      "Family Board note creation, interactive checklist toggles, and discoverable delete controls.",
      "Removed redundant clock overlay from ambient photo frame tile.",
    ],
  },
  {
    version: "v0.0.8",
    date: "November 1, 2026",
    title: "Multi-User Dashboard Sharing & Live Realtime Sync",
    highlights: [
      "Added Share Board & Family Access modal with QR codes and 6-digit join codes.",
      "Instant phone camera onboarding to Mobile Companion without app store downloads.",
      "Live WebSocket synchronization via Supabase Realtime (< 300ms note & checklist updates).",
      "Added dashboard_members table and idempotent migration handling in supabase/schema.sql.",
    ],
  },
  {
    version: "v0.0.7",
    date: "November 1, 2026",
    title: "Carousel Controls, Support/Donate Panel & Canvas Zoom Isolation",
    highlights: [
      "Added Auto-Rotate Tabs toggle and interval duration selector in Settings.",
      "Isolated canvas zoom transform to prevent the Navigation Dock and Modals from being scaled off-screen on high densities.",
      "Added Support & Donate panel in Settings with Venmo, PayPal, and Zelle QR codes.",
    ],
  },
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
