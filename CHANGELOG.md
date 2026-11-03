# Changelog

All notable changes to the **Ambiently** smart-display and command center platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.6] - 2026-11-02

### Added
* **Mobile Companion Vertical Tile Stream (`MobileCompanion.tsx`, `App.tsx`, `types/dashboard.ts`):**
  * Replaced the notes-only mobile companion view with a full single-column vertical tile stream of the active canvas.
  * Every widget tile (Clock & Weather, Countdown, Photos, RSS Headlines, Quotes, Text Boxes, Media Embeds, and Notes) displays a clean mobile-responsive card with live preview.
  * **Persistent View Option**: 3-way segmented filter pills (`All Tiles` | `Widgets` | `Notes & Tasks`) automatically persisted in `localStorage`.
  * **Independent Mobile Reordering (`▲ / ▼`)**: Added move buttons on each widget card modifying an isolated `mobileOrder` property with zero impact on the non-mobile desktop/kiosk layout.
  * **Mobile Tile Customizer & Creation**: 1-tap `⚙️` button opens `WidgetSettingsModal` on mobile to adjust weather cities, milestone dates, photo densities, font styling, or RSS feeds. Added an `+ Add Tile` button to add widgets from your phone.
* **Close Individual Sticky Notes & Pop Out from Tile (`Corkboard.tsx`, `StickyNotesWidget.tsx`, `types/dashboard.ts`):**
  * Added an `X` button in the header of every floating sticky note on the corkboard canvas.
  * Clicking `X` removes that specific note from the corkboard without deleting it. It remains safely saved, checkable, and active in the Notes Tile widget (`isPinnedToCanvas: false`).
  * In the Notes Tile widget list, added a `📌 Pin to Board` / `📌 On Canvas` status toggle button to pop notes back onto the corkboard with one tap.

### Fixed
* **Command Hub Click Registration (`NavigationDock.tsx`, `AmbientQuickMenu.tsx`, Modals):**
  * Elevated the Navigation Dock and Command Hub menu to `z-50`, placing them strictly above the `z-40` transparent click-outside backdrop so all 4 kiosk controls and shortcuts immediately respond to clicks and touches.
  * Added `max-w-[calc(100vw-5rem)]` and `pointer-events-auto` for narrow mobile screens.
  * Re-layered fullscreen modals to `z-[70]`–`z-[100]`.

---

## [0.1.5] - 2026-11-02

### Added
* **Selectable Default Home Board (`types/dashboard.ts`, `store/dashboardStore.ts`, `services/db.ts`):**
  * Added `isHome?: boolean` to `DashboardTab`, allowing users to explicitly designate any canvas as the default Home Board without having to shift it to position #1.
  * Added `setHomeTab(tabId)` action to `dashboardStore` that persists to Dexie DB and updates local backups.
  * Updated app initialization to prioritize explicitly designated Home Boards when loading dashboards.
  * Added deletion fallback to reassign home status gracefully if the current Home Board is deleted.
* **Canvases & Boards Manager Polish (`SettingsModal.tsx`):**
  * Added prominent purple `[🏠 Home Board]` badge next to the canvas name for instant identification.
  * Added 1-click `Home` icon button (`🏠`) in the canvas action controls row for rapid 1-tap assignment.
  * Added **"Default Home Board"** toggle switch inside the inline canvas editor.
