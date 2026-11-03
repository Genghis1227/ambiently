# Ambiently — Features & Capabilities Reference

**Ambiently** (`dashboard.trinhism.com`) is a modern, ambient smart-display and command center Progressive Web App (PWA) built under the Trinhism ecosystem. It transforms idle tablets, Raspberry Pi monitors, smart TVs, and laptops into a glanceable, zero-clutter family hub and personal dashboard.

---

## 1. Core Layout & Kiosk Shell (Phase 1)

### Pure Freeform Corkboard Multi-Canvas Engine
* **Unified Corkboard Canvas Architecture:** Every tab is an independent, customizable freeform pinboard canvas (`Corkboard.tsx`) where both Sticky Notes and Live Widgets coexist with normalized coordinates (`xRatio`, `yRatio`, `wRatio`, `hRatio`), continuous `360°` rotation, and automatic bring-to-front (`zIndex`) layering.
* **1-Click Auto-Organize & Auto-Tile Engine (`autoLayout.ts`):**
  * Click the **Auto-Organize (`Wand2`)** button in the Navigation Dock to smoothly animate all widgets and sticky notes on the active canvas into a zero-overlap layout across **3 selectable modes**:
    1. **Smart Bento Grid (`bento`):** Full-canvas zero-overlap Bento grid prioritizing primary widgets in hero slots.
    2. **Keep Sizes & Pack (`pack`):** 2D shelf-packing that preserves each card's user-chosen dimensions and aspect ratio without overlapping.
    3. **Split Zones (`split`):** Tiles all Live Widgets on the left (`63%`) and organizes Sticky Notes into a clean corkboard column on the right (`31%`).
  * Includes **1-Click Undo (`RotateCcw`)** to restore your previous manual layout, plus **Smart Open-Space Spawning** so newly created tiles and notes automatically place themselves in unoccupied areas of the board.
* **Interactive Corner Drag Resizing (`↘`), Grab-and-Rotate Handle (`↻`), & 1-Click Fullscreen (`⛶`):**
  * Drag any widget or sticky note's bottom-right grip handle to resize it smoothly (with sticky notes scaling from compact `110px × 90px` mini post-it tags up to `100%` full-board posters).
  * Grab the **top-center Rotate Handle (`↻`)** next to any pushpin to spin notes or widgets smoothly to any angle with a live degree indicator (`14°`), magnetic snap to `0°` within `±2.5°`, and double-click to straighten.
  * Click the Maximize (`Maximize2`) button to expand any widget (such as a Photo Frame or Calendar) to fill 100% of the canvas.
* **Per-Canvas Background Themes, 4K Local Picture Upload & Dim Level Control (`canvasThemes.ts`, `imageUpload.ts`):**
  * Customize each canvas independently during creation (`CreateCanvasModal.tsx`) or in Settings (`SettingsModal.tsx`) with **Midnight Slate Dots**, **Warm Tactile Cork**, **OLED Pitch Black**, **Nordic Aurora**, **Architect Blueprint Grid**, or **Custom Picture Wallpaper**.
  * **Upload Local Picture (Up to 4K Ultra HD `3840×2160`):** Upload any photo from your device (optimized in-browser with native 4K/5K screen resolution support for 100% offline IndexedDB & JSON backup persistence), pick from **4 Curated 4K Photo Presets**, or paste a direct image URL.
  * **Adjustable Background Dim Level (`0%` – `90%`):** Fine-tune the dark contrast veil over any custom background picture with a live preview slider.
* **Custom Canvases & Icon Picker:** Create unlimited boards via the `+` button in the Navigation Dock or Settings, choosing from 16 curated Lucide icons and reorder tabs with 1-click `▲` / `▼` controls.

### Multi-Tab Navigation Dock & Automated Carousel
* **4-Edge Dock Placement & Zero-Overlap Canvas Actions:** Position the glassmorphic navigation dock on the **Left, Right, Top, or Bottom** of the screen. Canvas actions (`Pin New Sticky Note`, `Add Widget Tile`, `Auto-Organize / Auto-Tile`, and `Archived & Expired Notes` with live badge count) live directly in the dock so top-right and fullscreen tiles have 100% unobstructed access to their hover controls.
* **Automated Tab Carousel:** Enable auto-rotation (`15s`, `30s`, `45s`, `1m`, `2m`) to cycle across your canvases automatically. Touching or clicking anywhere on the screen temporarily pauses the carousel for 20 seconds.

