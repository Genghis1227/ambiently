# Ambiently (`dashboard.trinhism.com`)

> Modern, ambient smart-display and command center Progressive Web App (PWA) under the Trinhism ecosystem, designed as a self-hosted, local-first alternative to commercial display services (Mango Display, DAKboard, Skylight).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/package-json/v/Genghis1227/ambiently?label=Release&color=cyan)](CHANGELOG.md)

![Ambiently Banner](public/og-banner.png)

---

## 📚 Project Documentation

* **[Features & Capabilities Reference (FEATURES.md)](FEATURES.md)** — Comprehensive breakdown of widgets, multi-canvas corkboard architecture, photo frames, and mobile companion.
* **[System Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)** — Local-first persistence engine, Cloudflare edge workers, resolution scaling, and Supabase cloud sync.
* **[Changelog (CHANGELOG.md)](CHANGELOG.md)** — Semantic version history and release notes.
* **[Developer Workflow (DEVELOPER_WORKFLOW.md)](DEVELOPER_WORKFLOW.md)** — Standard Trinhism contributor protocols and git branch sequence.

---

## 🌟 Highlights

* **⚡ 0ms Offline-First Boot:** Runs entirely out of client-side browser storage (IndexedDB via Dexie.js). Never shows a blank screen if home Wi-Fi drops.
* **💾 Local File Auto-Sync & JSON Snapshots:** Direct integration with the browser File System Access API to auto-save and mirror state directly to a local `ambiently-data.json` file, plus 1-click JSON export/restore.
* **📌 Pure Freeform Corkboard Multi-Canvas Engine:**
  * **Custom Canvases & Default Home Board:** Create up to 10 dedicated boards (e.g., *Family Board*, *Photo Gallery*, *Morning Briefing*) with 30 custom Lucide icons, 1-click tab reordering (`▲`/`▼`), and selectable default Home Board indicator.
  * **Compact Toolbar Horizontal Pop-Out Panels:** Keep all canvas buttons accessible even on smaller screens with horizontal pop-out bars for the **`+` Add Menu** (*New Note*, *Add Widget*, *New Canvas*), **Auto-Organize** (*Smart Bento Grid*, *Keep Sizes & Pack*, *Split Zones*), and **Quick Utilities** (*Night Mode*, *Fullscreen*, *Refresh/Update*, *Hide Toolbar*).
  * **Interactive Freeform Pinboard:** Drag, tilt (`↺`/`↻`), layer (`z-index`), resize via bottom-right corner handles (`↘`), or toggle any widget to **100% Fullscreen Canvas** with one click.
  * **Smart Pinned Notes (3 Formats):** Create **Text Notes**, **Checklists**, or dedicated **🛒 Shopping List** sticky notes (with automatic store-aisle grouping, inline `+ Add grocery item...`, and 1-tap `Clear (X)`), and pop floating notes onto the canvas with automatic collision avoidance.
* **🍽️ Family Meal Planner, Recipe Scraper, Smart Grocery List & Cooking Mode:**
  * **Flexible Calendar Scopes & Automatic Pruning:** Switch between **Tomorrow**, **3-Day**, or **Full Week (7-Day)** views across Breakfast, Lunch, Dinner, and Snack slots, with automatic 21-day history pruning so local storage and cloud sync payloads stay lightweight.
  * **Quick-Meal Autocomplete & Recipe URL Scraper (`/api/metadata`):** Schedule meals in one tap using dynamic autocomplete chips from your recent history, or paste any recipe URL to automatically extract Schema.org `Recipe` JSON-LD ingredients, directions, prep/cook times, and hero photos.
  * **Distraction-Free Cooking Mode:** Tap any linked recipe to launch a high-contrast, step-by-step kitchen modal with interactive ingredient checkboxes, progress tracking, and automatic **Screen Wake Lock** so the display never dims while cooking.
  * **Smart Grocery Aggregator & Sticky Note Sync:** Automatically deduplicates and combines ingredient quantities across your active date window, sorts items by grocery store aisle, exports to **Google Keep**, or pushes directly into a **`🛒 Shopping List` Sticky Note** on your canvas.