* **Ambient Command Hub & Navigation Dock Indicators (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`, `App.tsx`):**
  * Ambient Command Hub popover now dynamically displays the actual name of your configured Home Board on the Home button and navigates directly to it.
  * Navigation Dock shows a subtle purple glowing indicator dot on inactive Home Board icons and appends `(Home Board)` to the tooltip.
* **Mobile Companion Tab Indicator (`MobileCompanion.tsx`):**
  * Mobile companion tab switcher pills display a subtle Home icon (`🏠`) beside the Home Board.

---

## [0.1.4] - 2026-11-02

### Added
* **Text Box & Canvas Heading Widget (`TextBoxWidget.tsx`, `AddWidgetModal.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `types/dashboard.ts`):**
  * New dedicated `textbox` widget type designed for clean text, messages, announcements, and titles floating directly on the screen without looking like a sticky note or standard tile box.
  * **Background Modes:** Clean / Transparent (no card box, no border, text floating directly over wallpaper), Frosted Glass, and Solid Dark card styles.
  * **Typography & Styling:** 9 font sizes (`XS` to `5XL` hero display headings), 5 font weights, Left/Center/Right alignment, 4 font families (Clean Sans, Editorial Serif, Modern Mono, Cursive Script), letter spacing, text transform (UPPERCASE, Capitalize).
  * **Text Color & High-Contrast Shadow:** 9 curated pastel & vibrant colors plus custom hex color picker, with high-contrast drop shadow toggle for readability over wallpapers.
  * **Markdown & Editing:** Supports markdown formatting (`# Header 1`, `## Header 2`, `**Bold**`, `*Italic*`, `__Underline__`, `- Bullet points`), double-click inline editing on the canvas with `Esc` / `Ctrl+Enter`, and full visual customizer with WYSIWYG preview in tile settings.
* **1-Tap Switch to Mobile Companion (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`, `App.tsx`):**
  * Added a dedicated **"Switch to Mobile Companion"** button inside the Ambiently Command Hub menu on mobile viewports.
  * Enables instant 1-tap switching back to Mobile Companion mode from Kiosk view without having to reload the browser.

### Fixed
* **Mobile Sticky Note Hold-and-Drag Movement (`Corkboard.tsx`):**
  * Fixed checklist item row element trapping touch pointer events by refactoring checklist items to `<div>` rows and isolating `<button>` to the checkbox toggle icon.
  * Applied `touchAction: 'none'`, `WebkitUserSelect: 'none'`, and `userSelect: 'none'` across sticky note card containers, eliminating scroll-gesture cancellation (`pointercancel`) on mobile browsers.
  * Added window-level touch pointer listeners with `{ passive: false }` and non-blocking 60 FPS local drag state, committing once on release (`pointerup`).
* **Mobile Sticky Note Editing (`Corkboard.tsx`, `MobileCompanion.tsx`, `App.tsx`):**
  * Updated note action bar to `opacity-90 md:opacity-0 md:group-hover:opacity-100`, making Edit pencil, Trash, 0° Straighten, and Pastel Color Swatches always visible on mobile touchscreens while preserving sleek desktop hover behavior.
  * Added a direct Edit pencil icon in the note header for 1-tap editing on mobile.
  * Added touch double-tap gesture detection (`< 350ms`) to open the note editor on touchscreens.
  * Added note deletion and individual checklist item removal when editing in Mobile Companion mode.
* **Blurry Screen on Dock Menu Open (`AmbientQuickMenu.tsx`):**
  * Removed `bg-black/20 backdrop-blur-[1px]` from the click-outside dismisser in `AmbientQuickMenu.tsx`. The background canvas remains 100% crisp and sharp when opening the menu on mobile.

---

## [0.1.3] - 2026-11-02

### Added
* **Configurable Polaroid Photo Density & Full-Screen Collage (`PhotoFrameWidget.tsx`, `WidgetSettingsModal.tsx`, `PhotoSourcesModal.tsx`):**
  * Added user-configurable photo counts: `6 (Light)`, `12 (Desk)`, `18 (Dense)`, `24 (Wall Collage)`, and `32 (Fill Complete Screen)`, plus a continuous `4`–`36` photo slider.
  * When set to Fill Screen, polaroids generously overlap across 100% of the canvas surface for a rich tabletop or memory wall appearance.
  * 1-tap quick pill controls on the widget header to adjust count (`Count: 6 | 12 | 18 | 24 | Fill`) and size mode on the fly.
* **Varied & Random Polaroid Sizing (`PhotoFrameWidget.tsx`):**
  * Added **Random / Mixed Sizes** mode, scattering an authentic assortment of **Hero Large Prints** (`280px–310px`), **Classic Medium Polaroids** (`200px–230px`), and **Compact Snapshots** (`135px–165px`).
  * Supports **Uniform Medium**, **Compact Snapshots**, and **Large Hero Prints** presets in settings.
  * Faster dynamic photo swapping on dense collages to keep high-count boards continuously refreshed.

### Fixed
* **Trapped Release Notes & Share Modals (`ChangelogModal.tsx`, `ShareBoardModal.tsx`, `AmbientQuickMenu.tsx`):**
  * Wrapped `ChangelogModal`, `ShareBoardModal`, and the quick menu click-outside backdrop in `createPortal(..., document.body)` with `z-[100]`.
  * Eliminates the CSS transform clipping bug where modals opened from the dock were trapped within the 48px-wide dock column.
  * Added click-outside backdrop dismissal and `Escape` key listeners to seamlessly close modals.

---

## [0.1.2] - 2026-11-02

### Added
* **Ambient Quick Command & Kiosk HUD Popover (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`):**
  * Turned the Ambiently brand logo in the Navigation Dock into an interactive trigger opening a floating kiosk HUD popover.
  * Instant 1-tap toggles for **Night Mode**, **Fullscreen Kiosk**, **Tab Carousel (Auto-Rotate)**, and **Return to Home Board**.
  * Shows live system status (`🟢 Local-First Engine`), clock, and release version badge linking directly to the Changelog modal.
  * Direct shortcuts for **Connect Phone (Family QR Code)** and **Settings & Boards Manager**.