### Kiosk Hardware & Screen Polish
* **Screen Wake Lock API:** Prevents tablets and smart displays from dimming or locking while the dashboard is open.
* **Fullscreen Kiosk Toggle:** One-tap fullscreen mode via the browser Fullscreen API.
* **Scheduled Night Mode & Burn-In Protection:**
  * Configurable auto-start and morning wake times (`22:00` – `07:00`).
  * **OLED Clock Mode:** Pitch-black `#000000` background with an ultra-dim red digital clock that shifts pixels every 60 seconds (`±15px`) to prevent OLED/LCD image retention.
  * **Dim Overlay Mode:** Adjustable opacity dark veil (`40%`–`95%`).
  * Tap anywhere on the screen to wake immediately.
* **Kid-Proof PIN Lock:**
  * SHA-256 hashed 4-digit PIN lock that disables widget dragging, note deletion, and settings modifications.
  * Includes a **4-second press-and-hold Parent Challenge** fallback in case a PIN is forgotten.
* **Isolated Canvas Display Density Scaler:** Scale board cards (`75%`, `100%`, `125%`, `150%`) for 1080p, 1440p, or 4K screens while keeping the Navigation Dock and Settings modals pinned at 100% viewport scale.

---

## 2. Smart Sticky Notes, Checklists & Corkboard (Phase 2)

* **Per-Canvas Sticky Note Isolation & Board Assignment:**
  * Each canvas owns its own independent sticky notes by default so new canvases start completely clean and deleting a note on one canvas never deletes notes on another.
  * Move any note to another canvas—or explicitly select **📌 Pin to All Canvases**—via the Canvas Board selector inside the Note Creator / Editor modal.
  * Toggle **Show / Hide Sticky Notes (`Eye` / `EyeOff`)** per canvas in Settings to temporarily hide all sticky notes on a board without deleting them.
* **Rich Note & Interactive Checklist Modes:** Switch seamlessly between free-text notes and interactive to-do checklists with live strikethrough completion.
* **Inline Sticky Note Editing (`✏️` / Double-Click):** Edit any existing note's title, message body, checklist items (add, edit, or delete rows), pastel color, typography scale (`S`, `M`, `L`, `XL`), canvas board assignment, or expiration timer without losing its position, size, or rotation on the corkboard.
* **Wide-Range Sizing & 4 Font Scales (`S / M / L / XL`):** Resize sticky notes from tiny `8%` label tags all the way up to `100%` posters, and choose from Small (`S`), Medium (`M`), Large (`L`), or Poster (`XL`) text scales.
* **6-Color Pastel Palette:** Customize notes in Amber Yellow, Emerald Green, Sky Blue, Rose Pink, Lavender Purple, or Warm Peach.
* **Close Floating Sticky Notes & Smart Canvas Placement (`Corkboard.tsx`, `App.tsx`):**
  * **1-Click Close (`✕`)**: Every floating note on the corkboard features a close button in its header. Closing a note unpins it from the canvas (`isPinnedToCanvas: false`) without deleting it, keeping it active and safe in the Notes Tile.
  * **Pin to Board with Collision Avoidance**: Click `[ 📌 Pin to Board ]` in the Notes Tile to pop notes back onto the corkboard. Ambiently automatically unhides notes, elevates `zIndex`, detects widget coverage, auto-positions into open space, and displays a 2.5s visual pop-out ring.
* **Note Expiration & Auto-Cleanup Engine:**
  * Assign notes as **Permanent**, **Expire in 24 Hours**, **Expire in 3 Days**, or pick a **Custom Date/Time**.
  * Notes expiring within 12 hours display an amber warning border and badge.
  * Expired or deleted notes automatically move to the **Trash / Archive Drawer** for 1-click restoration or permanent deletion.
