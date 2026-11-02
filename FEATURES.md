# Ambiently — Features & Capabilities Reference

**Ambiently** (`dashboard.trinhism.com`) is a modern, ambient smart-display and command center Progressive Web App (PWA) built under the Trinhism ecosystem. It transforms idle tablets, Raspberry Pi monitors, smart TVs, and laptops into a glanceable, zero-clutter family hub and personal dashboard.

---

## 1. Core Layout & Kiosk Shell (Phase 1)

### Pure Freeform Corkboard Multi-Canvas Engine
* **Unified Corkboard Canvas Architecture:** Every tab is an independent, customizable freeform pinboard canvas (`Corkboard.tsx`) where both Sticky Notes and Live Widgets coexist with normalized coordinates (`xRatio`, `yRatio`, `wRatio`, `hRatio`), rotation (`-15°` to `+15°`), and automatic bring-to-front (`zIndex`) layering.
* **Interactive Corner Drag Resizing (`↘`) & 1-Click Fullscreen (`⛶`):** Drag any widget or sticky note's bottom-right grip handle to resize it smoothly, or click the Maximize (`Maximize2`) button to expand any widget (such as a Photo Frame or Calendar) to fill 100% of the canvas.
* **Custom Canvases & Icon Picker:** Create unlimited boards via the `+` button in the Navigation Dock or Settings, choosing from 16 curated Lucide icons (`Pin`, `Image`, `Calendar`, `Home`, `Coffee`, `Heart`, `Star`, `Music`, `Sun`, `CheckSquare`, `Sparkles`, `Smile`, `Tv`, `Folder`, `Clock`, `LayoutGrid`) and reorder tabs with 1-click `▲` / `▼` controls.

### Multi-Tab Navigation Dock & Automated Carousel
* **4-Edge Dock Placement:** Position the glassmorphic navigation dock on the **Left, Right, Top, or Bottom** of the screen to match physical wall mounts and reachability.
* **Automated Tab Carousel:** Enable auto-rotation (`15s`, `30s`, `45s`, `1m`, `2m`) to cycle across your canvases automatically. Touching or clicking anywhere on the screen temporarily pauses the carousel for 20 seconds.

### Kiosk Hardware & Screen Polish
* **Screen Wake Lock API:** Prevents tablets and smart displays from dimming or locking while the dashboard is open.
* **Fullscreen Kiosk Toggle:** One-tap fullscreen mode via the browser Fullscreen API.
* **Scheduled Night Mode & Burn-In Protection:**
  * Configurable auto-start and morning wake times (`22:00` – `07:00`).
  * **OLED Clock Mode:** Pitch-black `#000000` background with a ultra-dim red digital clock that shifts pixels every 60 seconds (`±15px`) to prevent OLED/LCD image retention.
  * **Dim Overlay Mode:** Adjustable opacity dark veil (`40%`–`95%`).
  * Tap anywhere on the screen to wake immediately.
* **Kid-Proof PIN Lock:**
  * SHA-256 hashed 4-digit PIN lock that disables widget dragging, note deletion, and settings modifications.
  * Includes a **4-second press-and-hold Parent Challenge** fallback in case a PIN is forgotten.
* **Isolated Canvas Display Density Scaler:** Scale board cards (`75%`, `100%`, `125%`, `150%`) for 1080p, 1440p, or 4K screens while keeping the Navigation Dock and Settings modals pinned at 100% viewport scale.

---

## 2. Smart Sticky Notes, Checklists & Corkboard (Phase 2)

* **Rich Note & Interactive Checklist Modes:** Switch seamlessly between free-text notes and interactive to-do checklists with live strikethrough completion.
* **6-Color Pastel Palette:** Customize notes in Amber Yellow, Emerald Green, Sky Blue, Rose Pink, Lavender Purple, or Warm Peach.
* **Note Expiration & Auto-Cleanup Engine:**
  * Assign notes as **Permanent**, **Expire in 24 Hours**, **Expire in 3 Days**, or pick a **Custom Date/Time**.
  * Notes expiring within 12 hours display an amber warning border and badge.
  * Expired or deleted notes automatically move to the **Trash / Archive Drawer** for 1-click restoration or permanent deletion.
