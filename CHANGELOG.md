# Changelog

All notable changes to the **Ambiently** smart-display and command center platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-11-02

### Added
* **Multi-Source iCal / Webcal Feed Manager (`WidgetSettingsModal.tsx`):**
  * Added connected feed manager in Calendar Tile Settings to merge, toggle, color-tag, and remove multiple public or secret Google, Apple iCloud, and Outlook `.ics` / `webcal://` URLs.
  * Default View selector (`Agenda Schedule` vs `Monthly Grid`).
* **1-Click City Geocoding Lookup (`WidgetSettingsModal.tsx`):**
  * Integrated Open-Meteo Geocoding API to auto-resolve latitude, longitude, and formatted city/state/country names directly from city text input.
* **Expanded Clock Face Engine (`ClockWidget.tsx`, `ClockWeatherWidget.tsx`):**
  * Added **Analog Dial** (with SVG hands, tick marks, and live seconds ticker), **Minimalist** typographic face, and **Digital** styles.
  * Clock face selectors available for both standalone Clock and Clock+Weather combo tiles.
* **Note Expiration Engine & Recoverable Trash Drawer (`Corkboard.tsx`):**
  * Freeform sticky notes on Corkboard canvases now support expiration (`Permanent`, `Expire 24h`, `Expire 3d`, `Custom Date/Time`).
  * Visual warning ring for notes expiring within 12 hours.
  * Corkboard header **Trash / Archive Recovery Drawer** with 1-click note restore and permanent wipe options.
  * Added **Sticky Notes & Reminders** tile support directly on Corkboard canvases.
* **Interactive Canvas Layering & Rotation Controls (`Corkboard.tsx`):**
  * Automatic bring-to-front (`zIndex`) layering whenever a widget or note is touched or dragged.
  * Tile tilt (`↺`, `0°`, `↻`) controls on card hover.
* **Night Mode & Kiosk Hardware Controls (`SettingsModal.tsx`, `App.tsx`):**
  * Configurable auto-start and morning wake schedule (`22:00`–`07:00`) with automatic 60-second schedule timer.
  * Night Mode visual style selector: **OLED Pixel-Shift Clock** (with burn-in prevention movement) vs **Dim Screen Overlay** with darkness slider.
  * Screen Wake Lock API 24/7 toggle.
  * Canvas interaction pauses tab carousel auto-rotation for 20 seconds.
* **Per-Widget Photo Sources Persistence (`PhotoFrameWidget.tsx`, `Corkboard.tsx`):**
  * Photo sources modal connected to individual widget configuration in IndexedDB so Plex, local folders, Google Drive, and presets persist seamlessly.
* **Family QR Code Invite Modal Button (`SettingsModal.tsx`):**
  * Added **Family QR Invite** button to launch the mobile companion QR onboarding modal.

---

## [0.0.12] - 2026-11-01

### Added
* **Pure Dynamic Canvas Platform:**
  * Sunmsetted BentoGrid (`BentoGrid.tsx`) and hardcoded Photos tabs in favor of a 100% unified Corkboard canvas architecture.
  * Every board is a flexible canvas capable of hosting freeform widgets, sticky notes, or full-screen photo streamers.
* **Canvas Creator & Icon Picker (`CreateCanvasModal.tsx`):**
  * Added `+` button to the Navigation Dock and Settings to create unlimited custom canvases.
  * 16 custom icon choices: Pin, Photos, Home, Calendar, Coffee, Heart, Star, Music, Sun, Tasks, Sparkles, Smile, Display, Folder, Clock, and Grid.
* **1-Click Tab Reordering (`SettingsModal.tsx`):**
  * Added Move Up (`▲`) and Move Down (`▼`) controls to reorder tabs in the dock and auto-rotate carousel.
  * Inline canvas renaming and icon customization.
* **Interactive Tile Resizing (`Corkboard.tsx`):**
  * Bottom-right corner drag handles on all widgets and sticky notes with live fluid canvas scaling.