* **Scattered Polaroids Multi-Photo Gallery (`PhotoFrameWidget.tsx`):**
  * Redesigned the Polaroid display style into an organic 6-photo scattered collage with natural tilts (`-7°` to `+8°`), drop shadows, and vintage washi tape decals.
  * Live random photo updates: continuously swaps in fresh, non-repeating photos from connected libraries (curated presets, Plex, local folders) with smooth spring drop animations.
  * Interactive controls: hover to zoom in (`scale: 1.12`) and inspect at `0°`, or tap any individual Polaroid to immediately shuffle its photo.

### Fixed
* **Uncropped Sticky Note Rotate Handle (`Corkboard.tsx`):**
  * Lifted the `overflow-hidden` restriction on sticky note card containers so the top-center rotate grab handle sits cleanly above the top border without being cut in half.
  * Aligned the handle to `-top-3` with a crisp `w-6 h-6` circular pill matching widget tiles.
* **Sticky Notes Tile Header Action Collision (`StickyNotesWidget.tsx`):**
  * Relocated the **`+ New Note`** button to the left alongside the **`Notes (x)`** / **`Trash (x)`** tab cluster, preventing the top-right widget hover toolbar from covering it.
  * Added clearance padding (`pr-28`) to **Calendar** and **RSS** tile headers to safeguard view toggle and refresh buttons from hover overlay collisions.

### Removed
* **Dock Auto-Backup Icon (`NavigationDock.tsx`):** Removed the redundant `FolderSync` auto-backup icon from the navigation dock toolbar (backup and auto-sync remain accessible in Settings under Backup & Sync).

---

## [0.1.1] - 2026-11-02

### Added
* **Unified Navigation Dock Action Cluster (`NavigationDock.tsx`):**
  * Relocated **Pin New Sticky Note** (`Pin`), **Add Widget Tile** (`LayoutGrid`), **Auto-Organize / Auto-Tile** (`Wand2`), and **Trash / Archive Drawer** (`Archive` with badge) into the Navigation Dock to eliminate top-right button overlaps on full-bleed canvases.