* **Dedicated Sticky Notes Tile (`StickyNotesWidget.tsx`):** In addition to freeform notes pinned directly to the canvas, users can add a compact Sticky Notes list & Trash drawer tile from `+ Add Tile`.

---

## 3. Multi-Source Ambient Photo Frame (Phase 3)

### Clean Ambient Display & Centralized Configuration
* **100% Collision-Free Smart Display:** Presentation styles and photo library source management are located entirely inside **Tile Configuration (`WidgetSettingsModal` / `PhotoSourcesModal`)**. The photo frame itself is kept clean and immersive with only a subtle caption pill on the top-left and photo attribution on the bottom-right, eliminating hover action collisions with `{ ⚙️, ⤢, 🗑️ }`.

### 4 Distinct Visual Display Styles
1. **Ken Burns (Ambient Pan & Zoom):** Full-bleed edge-to-edge crossfades with smooth continuous scale/pan motion and readable gradient vignettes.
2. **Mosaic / Collage Grid:** 4-quadrant multi-photo grid highlighting active frames.
3. **Scattered Polaroids:** Angled vintage photo frames with custom density (`6`, `12`, `18`, `24`, `32` / Fill) and size modes (`Random Sizes` / `Uniform`).
4. **Scrolling Filmstrip:** Horizontal interactive thumbnail ribbon.

### Comprehensive Media Sources (`PhotoSourcesModal.tsx`)
* **Google Photos Shared Albums (Deep batchexecute Pagination):** Paste any public Google Photos shared album link (`photos.app.goo.gl` or `photos.google.com/share`). Automated `snAcKc` batchexecute RPC pagination retrieves massive libraries (tested and benchmarked with 7,500+ photos in ~11s) while maintaining lightweight in-memory descriptors and on-demand lazy loading.
* **Google Drive Public Shared Folders:** Paste public Google Drive folder links (`drive.google.com/drive/folders/...`) to extract all images into high-resolution streamable photos (`=w1920-h1080`) via our `/api/gdrive` serverless extractor.
* **Local PC & NAS Multi-Folder Stacking (5,000+ Photos):** Multi-folder selection using the browser File System Access API with recursive 8-level subdirectory scanning. Includes configurable scan capacity (`1k`, `2.5k`, `5k`, `10k`), live scan progress feedback, and an inline `[ + Add Another Folder ]` action bar.
* **Plex Media Server (1-Scan QR Code PIN Flow):** Generates a 4-digit Plex PIN and scannable QR code (`https://app.plex.tv/auth#?clientID=...&code=...`), auto-discovers your Plex server, and streams photo libraries directly.
* **Curated Photography Presets:** Instant 1-click categories (*Nature*, *Architecture*, *Space*, *Cozy*) cached in the browser `CacheStorage` API (`ambiently-photo-cache-v1`) for offline playback.

---

## 4. Essential Glanceable Widgets (Phase 4)

Every widget features a top-right **Tile Settings (`⚙️`)** button to customize its title and specific parameters:

* **Clock & Weather Combo (`ClockWeatherWidget.tsx`), Standalone Clock (`ClockWidget.tsx`), World Timezone Clock (`WorldClockWidget.tsx`) & Weather (`WeatherWidget.tsx`):**
  * Live clock supporting **Digital**, **Minimalist**, and **Analog Dial** faces with a universal **Display Seconds (`showSeconds`)** toggle on all clock & time tiles.
  * **City-Lookup World Timezone Clock (`WorldClockWidget.tsx`):** Search any global city (e.g., *Tokyo*, *London*, *Ho Chi Minh City*, *New York*) to automatically resolve its IANA timezone, displaying either a **Single-City Hero Timezone Clock** or a **Multi-City World Timezone Board** with day/night icons (`Sun` / `Moon`), timezone abbreviations, and relative hour offsets (`+15h ahead`, `-2h behind`).
  * Powered by **Open-Meteo API** (zero API key required) with a 1-click **City Geocoding Lookup** in Tile Settings, Fahrenheit/Celsius toggle, current temperature, "feels like", high/lows, and daily forecast strip.
