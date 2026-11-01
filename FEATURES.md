# Ambiently Features & Capabilities

Comprehensive overview of all core user-facing and hardware features available in **Ambiently** (`dashboard.trinhism.com`).

---

## 🎛️ 1. Dual-Mode Layout Engine

Each dashboard tab can be independently configured in one of two distinct layout modes:

### Snapped Bento Grid (Default)
* **Zero-Scrollbar Architecture:** An ambient 12-column by 8-row grid engineered to fill `100vw × 100vh` without scrollbars on desktop or wall kiosks.
* **Flexible Sizing:** Widgets span custom row and column configurations with responsive container queries.

### Freeform Corkboard
* **Draggable & Layered:** Move cards and notes anywhere on the screen with real-time pointer tracking.
* **Rotation & Stacking:** Random or customized tilt angles (`-3°` to `+3°`) with dynamic `z-index` layering.

---

## 📱 2. Mobile Companion Remote

When visiting `dashboard.trinhism.com` on a smartphone (`viewport < 768px`), Ambiently automatically renders the **Mobile Companion**:
* **Quick Task Bar:** Rapidly type notes or add checklist items that immediately sync to the wall display.
* **Tap-to-Complete Feed:** Check off grocery or chore items from your phone while walking around the house.
* **Remote Tab Navigation:** Switch the active screen on the wall kiosk remotely.
* **One-Tap Kiosk Switcher:** View the full desktop dashboard whenever needed.

---

## 🖼️ 3. Multi-Source Photo Frame

Useable as a Bento Grid tile or as a dedicated full-screen ambient photo display tab:

### 4 Visual Display Styles
1. **Ken Burns Ambient:** Slow, cinematic zoom and pan with Framer Motion crossfade transitions and a subtle corner clock overlay.
2. **Mosaic / Collage:** 4-quadrant photo collage grid with active selection indicators and captions.
3. **Polaroid Stack:** Angled white paper photo card with handwritten titles and author attribution.
4. **Filmstrip:** Horizontal scrolling carousel allowing instant manual photo selection.

### 4 Photo Sources
* **Local Folder:** Chromium File System Access API (`showDirectoryPicker`) to loop through local PC or mapped NAS folders.
* **Curated Photography:** Instant zero-config high-resolution landscapes from Unsplash.
* **Offline Cache API:** Persists the last 30 photos in browser storage so the display never goes blank when internet drops.

---

## 📅 4. Multi-Calendar Feeds

* **Unified Chronological Stream:** Merges multiple personal, work, and family calendars from Google, Apple iCloud, and Outlook into a single timeline.
* **Protocol Normalization:** Automatically handles `webcal://`, `webcals://`, and `https://` `.ics` URLs via Cloudflare Edge workers.
* **Dual Views:**
  * **Agenda View:** Clean list with weekday badges, start times, and location tags.
  * **Monthly Matrix:** Full 7-column calendar grid with dot markers indicating scheduled events on each date.

---

## ⛅ 5. Open-Meteo Weather & Multi-Face Clock

* **Zero-Key Weather:** Powered by Open-Meteo with no API keys or credit cards required.
* **Live Conditions:** Current temperature, feels-like, highs, lows, and 3-day forecast with auto-refresh every 15 minutes.
* **Live Clocks:** Digital minimal face with live seconds counter and an SVG analog clock face.

---

## 📝 6. Sticky Notes Board

* **Rich Text & Checklists:** Seamlessly toggle between free-text paragraphs and interactive checklist items.
* **Ambient Palette:** 6 pastel background colors (Amber, Emerald, Sky, Pink, Purple, Orange).
* **Expiration Engine:** Choose **Permanent**, **Expire in 24h**, **Expire in 3 days**, or set a **Custom Date/Time**.
* **Approaching-Expiry Glow:** Notes expiring within 12 hours receive an amber glowing border and badge indicator.
* **Trash & Archive Drawer:** Expired or deleted notes are safely archived in a recoverable drawer with 1-click restore.

---

## ⏳ 7. Milestone Countdown & Daily Quotes

* **Countdown Widget:** Live days, hours, minutes, and seconds countdown to upcoming vacations, holidays, or milestones.
* **Daily Quotes Widget:** Rotates curated thoughts of the day to inspire daily focus.

---

## 🔒 8. Kiosk Security & Hardware Polish

* **Screen Wake Lock API:** Prevents wall or desk displays from dimming or going to sleep during active hours.
* **Fullscreen API:** One-click immersive borderless kiosk mode.
* **Scheduled Night Mode:**
  * **Low-Glow OLED Clock:** Gentle red clock with automatic **pixel-shifting** (+/- 15px every 60s) to eliminate burn-in.
  * **Dimming Overlay:** 0%–95% configurable opacity overlay.
* **Kid-Proof PIN Lock:** Numeric keypad overlay locking edits and settings, with a 4-second hold parent challenge.
* **Resolution Density Slider:** Adjust density (`75%`, `100%`, `125%`, `150%`) for optimal viewing on 1080p, 1440p, or 4K monitors.

---

## 💾 9. Hybrid Data Persistence

1. **IndexedDB (Dexie.js):** 0ms instant boot completely offline.
2. **File System Access API:** Direct auto-save mirroring to a local `ambiently-data.json` file.
3. **Supabase Cloud Sync:** Passwordless Magic Link email authentication with PostgreSQL multi-tenant sync.