* **Dedicated Sticky Notes Tile (`StickyNotesWidget.tsx`):** In addition to freeform notes pinned directly to the canvas, users can add a compact Sticky Notes list & Trash drawer tile from `+ Add Tile`.

---

## 3. Multi-Source Ambient Photo Frame (Phase 3)

### 4 Distinct Visual Display Styles
1. **Ken Burns (Ambient Pan & Zoom):** Full-bleed edge-to-edge crossfades with smooth continuous scale/pan motion and readable gradient vignettes.
2. **Mosaic / Collage Grid:** 4-quadrant multi-photo grid highlighting active frames.
3. **Classic Polaroid:** Angled vintage photo frame with caption and photographer attribution.
4. **Scrolling Filmstrip:** Horizontal interactive thumbnail ribbon.

### 4 Built-In Photo Connectors (`PhotoSourcesModal.tsx`)
* **Plex Media Server (1-Scan QR Code PIN Flow):** Generates a 4-digit Plex PIN and scannable QR code (`https://app.plex.tv/auth#?clientID=...&code=...`), auto-discovers your Plex server, and streams photo libraries directly.
* **Local / NAS Folder Picker:** Uses the browser `showDirectoryPicker` API (with recursive folder input fallback) to stream `.jpg`, `.png`, `.webp`, `.gif`, and `.avif` photos straight from a local folder or SMB/NAS network share.
* **Google Drive & Direct Web Links:** Paste shared Google Drive image links (automatically converted to direct view URLs) or image URLs.
* **Curated Photography Presets:** Instant 1-click categories (*Nature*, *Architecture*, *Space*, *Cozy*) cached in the browser `CacheStorage` API (`ambiently-photo-cache-v1`) for offline playback.

---

## 4. Essential Glanceable Widgets (Phase 4)

Every widget features a top-right **Tile Settings (`⚙️`)** button to customize its title and specific parameters:

* **Clock & Weather Combo (`ClockWeatherWidget.tsx`), Standalone Clock (`ClockWidget.tsx`) & Weather (`WeatherWidget.tsx`):**
  * Live clock supporting **Digital**, **Minimalist**, and **Analog Dial** faces with optional seconds ticker.
  * Powered by **Open-Meteo API** (zero API key required) with a 1-click **City Geocoding Lookup** in Tile Settings, Fahrenheit/Celsius toggle, current temperature, "feels like", high/lows, and daily forecast strip.
* **Multi-Source Calendar (`CalendarWidget.tsx`):**
  * Toggle between **Chronological Agenda View** and **Monthly Calendar Grid**.
  * Add, toggle, color-tag, or remove multiple public/secret `.ics` and `webcal://` URLs (Google Calendar, Apple iCloud, Outlook) in Tile Settings, parsed via our Cloudflare Pages Edge proxy (`/api/ical-proxy`).
* **RSS News Ticker (`RssWidget.tsx`):**
  * Displays rotating headlines and relative timestamps from any RSS 2.0 or Atom feed via `/api/rss-proxy`.
* **Milestone Countdown (`CountdownWidget.tsx`) & Daily Quotes (`QuotesWidget.tsx`):**
  * Live days/hours/minutes/seconds countdown timer to upcoming events, plus daily rotating inspiration quotes.

---

## 5. Mobile Companion Mode & Hybrid Sync (Phase 5)

* **Responsive Mobile Companion (`< 768px`):**
  * Automatically serves a streamlined mobile interface (`MobileCompanion.tsx`) when opened on a smartphone, with a 1-tap toggle to switch to the full Kiosk view if desired.
  * **Quick Note & Checklist Bar:** Type a note or grocery item on your phone to push it to the wall display.
  * **Remote Tab Switcher:** Tap any tab pill on your phone to switch the active canvas.
* **Family QR Code Invite (`ShareBoardModal.tsx`):**
  * Generate a scannable QR code and 6-digit join code in Settings so family members can connect their phones without typing passwords.
* **3-Tier Persistence & Backup:**
  1. **Tier 1 (Default):** 100% local IndexedDB storage (`Dexie.js`).
  2. **Tier 2 (Local File Backup):** 1-click JSON export/restore plus automatic PC file mirroring (`ambiently-data.json`) via the File System Access API.
  3. **Tier 3 (Cloud Sync):** Optional email magic-link login and multi-device real-time sync powered by Supabase Auth & Postgres.
