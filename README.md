# Ambiently (`dashboard.trinhism.com`)

> Modern, ambient smart-display and command center Progressive Web App (PWA) under the Trinhism ecosystem, designed as a self-hosted, local-first alternative to commercial display services (Mango Display, DAKboard, Skylight).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

---

## 🌟 Overview

**Ambiently** transforms any wall-mounted monitor, desk display, tablet, or spare TV into a clean, always-on smart command center. 

### Key Highlights
* **⚡ 0ms Offline-First Boot:** Runs entirely out of client-side browser storage (IndexedDB via Dexie.js). Never shows a blank screen if your home Wi-Fi drops.
* **💾 Local File Auto-Sync:** Direct integration with the browser File System Access API to auto-save and mirror state to a local `ambiently-data.json` file.
* **🎛️ Dual-Mode Layout Engine:**
  * **Snapped Bento Grid:** Responsive 12×8 zero-scrollbar grid engineered for ambient landscape and portrait displays.
  * **Freeform Corkboard:** Dynamic pinboard with free floating coordinates (`x, y`), rotation, layering (`z-index`), and resize controls.
* **🔒 Kiosk Security & Hardware Polish:**
  * Screen Wake Lock API & Fullscreen Mode.
  * Scheduled Night Mode with low-glow, pixel-shifting OLED clock to prevent screen burn-in.
  * Kid-Proof PIN lock with lightweight challenge reset.
* **📱 Mobile Companion Mode:** Automatic responsive viewport adaptation for managing notes, switching tabs, and checking agenda on the go.
* **📅 Multi-Calendar Feeds:** Unified chronological agenda & monthly grid parsing multiple `webcal://` / `.ics` feeds with per-calendar color tags.

---

## 🛠️ Tech Stack

* **Frontend:** [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
* **PWA Engine:** `vite-plugin-pwa` (Workbox)
* **Styling & Animation:** [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/)
* **Local-First State:** [Dexie.js](https://dexie.org/) (IndexedDB) + [Zustand](https://github.com/pmndrs/zustand)
* **Edge Proxy:** Cloudflare Pages Functions (`/functions/api/*`) for CORS-free iCal/RSS parsing.
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

## 🗺️ Roadmap & Milestones

- [ ] **Phase 1: Foundation, Local-First Engine & Kiosk App Shell** (Current)
  - Normalized Dexie/Zustand schema + Device Vault
  - Navigation Dock (Top/Bottom/Left/Right) & Automated Carousel
  - 12×8 Bento Grid & Freeform Corkboard
  - Fullscreen, Wake Lock, Night Mode & PIN Pad
- [ ] **Phase 2: Core Direct-API Widgets**
  - Sticky Notes Board (Rich text, Checklists, Giphy, Expiration timers, Trash drawer)
  - Open-Meteo Weather & Multi-Face Clock (Digital, Flip, Analog)
  - Event Countdown & Scheduled Quotes
- [ ] **Phase 3: Cloudflare Edge Proxy, Multi-Calendar & RSS**
  - `/functions/api/ical` and `/functions/api/rss`
  - Color-coded multi-calendar feeds (Agenda & Monthly Grid)
- [ ] **Phase 4: Multi-Source Photo Frame**
  - 4 Display Styles (Ken Burns, Mosaic, Polaroids, Filmstrip)
  - 4 Photo Sources (Plex OAuth, Google Drive, Local Folder, Curated Art)
  - Offline Cache API (30–50 photos)
- [ ] **Phase 5: Mobile Companion Mode & Supabase Cloud Sync**

---

## 📄 License

This project is licensed under the terms of the **GNU Affero General Public License v3.0 (AGPLv3)**. See the [LICENSE](LICENSE) file for full details.