* **Dedicated Tile Settings Modal (`WidgetSettingsModal.tsx`):**
  * ⚙️ Edit button on all tile headers to configure titles, countdown dates, photo slideshow transition styles, speeds, and weather/clock settings.

---

## [0.0.11] - 2026-11-01

### Added
* **Dashboard Views & Tabs Manager (`SettingsModal.tsx`):**
  * Added a dedicated "Dashboard Views & Tabs" selector in Settings to toggle visible tabs in the Navigation Dock and ambient carousel.
  * Overview (Bento Grid) is now an optional tab that users can enable on demand, keeping the dashboard unified around Corkboard.
  * Built-in safeguards prevent users from disabling all views.
* **1-Click Fullscreen / Canvas Fill on Corkboard (`Corkboard.tsx`):**
  * Added a Maximize / Restore button to all widget tiles on Corkboard.
  * Allows expanding the Photo Frame (or any widget) to 100% borderless display, turning Corkboard into an edge-to-edge photo streamer.
* **Interactive Bento Grid Touch Dragging & Swapping (`BentoGrid.tsx`):**
  * Added pointer drag handles with live blue drop-preview box.
  * Automatic collision detection swaps grid tile coordinates when dragging one tile over another.
  * Added a 1-click quick-swap button on each tile header for fast adjacent reordering on tablets.

### Changed
* **Corkboard as Primary View:** Default fresh installations start on Family Board (Corkboard) as the primary ambient display.
* **Support & Donate Panel Relocation:** Moved Support & Donate to the bottom of the Settings modal above the Danger Zone.
* **User-Friendly Cloud Sync Terminology:** Replaced technical "Supabase" and "Magic Link" terminology with "Cloud Sync & Multi-Device Backup".

---

## [0.0.10] - 2026-11-01

### Fixed
* **Mobile & Tablet Touch Dragging:**
  * Added `touch-action: none` and `-webkit-touch-callout: none` to prevent mobile browsers (iOS Safari, Android Chrome) from intercepting touch gestures as scrolling or zooming.
  * Corrected local container coordinate offsets `(e.clientX - rect.left)` and `(e.clientY - rect.top)` for precise 1:1 finger tracking.
  * Bound pointer capture to card containers (`e.currentTarget`) to eliminate sub-element text selection glitches.
  * Disabled CSS transitions during active dragging for fluid 60fps/120fps movement without input latency.

---

## [0.0.9] - 2026-11-01

### Added
* **Plex Media Server OAuth & Streaming:**
  * Automated Plex PIN generation (`plex.tv/api/v2/pins`), pairing status polling, and secure token vault storage (`db.vault`).
  * Kiosk-friendly 4-character code and QR code pointing to `plex.tv/link` for fast mobile authorization.
  * Discovers servers and filters secure `plex.direct` HTTPS endpoints to avoid browser mixed-content restrictions.
  * Photo library enumeration and high-resolution photo transcode streaming into the slideshow.
* **Universal 1-Click JSON Backup & Restore Hub:**
  * Added 1-click **Download Backup (`.json`)** working across all desktop and mobile browsers.
  * Added 1-click **Upload & Restore (`.json`)** to restore all customized tabs, widgets, notes, and layouts into local IndexedDB (`AmbientlyDB`).
* **Danger Zone Factory Reset:**
  * Added two-step confirmation Factory Reset button in Settings Modal to wipe local databases, photo caches, and credentials.
* **Dedicated Standalone Weather Widget (`WeatherWidget.tsx`):**
  * Decoupled weather from the clock tile into a dedicated card with current temperature, condition icon, humidity, wind, high/low, and a 5-day daily forecast strip powered by Open-Meteo.
* **Dedicated Standalone Clock Widget (`ClockWidget.tsx`):**
  * Clean, focused ambient clock display with date and live seconds.