* **🏆 Family Chore & Reward Engine + Global Household Profiles:**
  * **Global Household Profiles & HEIC/WebP Avatars:** Manage `Parent` and `Kid` profiles with client-side iOS 17/18 `.HEIC`/`.HEIF` photo decoding (`libheif-js`), an interactive circular zoom/pan/rotate cropper (`256×256` WebP), or custom keyboard emojis.
  * **Dual-View Kiosk Experience:** Add the compact Bento **Chores & Rewards** tile to any canvas and click its header **Maximize** button (or enable *Full-Screen Hub on Canvas* in Tile Settings) to open the 3-column **Full-Screen Chore & Reward Hub**.
  * **Flexible Cadences & Shared Splits:** Schedule chores as *Daily*, *Weekdays*, *Weekends*, *Weekly — Any Day (1× / Week)*, *Weekly (Specific Days)*, *Interval (Every N Days)*, or *One-Off Bounty*. Assign to individual kids (with multi-kid checkboxes & 1-click duplication) or as a *Shared Pool* task with interactive integer point splitting.
  * **24-Hour Overdue Grace Window & Vacation Mode:** Unfinished tasks roll over for a 24-hour grace window (with configurable `100%`, `50%`, `0%`, or custom % overdue point policies and manual/auto dismissal after 24 hours) and pause automatically when **Vacation Mode** is active.
  * **Append-Only Audit Ledger, Wishlist Store & Trophy Case:** Every point transaction is recorded in an immutable audit ledger. Kids can propose wishlist rewards (with automatic URL title/image/price scraping via `/api/metadata`), parents price and approve redemptions behind a 4-digit PIN, and fulfilled prizes are archived into each child's **Trophy Case**.
* **📰 In-App Kiosk Reader Mode, Web Preview & 26 Curated RSS Feeds:**
  * **Distraction-Free Article Reader (`/api/reader`):** Powered by Mozilla Readability and Linkedom to extract clean article text, hero images, and tables without leaving kiosk mode, paired with an edge **Web Preview (`/api/web-proxy`)** fallback and a 26-feed curated directory across 6 categories.
* **📱 Mobile Companion Remote & Vertical Tile Stream:**
  * **Full Canvas Live Stream:** Seamless single-column vertical feed rendering live preview cards for all widgets (Clock, Weather, Countdown, Photos, RSS, Quotes, Media, Notes, Chores).
  * **Persistent View Options:** 3-way segmented filter pills (`All Tiles` | `Widgets` | `Notes & Tasks`) automatically persisted in `localStorage`.
  * **Independent Mobile Reordering (`▲` / `▼`):** Reorder mobile cards on the fly without impacting non-mobile desktop or kiosk coordinates.
  * **Mobile Tile Customizer & Creation:** 1-tap `⚙️` button opens full tile settings on mobile, with `+ Add Tile` creation directly from smartphones.
  * **Hardware Momentum Scrolling:** Native `100dvh` viewport binding with `touch-pan-y` and momentum touch scrolling.
* **🖼️ Multi-Source Ambient Photo Frame & Clean Aesthetic:**
  * **Centralized Configuration:** Picture presentation modes (*Ken Burns*, *Mosaic Collage*, *Scattered Polaroids*, *Filmstrip*) and media library sources live entirely in Tile Settings, keeping the ambient smart-display screen completely clean and collision-free.
  * **Google Photos Shared Albums (Deep batchexecute Pagination):** Automated `snAcKc` RPC pagination to ingest massive shared albums (tested and benchmarked with 7,500+ photos) with lightweight descriptors and on-demand lazy loading.
  * **Google Drive Shared Folders:** Direct ingestion of public Google Drive shared folders (`drive.google.com/drive/folders/...`) into high-resolution slideshow streams (`=w1920-h1080`).
  * **Local / NAS Multi-Folder Stacking (Up to 5,000+ Photos):** Multi-folder selection with live thumbnails, 8-level recursive directory scanning, and real-time scanning feedback for local disks and mapped network drives.
  * **Plex Media Server:** 1-scan QR code 4-digit PIN authentication to discover and stream private libraries from Synology/TrueNAS/QNAP servers.
  * **Curated Photography:** Instant scenic presets with browser `CacheStorage` resilience for offline playback.
* **📅 Multi-Calendar Feeds:** Unified chronological agenda & monthly grid parsing multiple `webcal://` and `.ics` feeds with per-calendar color tags via Cloudflare edge workers.
* **🔒 Kiosk Security & Hardware Polish:**
  * Screen Wake Lock API & Fullscreen Mode.
  * Scheduled Night Mode with low-glow, pixel-shifting OLED clock to prevent screen burn-in.
  * Kid-Proof PIN lock. A forgotten PIN is removed with a code emailed to the signed-in account.
  * Isolated Canvas Display Density scaler (`75%` to `150%`) for 1080p, 1440p, and 4K displays.

---

## 🛠️ Tech Stack

