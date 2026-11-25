# Ambiently (`dashboard.trinhism.com`)

> Modern, ambient smart-display and command center Progressive Web App (PWA) under the Trinhism ecosystem, designed as a self-hosted, local-first alternative to commercial display services (Mango Display, DAKboard, Skylight).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/package-json/v/Genghis1227/ambiently?label=Release&color=cyan)](CHANGELOG.md)
[![CI](https://github.com/Genghis1227/ambiently/actions/workflows/ci.yml/badge.svg)](https://github.com/Genghis1227/ambiently/actions/workflows/ci.yml)
[![Docker GHCR](https://img.shields.io/badge/GHCR-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white)](https://github.com/Genghis1227/ambiently/pkgs/container/ambiently)

![Ambiently Banner](public/og-banner.png)

---

## 📚 Project Documentation

* **[Features & Capabilities Reference (FEATURES.md)](FEATURES.md)** — Comprehensive breakdown of widgets, multi-canvas corkboard architecture, chores, meal planning, photo frames, and mobile companion.
* **[Docker & Raspberry Pi Installation Guide (RASPBERRY_PI.md)](RASPBERRY_PI.md)** — Complete step-by-step installation manual for Docker Compose (`amd64`/`arm64`), Synology/Unraid/Portainer, and Raspberry Pi OS (Wayland / X11) fullscreen wall kiosks.
* **[System Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)** — Local-first persistence engine, Cloudflare edge workers, standalone Docker runtime, resolution scaling, and Supabase cloud sync.
* **[Changelog (CHANGELOG.md)](CHANGELOG.md)** — Semantic version history and release notes.
* **[Developer Workflow (DEVELOPER_WORKFLOW.md)](DEVELOPER_WORKFLOW.md)** — Standard Trinhism contributor protocols and git branch sequence.

---

## ⚖️ How Ambiently Compares

| Capability | Ambiently (`v0.8.9`) | Skylight Calendar (+ Plus) | Hearth Display | DAKboard | Mango Display | Home Assistant |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Pricing & Open Source** | **$0 / Open-source (AGPLv3)** | ~$299–$599 hw + ~$79/yr Plus | ~$699 hw + ~$86/yr plan | $0 basic / ~$5–$8+/mo | $0 basic / ~$5.99/mo Pro | $0 self-hosted (+ optional Nabu Casa) |
| **Hardware & Hosting** | Any browser, tablet, Pi kiosk, or Docker (`amd64`/`arm64`) | Proprietary wall touchscreen only | Proprietary 27" touchscreen only | BYO screen or DAKboard hardware | BYO TV, tablet, Fire Stick, or Echo Show | Self-hosted server + any tablet/browser |
| **Offline-First & Local Privacy** | **0ms IndexedDB boot**, device-local `db.vault` secrets & local file/JSON sync | Cloud-dependent | Cloud-dependent | Cloud-rendered screens | Cloud-rendered screens | Local LAN execution |
| **Layout & Wall UX** | Freeform multi-canvas corkboard (`360°` tilt, Bento/Pack/Split auto-layout, swipe, `Ctrl+Z` undo, Sticker Mode) | Fixed tabbed calendar UI | Fixed routine/calendar UI | Modular block editor (paid custom layouts) | Grid/widget layout builder | Lovelace dashboards (steep YAML/UI setup) |
| **Calendars** | Multi-source `.ics` / `webcal://`, 1-tap source & family member filters, synced local Family Events, Planned Meals & Agenda/3-Day/Week/Month/Timeline | 2-way Google, Apple, Outlook & Cozi sync | 2-way Google & Apple sync | Read-only multi-calendar feeds | 2-way calendar sync (Pro) | Local + 2-way calendar integrations |
| **Chores, Routines & Rewards** | Append-only ledger, point splits, skip/vacation/overdue rules, Wishlist URL scraper, PIN lock & Trophy Case | Chore charts & star rewards (Plus) | Visual child routines & helpers | Basic via 3rd-party task lists | Basic chore/to-do widgets | Community cards / DIY helpers |
| **Meal Planning & Kitchen** | Meal planner, Schema.org recipe scraper, distraction-free Cooking Mode (+ step timers), aisle Grocery Aggregator | Meal planner & grocery list (Plus) | Meal planner & shared lists | 3rd-party workarounds only | Notes/lists only | Community add-ons only |
| **Kanban, Notes & Home Utilities** | Multi-board Kanban, aisle Shopping List, Chalkboard, Offline Soundscapes, Kitchen Multi-Timer, Guest Wi-Fi QR, Decision Wheel | Lists & to-dos only | Shared to-dos & routines | External lists / custom iframe blocks | Stickers, notes & basic lists | Custom cards & helpers |
| **Photo Frames** | 7,500+ Google Photos, Google Drive, Local/NAS folders, Plex QR pairing, 128 curated photos; Ken Burns, Collage, Polaroids & Filmstrip | Cloud photo screensaver (Plus) | Limited photo features | Cloud photo slideshows (Google/Apple/Dropbox) | Cloud photo backgrounds & widgets | Media / gallery integrations |
| **Weather, Feeds & Finance** | Zero-key Weather (12h hourly precip + NOAA/NWS alerts), US EPA AQI/Pollen/UV, offline NOAA Sun/Moon, Markets, Live Sports, Daily Discovery & 26 RSS + Reader Mode | Daily & 10-day forecast icons | Basic weather | Weather, radar, news/RSS, stocks & commute blocks | Weather, news, stocks & commute widgets | Broad weather & sensor integrations |
| **Smart Home & AI Imports** | Home Lab latency probes, opt-in Home Assistant controls (Parent PIN gated for locks/doors/alarms), LAN camera snapshots & **Now Playing Media** (Plex / HA `media_player`) | AI Magic Import for emails/flyers (Plus); no smart home | Hearth Helper AI parser; no smart home | Smart home / iframe blocks (varies by plan) | Health/smart-home widgets; no AI flyer import | Bidirectional device & camera control (no built-in family suite) |
| **Portrait Layout & Scheduling** | **True Portrait (`9:16`) Wall Display** + **Time-of-Day Canvas Scheduling**, **Per-Room Display Filtering**, and **Idle Photo / Canvas Screensaver** | Native portrait & idle screensaver | Native idle screensaver | Native portrait & idle screensaver | Native portrait & idle screensaver | Via plugins / custom dashboards |

<sub>*Competitor pricing and feature availability reflect publicly advertised consumer tiers and hardware bundles and can change over time.*</sub>

---

## 🌟 Highlights

* **⚡ 0ms Offline-First Boot:** Runs entirely out of client-side browser storage (IndexedDB via Dexie.js). Never shows a blank screen if home Wi-Fi drops.
* **🐳 1-Command Docker & 🍓 Raspberry Pi Edition:** Self-host the entire PWA and all 8 feed/scraper/market APIs in a ~55 MB multi-arch (`amd64` + `arm64`) container (`docker compose up -d`), or turn a Raspberry Pi 4/5 into an auto-booting wall display via [`scripts/pi-kiosk-setup.sh`](scripts/pi-kiosk-setup.sh).
* **💾 Local File Auto-Sync & JSON Snapshots:** Direct integration with the browser File System Access API to auto-save and mirror state directly to a local `ambiently-data.json` file, plus 1-click JSON export/restore.
* **📌 Pure Freeform Corkboard Multi-Canvas Engine:**
  * **Custom Canvases, Starter Blueprints, Portrait (`9:16`) Layout & Default Home Board:** Create up to 10 dedicated boards using **Blank Canvas** or orientation-aware 1-tap starter blueprints (**Family Command**, **Kitchen & Meals**, **Ambient Photo Gallery**) that automatically inherit your household Weather location and Calendar `.ics` feeds, adapt to vertical portrait wall displays (`1080×1920` / Raspberry Pi `--rotate 90|270`) with vertical Auto-Organize modes and vertically stacked Chore Hub / Kanban / Calendar / Meal layouts, plus 29 Lucide icons, 1-click tab reordering (`▲`/`▼`), and selectable default Home Board indicator.
  * **Categorized Widget Picker & In-Place Mode Switching:** Browse widgets across 4 categories with instant search, `On board` placement counts, consolidated **Clock & Time** and **Text & Quotes** cards, and 1-click mode switching inside **Tile Settings**.
  * **Compact Toolbar Horizontal Pop-Out Panels, Canvas Swipe & Layout Undo:** Keep all canvas buttons accessible even on smaller screens with horizontal pop-out bars for the **`+` Add Menu** (*New Note*, *Add Widget*, *New Canvas*, plus soft-deleted **Widget Trash Recovery**), **Auto-Organize** (*Smart Bento Grid*, *Keep Sizes & Pack*, *Split Zones*), and **Quick Utilities** (*Night Mode*, *Fullscreen*, *Refresh/Update*, *Hide Toolbar*, *Quick Start Tour*); swipe horizontally across any widget, edge zone, empty canvas space, Mobile Companion, or trackpad to switch canvases; hold cards (`~230ms`) before dragging to prevent accidental moves; and undo accidental moves, resizes, rotations, or auto-organize layouts with **`Ctrl+Z` / `Cmd+Z`** or the 1-tap Undo toast.
  * **Interactive Freeform Pinboard:** Drag, tilt (`↺`/`↻`), layer (`z-index`), resize via bottom-right corner handles (`↘`), right-click blank canvas space to **Add Single Photo / GIF**, **New Sticky Note**, or **Add Widget Tile**, toggle frameless **Sticker / No Outline Mode** (per-widget or via the global **Default Widget Style** in Settings across compatible ambient, media, and text tiles), or expand any widget to **100% Fullscreen Canvas** with one click.
  * **Smart Pinned Notes (3 Formats):** Create **Text Notes**, **Checklists**, or dedicated **🛒 Shopping List** sticky notes (with automatic store-aisle grouping, inline `+ Add grocery item...`, and 1-tap `Clear (X)`), and pop floating notes onto the canvas with automatic collision avoidance.
* **🍽️ Family Meal Planner, Recipe Scraper, Smart Grocery List & Cooking Mode:**
  * **Flexible Calendar Scopes & Month Selector:** Switch between **Today**, **Tomorrow**, **3-Day**, or **Full Week (7-Day)** views across Breakfast, Lunch, and Dinner slots, jump to any date via the interactive **Month Calendar Popover**, overlay scheduled meals directly onto **Family Calendar** tiles (**Show Planned Family Meals**), assign cooks in 1 tap from the **Household Profile Strip**, and keep storage lean with automatic 21-day history pruning.
  * **Quick-Meal Autocomplete & Recipe URL Scraper (`/api/metadata`):** Schedule meals in one tap using dynamic autocomplete chips from your recent history, or paste any recipe URL to automatically extract Schema.org `Recipe` JSON-LD ingredients, directions, prep/cook times, and hero photos.
  * **Distraction-Free Cooking Mode:** Tap any linked recipe to launch a high-contrast, step-by-step kitchen modal with interactive ingredient checkboxes, progress tracking, automatic **Screen Wake Lock**, 1-tap `Start <duration> Timer` step chips parsed from recipe instructions, and live header kitchen timer controls synced directly with your **Kitchen Timer** widget.
  * **Smart Grocery Aggregator & Sticky Note Sync:** Automatically deduplicates and combines ingredient quantities across your active date window, sorts items by grocery store aisle, exports to **Google Keep**, or pushes directly into a **`🛒 Shopping List` Sticky Note** on your canvas.
* **🏆 Family Chore & Reward Engine + Global Household Profiles:**
  * **Global Household Profiles & HEIC/WebP Avatars:** Manage `Parent` and `Kid` profiles with client-side iOS 17/18 `.HEIC`/`.HEIF` photo decoding (`libheif-js`), an interactive circular zoom/pan/rotate cropper (`256×256` WebP), or custom keyboard emojis.
  * **Dual-View Kiosk Experience:** Add the compact Bento **Chores & Rewards** tile to any canvas and click its header **Maximize** button (saves persistent *Full-Screen Hub on Canvas* when unlocked, or opens a temporary overlay when Canvas Lock is active or on Mobile Companion) or toggle **Tile Settings** to launch the 3-column **Full-Screen Chore & Reward Hub**.
  * **Flexible Cadences, Parent Auto-Completion & Shared Splits:** Schedule chores as *Daily*, *Weekdays*, *Weekends*, *Weekly — Any Day (1× / Week)*, *Weekly (Specific Days)*, *Interval (Every N Days)*, or *One-Off Bounty*. Assign to individual members or as a *Shared Pool* task with interactive integer point splitting (with parent completions automatically skipping the approval queue).
  * **Same-Day Chore Skip, 24-Hour Overdue Grace Window & Vacation Mode:** Skip same-day chores that don't apply (such as Homework) cleanly with a **Skipped • 0 pts** badge and same-day **Undo** without touching the ledger; unfinished chores roll over for 24 hours with configurable `100%`, `50%`, `0%`, or custom % overdue point policies and pause automatically during **Vacation Mode**.
  * **Append-Only Audit Ledger, Wishlist Store & Trophy Case:** Every point transaction is recorded in an immutable audit ledger. Kids can propose wishlist rewards (with automatic URL title/image/price scraping via `/api/metadata`), edit or remove unpriced submissions in the **Proposals Tray**, reserve points automatically as pending deductions when claiming rewards (preventing over-claiming past available points, with self-service **Cancel Claim** before Parent PIN approval), while parents price/approve redemptions behind a 4-digit PIN and archive fulfilled prizes into each child's **Trophy Case**.
* **🗂️ Zero-Friction Multi-Board Project Board (Kanban):**
  * **Independent Multi-Board Bento Tiles:** Pin multiple **Project Board (Kanban)** tiles across tabs, each tracking its own selected board (`To Do`, `In Progress`, `Done`), inline `+ Add card` entry, Calm Science palette tags, multi-member `<ProfileAvatar/>` assignees, and sub-checklists with zero PIN gates.
  * **Responsive Kiosk Tile + Full 3-Column View:** Compact tiles default to `To Do` with `←`/`→` column steppers, 1-tap card chevrons, and unified mouse/touch drag reordering with ~350ms **Drag-to-Edge** column flipping; widening a tile automatically adapts it into a side-by-side **3-column swimlane layout** on the canvas, plus a 1-tap fullscreen 3-column view.
  * **Done Auto-Archive & Reusable Archive Drawer:** Configurable per-board `autoArchiveDays` sweeps, **Archive All Done**, confirmation-gated **Clear Done**, and a searchable per-board **Archive Drawer** that restores cards with checklists intact.
* **📰 In-App Kiosk Reader Mode, Web Preview & 26 Curated RSS Feeds:**
  * **Distraction-Free Article Reader (`/api/reader`):** Powered by Mozilla Readability and Linkedom with client-side `DOMPurify` HTML sanitization, paired with an anonymous CSP-sandboxed edge **Web Preview (`/api/web-proxy`)** fallback, kiosk-safe **Open in Browser** / **Open on Phone (QR)** / **Copy Link** handoff (`externalBrowserLinksPolicy`), and a 26-feed curated directory across 6 categories.
* **📈 Live Markets & Watchlist (`/api/finance`):**
  * Track stocks, ETFs, market indices, and crypto with zero API keys required—featuring `1D` / `5D` / `1M` SVG sparklines, adaptive row/grid/ticker-strip layouts, preset bundles, live symbol search, offline quote caching, and Sticker Mode support.
* **🏆 Live Sports Scoreboard (`/api/sports`) & 💡 Daily Discovery (`/api/discovery`):**
  * **Live Sports Scoreboard:** Zero-key live scores, game clocks, TV broadcast tags, favorite team following, and upcoming schedules across **NFL, NBA, MLB, NHL, MLS, Premier League, and NCAA** with adaptive Single Card, Grid, and Ticker Strip layouts and Night Mode polling suspension.
  * **Daily Discovery & Trivia:** Touch-friendly tap-to-reveal trivia & riddles, daily Word of the Day cards, and Wikimedia **"On This Day"** history milestones backed by a built-in curated offline fallback pack.
* **⏲️ Kitchen Multi-Timer:**
  * Run and edit up to 6 concurrent wall-clock-accurate kitchen countdowns with quick presets, inline `h`/`m`/`s` duration & label editing, `-1m` / `+1m` / `Reset` controls, a loud repeating Web Audio alarm that monitors all carousel tabs, pauses rotation & switches cleanly with a prominent **Dismiss** overlay until silenced, Sticker Mode support, and 1-tap recipe step timer chips inside **Cooking Mode**.
* **🌤️ Air Quality, Pollen, UV & Offline Sun/Moon Ephemeris:**
  * Zero-API-key US EPA AQI, Tree/Grass/Weed pollen (with `PM2.5`/`PM10`/`O₃` fallback), and daytime UV strips via Open-Meteo paired with a 100% offline NOAA Sun Arc, Golden Hour, daylight delta, and SVG Moon Phase widget—both inheriting your household location automatically.
* **🏡 Tactile Household Utilities:**
  * **Check-In & Home Rhythms** (`daily`, `am_pm`, `weekly` single/multi-weekday, `alternating_week`, and `every_n_days` household trackers with 1-tap `ProfileAvatar` stamps backed by the household-wide `useRoutinesStore` database so deleting or replacing a tile preserves routines), **Guest Wi-Fi QR & House-Sitter Card** (scannable `qrcode.react` QR code, masked auto-rehide password stored strictly in local `db.vault` with zero cloud sync, plus synced House-Sitter emergency contacts/notes), and **Family Decision Wheel & Quick Poll** (interactive SVG spinner, live household polls with tie-breaker spins, and 1-click recipe/profile imports).
* **🎨 Family Chalkboard & Offline Ambient Soundscape Mixer:**
  * **Family Chalkboard / Doodle Pad:** Touch- and stylus-smoothed chalk/marker sketchpad with undo, surface themes (*Slate Chalkboard*, *Warm Cork*, *Whiteboard*), transparent **Sticker Mode**, and lightweight normalized RDP vector stroke sync between **Mobile Companion** and the wall display.
  * **Offline Ambient Soundscape Mixer:** 100% offline procedural Web Audio synthesizer blending **Rain**, **Fireplace Crackle**, **Brown Noise**, **Ocean Waves**, and **Forest Wind** with 1-tap scene presets, Sleep Timer, and automatic **Scheduled Night Mode** fade-out.
* **🖥️ Self-Hosted Home Lab Uptime, Interactive Home Assistant, LAN Cameras & Now Playing (`/api/homelab`):**
  * **Service Latency, Controls & Camera Snapshots:** Track self-hosted LAN/cloud services (*Plex*, *NAS*, *Pi-hole*, *Immich*, *Uptime Kuma*, *Proxmox*, *Jellyfin*), control allowlisted Home Assistant lights, switches, fans, scenes, locks, garage covers, and alarm panels (with automatic **Parent PIN** protection on sensitive domains and shared origin-bound device-local `db.vault` tokens), and view LAN-gated camera snapshot tiles (`AMBIENTLY_ALLOW_PRIVATE_FEEDS=true`).
  * **Now Playing Media Widget (`NowPlayingWidget`):** Display live track/show artwork, playback state, progress bars, and Home Assistant `media_player` controls or live **Plex Active Sessions** without paid streaming OAuth APIs.
  * **Per-Room Filtering & Time-of-Day Scheduling:** Filter visible canvases and set a per-screen Home canvas cleanly in device-local storage while sharing one household account, or schedule morning/dinner/evening canvases automatically with tap-to-snooze overrides.
* **📱 Mobile Companion Remote & Vertical Tile Stream:**
  * **Full Canvas Live Stream:** Seamless single-column vertical feed rendering live preview cards for all 29 widgets (Clock, Weather, Air Quality, Sun & Moon, Countdown, Kitchen Timer, Check-In & Home Rhythms, Guest Wi-Fi & House-Sitter, Decision Wheel & Poll, Photos, Now Playing Media, RSS, Markets & Watchlist, Live Sports Scoreboard, Daily Discovery, Family Chalkboard, Ambient Soundscape Mixer, Home Lab & Home Assistant, Quotes, Media, Notes, Chores, Meal Planner, Project Board (Kanban)) with independent mobile reordering (`▲` / `▼`) and `100dvh` momentum touch scrolling.
* **🖼️ Multi-Source Ambient Photo Frame, Hardware-Accelerated GIFs & Power Saving:**
  * Stream slideshows in *Ken Burns*, *Mosaic Collage*, *Scattered Polaroids*, or *Filmstrip* styles from **Google Photos Shared Albums** (tested with 7,500+ photos), **Google Drive Shared Folders**, **Local / NAS Folders**, **Plex Media Server** (QR PIN auth), or **Curated Scenic Presets**, either linked to the **Shared Board Library** or isolated per tile (**This Tile Only**) across restores and Plex pairing, with automatic background library rescans (*Daily 24h* default, *Weekly 7d*, or *Manual Only*) and 15-minute cooldown-protected **Rescan Now**.
  * Pin dense boards of GIPHY GIFs and transparent stickers smoothly: opaque GIFs play as GPU-decoded MP4 loops, transparent stickers use animated WebP with zero per-frame shadow thrashing, CDN assets are locally cached up to bounded quotas, and animations/photo timers automatically suspend during Night Mode or hidden browser tabs.
* **📅 Multi-Calendar Feeds, Filters, Local Family Events & Meals Overlay:** Unified agenda, 3-day, weekly, and monthly views combining multiple `webcal://` and `.ics` feeds, **synced local Family Events** tagged to household profiles, 1-tap header **source & family member filter chips**, an optional **Show Planned Family Meals** overlay, per-calendar color tags, smart rate-limit protection, and a built-in US Holidays fallback.
* **🌦️ Hourly Forecast & Severe Weather Alerts:** Zero-key Open-Meteo `5-Day | Hourly` strip (`12h` temperature + precipitation probabilities) and automatic US **NOAA/NWS Severe Weather Alerts** (`api.weather.gov`) with expandable safety detail modals inside **Weather** and **Clock & Weather** tiles.
* **🔒 Kiosk Security & Hardware Polish:**
  * Screen Wake Lock API, Fullscreen Mode, **Idle Photo Screensaver Mode** (`5m`–`30m` inactivity timer with live **Preview**, selectable **Photo Slideshow** styles—*Single Photo Ken Burns*, *4-Photo Mosaic Collage*, *Scattered Polaroids*, and *Cinematic Filmstrip*—or **Use a Canvas** edge-to-edge board mode, plus burn-in-safe floating Clock & Weather overlay yielding automatically to Night Mode and alarms), **Reduce Blur & GPU Effects** low-power mode (`reduceVisualEffects`) for smooth 60fps rendering on Raspberry Pi and 4K displays, idle-cursor tooltip/edit-chrome auto-hiding, Scheduled Night Mode with pixel-shifting OLED clock, Kid-Proof 4-digit PIN lock with salted PBKDF2 hashing, exponential failed-attempt lockout, and double-entry confirmation on setup/change (plus email recovery when signed in), and Display Density scaling (`75%` to `150%`).

---

## 🛠️ Tech Stack

* **Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
* **PWA Engine:** `vite-plugin-pwa` (Workbox)
* **Styling & Animation:** [Tailwind CSS v4](https://tailwindcss.com/), GPU-composited CSS Animations, [Lucide React](https://lucide.dev/)
* **Local-First State:** [Dexie.js](https://dexie.org/) (IndexedDB) + [Zustand](https://github.com/pmndrs/zustand)
* **Media & Document Processing:** `libheif-js` (client-side iOS HEIC/HEIF decoding), `@mozilla/readability` + `linkedom` (article extraction), `ical.js` (RFC 5545 calendar recurrence & timezone parsing)
* **Serverless & Self-Hosted API Runtime:** Cloudflare Pages Functions (`/api/ical`, `/api/rss`, `/api/finance`, `/api/sports`, `/api/discovery`, `/api/homelab`, `/api/reader`, `/api/web-proxy`, `/api/metadata`, `/api/gphotos`, `/api/gdrive`) + standalone Node 22 HTTP server (`server/index.ts`) packaged as a multi-arch (`linux/amd64`, `linux/arm64`) Alpine Docker image.
* **Cloud Sync (Optional):** Supabase Auth & Realtime Postgres.

---

## 🚀 Installation & Getting Started

Choose whichever deployment option fits your setup:

### Option 1: Hosted Web App / Installable PWA (Zero Setup)
Open **[https://dashboard.trinhism.com](https://dashboard.trinhism.com)** on any tablet, iPad, smart display, or desktop browser and select **Install App / Add to Home Screen** for fullscreen offline-capable kiosk mode.

---

### Option 2: Docker & Docker Compose Self-Hosting (`amd64` & `arm64`)

Run the complete PWA and all 8 `/api/*` feed/scraper/market proxies locally on **Synology NAS, Unraid, TrueNAS, Portainer, Proxmox, Raspberry Pi, Linux, macOS, or Windows** using the pre-built multi-arch image (`ghcr.io/genghis1227/ambiently:latest`) or building from source:

```bash
# Quick 1-liner (pre-built linux/amd64 & linux/arm64 image from GHCR — no git clone needed)
docker run -d --name ambiently --restart unless-stopped -p 8080:8080 ghcr.io/genghis1227/ambiently:latest
```

**Or with Docker Compose (`.env` customizable):**
```bash
# 1. Clone the repository
git clone https://github.com/Genghis1227/ambiently.git
cd ambiently

# 2. (Optional) Configure port, timezone, Supabase sync, or private LAN feeds
cp .env.example .env

# 3. Pull & start the pre-built image (or pass --build to compile locally)
docker compose up -d

# 4. Verify healthcheck
curl http://localhost:8080/api/health
```

Open **`http://localhost:8080`** (or `http://<your-server-ip>:8080`).

* **Zero-Rebuild Configuration:** Set `SUPABASE_URL` & `SUPABASE_ANON_KEY` (for multi-device Realtime sync), `AMBIENTLY_ALLOW_PRIVATE_FEEDS=true` (for local `192.168.x.x` / `.local` Nextcloud, Radicale, or Home Assistant `.ics`/RSS/Home Lab requests), `AMBIENTLY_TRUST_PROXY=true` (behind trusted reverse proxies), or optional `AMBIENTLY_API_KEY` directly in `.env` or `compose.yaml`—no image rebuild needed. The self-hosted container runs read-only (`cap_drop: ALL`), sends the same security headers as Cloudflare (`public/_headers`, with proxy-gated HTTPS HSTS and `no-referrer`), enforces socket-anchored per-IP API rate limiting and bounded HTTP timeouts, and checks the address every outgoing request really goes to, so a public name that points at your own network is refused too.
* See **[RASPBERRY_PI.md — Part 2: Docker & Home Server Self-Hosting](RASPBERRY_PI.md#part-2-docker--home-server-self-hosting)** for Portainer/Synology stack templates and HTTPS reverse proxy examples.

---

### Option 3: Raspberry Pi Kiosk & All-in-One Wall Display

Turn a **Raspberry Pi 5** or **Raspberry Pi 4** running **Raspberry Pi OS (64-bit with Desktop)** into a dedicated wall-mounted family command center:

1. Flash **Raspberry Pi OS (64-bit) with Desktop** using [Raspberry Pi Imager](https://www.raspberrypi.com/software/) (enable Wi-Fi, SSH, and Desktop Auto-Login).
2. Run the automated setup script on the Pi (as your normal desktop user, not `root`):

```bash
git clone https://github.com/Genghis1227/ambiently.git ~/ambiently
cd ~/ambiently

# Interactive setup wizard (choose Kiosk Display Only OR All-in-One Local Docker Server + Kiosk)
bash scripts/pi-kiosk-setup.sh
```

**Non-Interactive CLI Shortcuts:**
```bash
# Mode A: All-in-One Standalone Pi (installs Docker ARM64, runs server on port 8080 + opens HDMI Kiosk)
bash scripts/pi-kiosk-setup.sh --mode standalone --port 8080

# Mode B: Kiosk Display Only (connects to hosted cloud or your home NAS Docker server)
bash scripts/pi-kiosk-setup.sh --mode kiosk --url https://dashboard.trinhism.com

# Portrait wall monitor (rotate 90, 180, or 270 degrees)
bash scripts/pi-kiosk-setup.sh --mode standalone --rotate 90
```

Reboot (`sudo reboot`) to launch directly into fullscreen Chromium Kiosk (supports Wayland `labwc`/`wayfire` and X11, disables OS blanking for OLED Night Mode, suppresses power-cut crash popups, and locks touchscreen pinch-zoom). Full guide in **[RASPBERRY_PI.md](RASPBERRY_PI.md)**.

---

### Option 4: Local Node.js Development & Production Server

**Prerequisites:** Node.js `22.x+` and npm `10.x+`.

```bash
# 1. Clone and install dependencies
git clone https://github.com/Genghis1227/ambiently.git
cd ambiently
npm install

# 2. Start Vite development server (with live /api/* function middleware) on http://localhost:5173
npm run dev

# 3. Or build and run the standalone production server on http://localhost:8080
npm run build
npm run build:server
npm start
```

### Contributing & Pre-PR Verification

Before opening a Pull Request, follow [`DEVELOPER_WORKFLOW.md`](DEVELOPER_WORKFLOW.md) and confirm all four checks pass locally from a feature branch (never commit directly to `main` or modify `package.json` version / `CHANGELOG.md` without `@Genghis1227` approval):

```bash
npm run lint
npm run build
npm run build:server
npm test
```

* `npm test` automatically runs **`tests/validate-guardrails.js --self-test`** (checking for leaked secrets, zero-cost API allowlists, version synchronization, PWA/static asset integrity, `Trinhism` / `Trinhism Labs` attribution, and `noindex` hygiene) followed by the full `node:test` unit and integration suite (`tests/*.test.ts`).

---

## 💾 Local File PC Auto-Sync & Backup Architecture

Ambiently is built on an **offline-first local architecture**:

1. **Primary Browser Database (IndexedDB):** All widgets, canvases, sticky notes, checklists, chores, and meal plans are always saved instantly to IndexedDB (`AmbientlyDB`). The app never requires an internet connection or an external file to run and will never lose data across tab closures.
2. **Real-Time PC Auto-Sync (Chromium):** In Settings (`Backup & System`) or the Backup modal, click **PC Auto-Sync** to bind an `ambiently-data.json` file directly on your local computer's drive using the File System Access API.
   * **Reactive Event-Driven Snapshots:** Whenever you move widgets, check off to-do items, or edit canvases, Ambiently automatically streams snapshots to disk (with debounced safe-write queues preventing write lock collisions).
   * **Session Persistence & 1-Click Reconnect:** Ambiently stores the file handle securely inside IndexedDB. When reopening or reloading the app, Ambiently attempts silent permission verification (`queryPermission()`), or displays a 1-click **Reconnect Auto-Sync** button so you never have to re-browse your folder tree.
   * **Cloud Sync via Local Folders:** If you place `ambiently-data.json` inside a local **Dropbox, Google Drive, OneDrive, Nextcloud, or Synology Drive** folder, desktop sync clients will automatically detect updates and replicate your dashboard state across all your devices without routing data through third-party servers.
3. **Universal 1-Click Export & Restore:** For non-Chromium browsers (Safari, Firefox, iOS, Android), 1-click **Export Backup** and **Restore from File** provide complete standalone `.json` backup files that can be imported onto any device in seconds.

---

## ☁️ Cloud Sync Setup (Optional)

To enable real-time multi-device WebSocket sync across wall displays, tablets, and phones:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql), [`supabase/migrations/phase1_profiles_chores_meals.sql`](supabase/migrations/phase1_profiles_chores_meals.sql), [`supabase/migrations/kanban_boards_and_cards.sql`](supabase/migrations/kanban_boards_and_cards.sql), and [`supabase/migrations/20261117_board_limit_counts_every_table.sql`](supabase/migrations/20261117_board_limit_counts_every_table.sql) in the Supabase SQL Editor, then run [`supabase/security-check.sql`](supabase/security-check.sql) (audits RLS, grants, composite keys, 100 MB board-size limits, and revision triggers across every `public` table; any returned row indicates a setting to review).
   * In **Authentication**, keep **Confirm email** and **Secure email change** on, and keep anonymous sign-ins off.
   * Never put the `service_role` key in the app—only use the publishable `anon` key.
3. Provide your project credentials depending on how you host Ambiently:
   * **Docker / Raspberry Pi (Runtime — No Rebuild Needed):** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` or `compose.yaml` and run `docker compose up -d`.
   * **Cloudflare Pages / Static Hosting (Build-Time):** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in **Settings -> Environment variables**.
4. In Ambiently (**Settings -> Backup & System**), sign in with your email code/magic link and click **Back Up to Cloud** (or use **Sync Now** to reconcile changes bidirectionally across paired devices).

---

## 📄 License & Self-Hosting Attribution (AGPLv3)

This project is licensed under the terms of the **GNU Affero General Public License v3.0 (AGPLv3)**. See the [LICENSE](LICENSE) file for full details.

### Self-Hosting & Attribution Policy
Ambiently keeps the live ambient display canvas 100% free of watermarks to prevent OLED burn-in and visual clutter. Instead, attribution and source links live unobtrusively inside the **Ambiently Quick Hub popover** (top-left logo menu) and the **Settings & Changelog modal footers** (`Powered by Ambiently • trinhism.com • Source (AGPLv3)`).

In accordance with **AGPLv3 Sections 7(b) and 13** (Remote Network Interaction & Preservation of Legal/Author Notices):
* If you self-host, fork, or deploy a modified version of Ambiently over a network, you **must preserve** the interactive attribution notices and source code links in the Quick Hub menu and Settings/Changelog modal footers.
* Any modified network deployment must also make its complete corresponding source code available under the AGPLv3.