* **Visual Widget Catalog & Manager (`AddWidgetModal.tsx`):**
  * Added `+` button in the dock and `+ Add Tile` button on the Family Board to add any widget.
  * Added widget removal controls (`🗑️`) on tile hover.
* **Photo Sources Hub Modal (`PhotoSourcesModal.tsx`):**
  * Replaced the hidden folder icon with a prominent **Sources** button on the photo frame header supporting Plex, Local Folders, Google Drive links, and Curated presets.
* **Family Board Note Creator & Touch-Friendly Deletion:**
  * Added floating `+ Pin New Note` creator modal and made note deletion buttons permanently visible for touch and kiosk displays.

### Fixed
* **Redundant Photo Tile Time Overlay:** Stripped digital clock overlay from the ambient photo frame so it no longer duplicates the main Clock & Weather widget beside it.

---

## [0.0.8] - 2026-11-01

### Added
* **Multi-User Dashboard Sharing:** Shareable QR codes and 6-character join codes (e.g. `?join=CODE`) allowing family members to instantly connect to a shared dashboard on their phones.
* **Live Realtime WebSocket Sync:** Powered by Supabase Realtime, updating sticky notes and checklist toggles on wall displays in < 300ms without reloading.
* **Database Schema Migrations:** Added `dashboard_members` and idempotent column migrations in `supabase/schema.sql`.

---

## [0.0.7] - 2026-11-01

### Added
* **Tab Carousel Settings:** Exposed toggle switch and rotation duration pills (15s, 30s, 45s, 60s, 120s) in Settings Modal.
* **Support & Donate Panel:** Embedded accordion in Settings with Venmo, PayPal, and Zelle QR codes.

### Fixed
* **Display Density Zoom Trap:** Isolated CSS zoom transform to the board canvas, keeping Navigation Dock and Modals fixed at 100% viewport resolution.

---

## [0.0.6] - 2026-11-01

### Added
* **Interactive Changelog Modal (`ChangelogModal`):**
  * Subtle version pills (`v0.0.6`) placed in the Settings Modal and Mobile Companion headers.
  * Clicking the pill opens a modal with release history cards and a direct link to `CHANGELOG.md` on GitHub.
* **Documentation Suite:**
  * Created `CHANGELOG.md` following the Keep a Changelog standard.
  * Created `FEATURES.md` covering all 10 core feature pillars.
  * Created `ARCHITECTURE.md` documenting the local-first engine, edge proxy functions, and Supabase RLS sync.
  * Enriched `README.md` with official banners and setup instructions.

---

## [0.0.5] - 2026-11-01

### Added
* **Mobile Companion Remote:** Responsive viewport detector (`< 768px`) that automatically loads a touch-optimized mobile remote on smartphones.
  * Rapid sticky-note and checklist adder syncing in real-time to wall kiosk.
  * Remote tab switcher controlling what view is rendered on the wall display.
  * Interactive task checklist feed with tap-to-complete checkboxes.
  * One-tap "Kiosk" preview button to view the full desktop board on mobile.
* **Supabase Multi-Tenant Cloud Sync:**
  * Passwordless Magic Link email authentication.
  * Bidirectional synchronization (`pushToCloud` and `pullFromCloud`) bridging browser `IndexedDB` with Supabase Postgres.
  * Created `supabase/schema.sql` defining `dashboards`, `tabs`, `widgets`, and `notes` tables, with Row-Level Security (RLS) policies and Realtime publications.
* **Cloud Sync UI:** Account sign-in, session status, manual push/pull sync triggers inside Settings Modal.

---

## [0.0.4] - 2026-11-01

### Added
* **Multi-Source Photo Frame (`PhotoFrameWidget`):**
  * **Ken Burns Style:** Ambient pan-and-zoom transitions with Framer Motion crossfades and a subtle corner clock & date overlay.
  * **Mosaic Style:** 4-quadrant photo collage grid with active selection indicators and captions.
  * **Polaroid Stack Style:** Angled white paper polaroid frame with handwritten labels and photo credit.
  * **Filmstrip Style:** Horizontally scrolling carousel for rapid browsing.
