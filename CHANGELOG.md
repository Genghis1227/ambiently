# Changelog

All notable changes to the **Ambiently** smart-display and command center platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
