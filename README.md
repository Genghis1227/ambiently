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
  * **Unlimited Custom Canvases & Default Home Board:** Create as many dedicated boards as you want (e.g., *Family Board*, *Photo Gallery*, *Morning Briefing*) with 16 custom icons, 1-click tab reordering (`▲`/`▼`), and selectable default Home Board indicator.
  * **Interactive Freeform Pinboard:** Drag, tilt (`↺`/`↻`), layer (`z-index`), resize via bottom-right corner handles (`↘`), or toggle any widget to **100% Fullscreen Canvas** with one click.
  * **Smart Pinned Notes:** Pop floating notes onto the canvas from the Notes Tile with automatic collision avoidance, open-space positioning, and 1-click header close buttons (`✕`).
* **📱 Mobile Companion Remote & Vertical Tile Stream:**
  * **Full Canvas Live Stream:** Seamless single-column vertical feed rendering live preview cards for all widgets (Clock, Weather, Countdown, Photos, RSS, Quotes, Media, Notes).
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
* **📅 Multi-Calendar Feeds:** Unified chronological agenda & monthly grid parsing multiple `webcal://` and `.ics` feeds with per-calendar color tags via Cloudflare edge workers. Each link is checked when it's added, and a calendar that can't be read says so on the tile.
* **✅ Chores & Rewards (free):** Daily, weekly, some-days and one-time chores for each family member. Kids tap to tick them off and earn stars, and spending stars on a reward asks for the board PIN. Chores reset on their own, with nothing to do at midnight.
* **🍽️ Meal Plan (free):** Plan the week's breakfasts, lunches or dinners, reuse past meals, and send their ingredients to a shopping-list checklist that everyone can tick off from their phone.
* **🕐 12/24-hour clock and Monday weeks:** One setting for every clock, calendar, meal plan and weekly chore.
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
* **Edge Proxy Functions:** Cloudflare Pages Functions (`/api/ical`, `/api/rss`, `/api/gphotos`, `/api/gdrive`) for CORS-free feeds and media resolvers.
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

## 🏠 Self-Hosting (Docker or Node)

Ambiently also runs without Cloudflare: on a home server, a NAS, or any machine with Docker or Node (the image is built for x86-64 and 64-bit ARM, such as a Raspberry Pi 4 or 5 with a 64-bit OS). A small Node server (`server/index.ts`) serves the app and the same calendar, RSS and photo-album services, with the same security headers.

**Docker** (run in the folder you cloned):

```bash
docker compose up -d
```

Then open `http://<that machine>:8080`. To use cloud sync, pass your Supabase project when building (the publishable key is public by design; never use the `service_role` key):

```bash
docker build --build-arg VITE_SUPABASE_URL=https://xyz.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=your-publishable-key -t ambiently .
```

**Without Docker** (Node 20 or newer):

```bash
npm ci && npm run build && npm run build:server && npm start
```

`PORT` and `HOST` change where it listens (default `0.0.0.0:8080`).

**Use HTTPS for the screens.** Browsers only allow the PIN lock, keep-awake (Wake Lock), installing the app and offline mode on `https://` pages or `localhost`. Over plain `http://192.168.x.x` the board shows, but those four are switched off. Put the server behind a reverse proxy with a certificate (Caddy, Nginx Proxy Manager, Traefik), or use Tailscale Serve or a Cloudflare Tunnel.

Plain static hosting (copying `dist/` to any web server) also works, except calendars, RSS and Google Photos albums, which need the services. The calendar tile says so when they're missing.

---

## ☁️ Cloud Sync Setup (Optional)

To enable multi-device sync across phones and displays:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the SQL schema located in [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor, then run [`supabase/security-check.sql`](supabase/security-check.sql). It changes nothing, and any row it returns is a problem to fix.
   * In **Authentication**, keep **Confirm email** and **Secure email change** on, and keep anonymous sign-ins off. Household access relies on confirmed emails.
   * Never put the `service_role` key in the app. It skips every access rule.
   * Each board can hold up to 100 MB and 50 members and invitations, so one account can't fill the database for everyone. To change these, edit `board_limit_bytes` and `board_limit_members` in the schema. If only your household uses this project, you can also turn off **Allow new users to sign up** in Authentication and add household accounts yourself from the **Users** page.
3. Configure the environment variables in Cloudflare Pages (**Settings -> Environment variables**):
   * `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   * `VITE_SUPABASE_ANON_KEY` = `your-supabase-publishable-or-anon-key`
4. In Ambiently Settings, sign in via Magic Link and click **Back Up to Cloud**.

---

## 📄 License

This project is licensed under the terms of the **GNU Affero General Public License v3.0 (AGPLv3)**. See the [LICENSE](LICENSE) file for full details.