* **Local Folder Support:** File System Access API directory handle (`showDirectoryPicker`) to loop through local PC or mapped NAS photos.
* **Curated Photography:** High-resolution ambient landscape fallback via Unsplash.
* **Offline Photo Resiliency:** Integrated Cache Storage API (`cachePhotosLocally`) keeping the last 30 photos available even when internet connectivity drops.

---

## [0.0.3] - 2026-11-01

### Added
* **Cloudflare Pages Serverless Edge Functions (`/functions/api/*`):**
  * `/functions/api/ical.ts`: Normalizes `webcal://` and `https://` URLs, expands recurring `RRULE` events, and returns sanitized JSON for a 60-day window.
  * `/functions/api/rss.ts`: Proxies and converts XML RSS 2.0 and Atom feeds via `fast-xml-parser` into clean JSON headlines with a 10-minute edge cache.
* **Multi-Calendar Widget (`CalendarWidget`):**
  * Unified chronological timeline merging multiple Google, Apple, and Outlook calendars.
  * Per-calendar color coding.
  * Dual views: **Agenda List View** with weekday tags and **Monthly Grid Matrix** with event dot indicators.
* **RSS Feed Reader Widget (`RssWidget`):** Card list layout showing headlines, summaries, and outbound links.

---

## [0.0.2] - 2026-11-01

### Added
* **Open-Meteo Weather Tile (`ClockWeatherWidget`):**
  * Zero-key geocoding and weather conditions with temperature, feels-like, highs, lows, and condition icons.
  * 3-day micro forecast strip with auto-refresh every 15 minutes.
* **Live Clock Tile:** Minimalist digital clock with live seconds counter, AM/PM tag, and an SVG analog clock face.
* **Interactive Sticky Notes Board (`StickyNotesWidget`):**
  * Rich text notes and checklists with clickable interactive checkmarks.
  * 6-color ambient pastel color palette (Amber, Emerald, Sky, Pink, Purple, Orange).
  * Expiration engine: Permanent, 24h, 3 days, or custom date/time expiration.
  * Approaching-expiration visual warning ring (within 12 hours).
  * Recoverable Trash and Archive drawer with 1-click restore.
* **Event Countdown Tile (`CountdownWidget`):** Real-time days, hours, minutes, and seconds countdown to target dates.
* **Rotating Daily Quotes Tile (`QuotesWidget`):** Curated inspirational thoughts of the day.

---

## [0.0.1] - 2026-11-01

### Added
* **Brand Assets Integration:** Placed master raw assets in `assets/brand/`.
* **Automated PWA Icon Generation Pipeline (`scripts/generate-icons.js`):**
  * Uses Sharp to build favicons, apple-touch-icon, standard PWA splash icons, OpenGraph cards, and 80% safe zone maskable Android icons on every build.
* **PWA & OpenGraph Configuration:** Updated `index.html` meta tags and `vite.config.ts` Workbox precache manifest.

---

## [0.0.0] - 2026-10-31

### Added
* Initial project architecture and repository initialization under **GNU AGPLv3**.
* Zero-millisecond local-first data engine via **Dexie.js (IndexedDB)** and **Zustand**.
* Chromium File System Access API bridge auto-saving to local `ambiently-data.json`.
* Dual-mode layout engine:
  * Snapped 12×8 zero-scrollbar **Bento Grid**.
  * Freeform draggable and rotatable **Corkboard**.
* Configurable **Navigation Dock** (Left, Top, Right, Bottom) with automated tab carousel.
* Kiosk hardware integration: Fullscreen API and Screen Wake Lock API.
* Scheduled Night Mode with low-glow, pixel-shifting OLED clock to prevent screen burn-in.
* Kid-Proof 4-digit PIN lock with a 4-second hold parent challenge.
* Display Density zoom scaler (75%, 100%, 125%, 150%) supporting 1080p, 1440p, and 4K displays.