* **Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
* **PWA Engine:** `vite-plugin-pwa` (Workbox)
* **Styling & Animation:** [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/)
* **Local-First State:** [Dexie.js](https://dexie.org/) (IndexedDB) + [Zustand](https://github.com/pmndrs/zustand)
* **Media & Document Processing:** `libheif-js` (client-side iOS HEIC/HEIF decoding), `@mozilla/readability` + `linkedom` (article extraction), `ical.js` (RFC 5545 calendar recurrence & timezone parsing)
* **Edge Proxy Functions:** Cloudflare Pages Functions (`/api/ical`, `/api/rss`, `/api/reader`, `/api/web-proxy`, `/api/metadata`, `/api/gphotos`, `/api/gdrive`) for CORS-free feeds, reader extraction, and media resolvers.
* **Cloud Sync (Optional SaaS):** Supabase Auth & Realtime Postgres.

---

## 🚀 Getting Started

### Prerequisites
* Node.js `20.x` or higher
* npm `10.x` or higher

### Local Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/Genghis1227/ambiently.git
cd ambiently

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

Visit `http://localhost:5173` to view Ambiently in your browser.

---

## 💾 Local File PC Auto-Sync & Backup Architecture

Ambiently is built on an **offline-first local architecture**:

1. **Primary Browser Database (IndexedDB):** All widgets, canvases, sticky notes, checklists, and configuration are always saved instantly to IndexedDB (`AmbientlyDB`). The app never requires an internet connection or an external file to run and will never lose data across tab closures.
2. **Real-Time PC Auto-Sync (Chromium):** In Settings or the Backup modal, click **PC Auto-Sync** to bind an `ambiently-data.json` file directly on your local computer's drive using the File System Access API.
   * **Reactive Event-Driven Snapshots:** Whenever you move widgets, check off to-do items, or edit canvases, Ambiently automatically streams snapshots to disk (with debounced safe-write queues preventing write lock collisions).
   * **Session Persistence & 1-Click Reconnect:** Ambiently stores the file handle securely inside IndexedDB. When reopening or reloading the app, Ambiently attempts silent permission verification (`queryPermission()`), or displays a 1-click **Reconnect Auto-Sync** button so you never have to re-browse your folder tree.
   * **Cloud Sync via Local Folders:** If you place `ambiently-data.json` inside a local **Dropbox, Google Drive, OneDrive, Nextcloud, or Synology Drive** folder, desktop sync clients will automatically detect updates and replicate your dashboard state across all your devices without routing data through third-party servers.
3. **Universal 1-Click Export & Restore:** For non-Chromium browsers (Safari, Firefox, iOS, Android), 1-click **Download .json** and **Upload & Restore** provide complete standalone backup files that can be imported onto any device in seconds.

---

## ☁️ Cloud Sync Setup (Optional)

To enable multi-device sync across phones and displays:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the SQL schema located in [`supabase/schema.sql`](supabase/schema.sql) and the Phase 1 Household Profiles, Chores & Meal Planner migration in [`supabase/migrations/phase1_profiles_chores_meals.sql`](supabase/migrations/phase1_profiles_chores_meals.sql) in the SQL Editor, then run [`supabase/security-check.sql`](supabase/security-check.sql). It changes nothing, and any row it returns is a problem to fix.
   * In **Authentication**, keep **Confirm email** and **Secure email change** on, and keep anonymous sign-ins off. Household access relies on confirmed emails.
   * Never put the `service_role` key in the app. It skips every access rule.
   * Each board can hold up to 100 MB and 50 members and invitations, so one account can't fill the database for everyone. To change these, edit `board_limit_bytes` and `board_limit_members` in the schema. If only your household uses this project, you can also turn off **Allow new users to sign up** in Authentication and add household accounts yourself from the **Users** page.
3. Configure the environment variables in Cloudflare Pages (**Settings -> Environment variables**):
   * `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   * `VITE_SUPABASE_ANON_KEY` = `your-supabase-publishable-or-anon-key`
4. In Ambiently Settings, sign in via Magic Link and click **Back Up to Cloud**.

---

## 📄 License & Self-Hosting Attribution (AGPLv3)

This project is licensed under the terms of the **GNU Affero General Public License v3.0 (AGPLv3)**. See the [LICENSE](LICENSE) file for full details.

### Self-Hosting & Attribution Policy
Ambiently keeps the live ambient display canvas 100% free of watermarks to prevent OLED burn-in and visual clutter. Instead, attribution and source links live unobtrusively inside the **Ambiently Quick Hub popover** (top-left logo menu) and the **Settings & Changelog modal footers** (`Powered by Ambiently • trinhism.com • Source (AGPLv3)`).

In accordance with **AGPLv3 Sections 7(b) and 13** (Remote Network Interaction & Preservation of Legal/Author Notices):
* If you self-host, fork, or deploy a modified version of Ambiently over a network, you **must preserve** the interactive attribution notices and source code links in the Quick Hub menu and Settings/Changelog modal footers.
* Any modified network deployment must also make its complete corresponding source code available under the AGPLv3.