* **Multi-Source Calendar (`CalendarWidget.tsx`):**
  * Toggle between **Chronological Agenda View** and **Monthly Calendar Grid**.
  * Add, toggle, color-tag, or remove multiple public/secret `.ics` and `webcal://` URLs (Google Calendar, Apple iCloud, Outlook) in Tile Settings, parsed via our Cloudflare Pages Edge proxy (`/api/ical`).
* **Ambient Stream & Web Embed Tile (`MediaEmbedWidget.tsx`):**
  * Embed live video/audio streams or web dashboards directly on any canvas with 1-click presets (*Lofi Hip Hop Radio*, *4K Cozy Fireplace*, *NASA ISS Live Earth View*, *Live Weather Radar via Windy.com*) or any custom YouTube / web embed URL, complete with quick audio mute/unmute and reload controls.
* **Daily Quotes & Custom Family Affirmations (`QuotesWidget.tsx`):**
  * Add custom family affirmations, house rules, or personal mantras in Tile Settings, choose between **Curated Only**, **Custom Only**, or **Mix Both**.
  * **Configurable Update Intervals:** Choose auto-rotation speed (`30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `Daily`, `Manual`) with smooth cross-fade opacity transitions and dynamic header badges (`Thought of the Day`, `Thought of the Hour`, `⏱ 1h`).
* **RSS News Ticker (`RssWidget.tsx`):**
  * Displays rotating headlines and relative timestamps from any RSS 2.0 or Atom feed via `/api/rss`.
* **Milestone Countdown (`CountdownWidget.tsx`):**
  * Live days/hours/minutes/seconds countdown timer to upcoming vacations, birthdays, or milestones.

---

## 5. Mobile Companion Mode & Hybrid Sync (Phase 5)

* **Vertical Tile Stream (`MobileCompanion.tsx`):**
  * Automatically serves a structured single-column vertical feed of the active canvas when opened on a smartphone (`< 768px`).
  * **Live Preview Cards:** Every canvas widget (Clock & Weather, Countdown, Photos, RSS, Quotes, Media, Notes) renders a live mobile-responsive preview card.
  * **Persistent View Option Filter:** 3-way segmented filter pills (`All Tiles` | `Widgets` | `Notes & Tasks`) automatically persisted in `localStorage`.
  * **Independent Mobile Reordering (`▲` / `▼`):** Move buttons on each widget card modify an isolated `mobileOrder` property with zero impact on the desktop/kiosk layout.
  * **Mobile Tile Settings & Creation:** 1-tap `⚙️` button opens the full tile customizer on mobile, plus a `+ Add Tile` button to add new widgets from your phone.
  * **Hardware Momentum Touch Scrolling:** Bound to `fixed inset-0 w-full h-[100dvh]` with `touch-action: pan-y` and momentum scrolling for smooth vertical swiping.
* **Quick Note & Inline Mobile Editing:** Post new notes/checklists to the selected canvas, edit existing notes (`✏️`), or append new items (`+ Add item`) to existing checklists directly from your phone.
* **Remote Tab Switcher:** Tap any tab pill on your phone to view and manage that canvas's widgets and notes.
* **Family QR Code Invite (`ShareBoardModal.tsx`):**
  * Generate a scannable QR code and 6-digit join code in Settings so family members can connect their phones without typing passwords.
* **3-Tier Persistence & Backup:**
  1. **Tier 1 (Default):** 100% local IndexedDB storage (`Dexie.js`).
  2. **Tier 2 (Local File Backup):** 1-click JSON export/restore plus automatic PC file mirroring (`ambiently-data.json`) via the File System Access API.
  3. **Tier 3 (Cloud Sync):** Optional email magic-link login and multi-device real-time sync powered by Supabase Auth & Postgres.

---

## 6. Upcoming Roadmap (`v0.3.0` Next Up)

* **Family Chore & Habit Tracker Widget (`ChoreTrackerWidget.tsx`):**
  * Dedicated recurring routine & chore board widget with **Daily Auto-Reset** (automatically unchecks daily routines at midnight while preserving streak counts) or **Manual Reset**.
  * **Family Member Avatar / Color Tags** (e.g., *Kids*, *Morning*, *Evening*, or custom names) and an animated circular completion ring when all daily tasks are finished.