* **1-Click Auto-Organize & Auto-Tile Engine (`autoLayout.ts`, `dashboardStore.ts`, `Corkboard.tsx`):**
  * **Smart Bento Grid:** Packs widgets into balanced golden-ratio columns (`60% / 40%`, `2×2`, or `3-column` grids) and aligns sticky notes cleanly below or beside.
  * **Keep Current Sizes (Pack Only):** Uses a 2D shelf-packing algorithm to resolve overlaps while preserving custom user-resized tile dimensions, plus a 1-click `0°` rotation straightening option.
  * **Widgets Left | Sticky Notes Right:** Splits the board into a `68%` structured widget zone on the left and a `30%` 2-column sticky note rail on the right.
  * Includes **1-Click Undo (`Undo2`)** snapshot restoration, smooth `300ms` CSS layout transitions, and smart non-overlapping placement (`findOpenCanvasSpot`) when spawning new widgets or notes.
* **Per-Canvas Background Themes, 4K/5K Picture Upload & Dim Slider (`canvasThemes.ts`, `imageUpload.ts`, `CreateCanvasModal.tsx`, `SettingsModal.tsx`):**
  * 5 procedural surface themes (`Midnight Dots`, `Warm Cork`, `Pure OLED Black`, `Ambient Aurora`, `Glass Blueprint`).
  * Custom picture background uploader with adaptive 1080p / 4K / 5K Ultra HD client-side WebP/JPEG compression (`3840×2160` / `5120×2880`) and 4 curated 4K presets.
  * **Background Dim Level Slider (`0%` – `90%`)** per canvas with live preview to keep white widget typography legible over bright photos.
* **Per-Canvas Sticky Note Isolation & Visibility Controls (`App.tsx`, `Corkboard.tsx`, `SettingsModal.tsx`, `MobileCompanion.tsx`):**
  * Fixed note filtering so each canvas displays only its own notes (`tabId === activeTabId`) or global notes (`tabId === 'all'`).
  * Added a **Canvas Board Selector** (including `📌 Pin to All Canvases`) inside the Note Creator/Editor modal and a per-canvas **Show / Hide Sticky Notes (`Eye` / `EyeOff`)** toggle in Settings.
* **Sticky Note Resizing, Rotation, Inline Editing & Color Swatches (`Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Expanded sticky note resizing from compact `8% × 8%` mini post-its up to `100% × 100%` full-canvas posters.
  * Added **Typography Size Pills (`S`, `M`, `L`, `XL`)**, a smooth **360° Grab-and-Rotate Handle (`↻`)** with `0°` magnetic snap, **Inline Note Editing** (`✏️` button or double-click), and **1-Click Inline Pastel Color Swatches** directly on the note hover bar and Mobile Companion cards.
* **World Timezone Clock & Universal Display Seconds Toggle (`WorldClockWidget.tsx`, `ClockWidget.tsx`, `ClockWeatherWidget.tsx`, `WidgetSettingsModal.tsx`):**
  * New **World Timezone Clock (`world_clock`)** widget with Open-Meteo city geocoding lookup supporting **Single-City Hero Clock** (digital, minimalist, or analog dial) and **Multi-City World Timezone List** modes with live day/night indicators and relative day badges (`Today`, `+1d`, `-1d`).
  * Added **Display Seconds (`showSeconds`)** toggle and optional city timezone override across all Clock and Clock+Weather tiles.
* **Ambient Stream & Web Embed Tile (`MediaEmbedWidget.tsx`) & Custom Family Affirmations (`QuotesWidget.tsx`):**
  * Added **Ambient Stream & Web Embed (`media_embed`)** widget with 1-click presets (`Lofi Girl`, `Synthwave Radio`, `NASA ISS Live Earth`, `Monterey Bay Jellyfish Cam`, `Tokyo Night Walk`) and custom YouTube / HTTPS iframe support with persisted mute toggle.
  * Upgraded **Daily Quotes & Affirmations (`QuotesWidget.tsx`)** to support custom family affirmations, house rules, and Wi-Fi reminders alongside curated philosophical quotes.

### Removed
* Removed the floating top-right Corkboard action buttons (`Corkboard.tsx`) in favor of the unified Navigation Dock action cluster.
* Removed the decorative red pushpin dots (`bg-red-600`) from the top of Corkboard tiles and sticky notes for a cleaner modern aesthetic.

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
