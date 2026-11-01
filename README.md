# Ambiently (`dashboard.trinhism.com`)

> Modern, ambient smart-display and command center Progressive Web App (PWA) under the Trinhism ecosystem, designed as a self-hosted, local-first alternative to commercial display services (Mango Display, DAKboard, Skylight).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/Release-v0.0.5-cyan.svg)](CHANGELOG.md)

![Ambiently Banner](public/og-banner.png)

---

## 📚 Project Documentation

* **[Features & Capabilities Reference (FEATURES.md)](FEATURES.md)** — Comprehensive breakdown of widgets, layout modes, photo frames, and mobile companion.
* **[System Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)** — Local-first persistence engine, Cloudflare edge workers, resolution scaling, and Supabase cloud sync.
* **[Changelog (CHANGELOG.md)](CHANGELOG.md)** — Semantic version history and release notes.
* **[Developer Workflow (DEVELOPER_WORKFLOW.md)](DEVELOPER_WORKFLOW.md)** — Standard Trinhism contributor protocols and git branch sequence.

---

## 🌟 Highlights

* **⚡ 0ms Offline-First Boot:** Runs entirely out of client-side browser storage (IndexedDB via Dexie.js). Never shows a blank screen if home Wi-Fi drops.
* **💾 Local File Auto-Sync:** Direct integration with the browser File System Access API to auto-save and mirror state directly to a local `ambiently-data.json` file.
* **🎛️ Dual-Mode Layout Engine:**
  * **Snapped Bento Grid:** Responsive 12×8 zero-scrollbar grid engineered for ambient landscape and portrait displays.
  * **Freeform Corkboard:** Dynamic pinboard with free floating coordinates (`x, y`), rotation, layering (`z-index`), and resize controls.
* **📱 Mobile Companion Remote:** Automatically detects smartphone viewports (`< 768px`) to provide an instant task adder, checklist completion feed, and remote tab switcher.
* **🖼️ Multi-Source Photo Frame:** 4 display styles (Ken Burns, 4-quadrant mosaic, angled Polaroid stack, and scrolling filmstrip) supporting local folders and Unsplash photography with offline Cache Storage API resilience.
* **📅 Multi-Calendar Feeds:** Unified chronological agenda & monthly grid parsing multiple `webcal://` and `.ics` feeds with per-calendar color tags via Cloudflare edge workers.
* **🔒 Kiosk Security & Hardware Polish:**
  * Screen Wake Lock API & Fullscreen Mode.
  * Scheduled Night Mode with low-glow, pixel-shifting OLED clock to prevent screen burn-in.
  * Kid-Proof PIN lock with a 4-second hold parent challenge.
  * Display Density slider (`75%` to `150%`) for 1080p, 1440p, and 4K displays.

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

## ☁️ Supabase Cloud Sync Setup (Optional)

To enable multi-device sync across phones and displays:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the SQL schema located in [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.
3. Configure the environment variables in Cloudflare Pages (**Settings -> Environment variables**):
   * `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   * `VITE_SUPABASE_ANON_KEY` = `your-supabase-publishable-or-anon-key`
4. In Ambiently Settings, sign in via Magic Link and click **Sync to Cloud**.

---

## 📄 License

This project is licensed under the terms of the **GNU Affero General Public License v3.0 (AGPLv3)**. See the [LICENSE](LICENSE) file for full details.
