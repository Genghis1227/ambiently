# Ambiently — System Architecture

## 1. High-Level Overview

Ambiently is engineered as a **Local-First Progressive Web App (PWA)** hosted on **Cloudflare Pages** (`dashboard.trinhism.com`). It is designed to boot in **0ms offline** with zero server dependency for core operations, while offering optional **Cloudflare Pages Functions** for CORS-free feed proxying and **Supabase** for multi-device cloud synchronization.

```mermaid
flowchart TB
    subgraph Client ["Browser / Kiosk Client (React 19 + Vite PWA)"]
        UI["UI Layer (Pure Corkboard Canvases, Widgets, Mobile Companion)"]
        Store["Zustand State Store (dashboardStore.ts)"]
        IDB[("IndexedDB (Dexie.js)\nSettings, Tabs, Widgets, Notes, Vault")]
        Cache[("CacheStorage API\nOffline Photos & Assets")]
        FSA["File System Access API\n(ambiently-data.json Auto-Backup)"]
    end

    subgraph Edge ["Cloudflare Pages Edge (/functions/api/*)"]
        ICalProxy["/api/ical\n(Webcal & .ics Parser)"]
        RssProxy["/api/rss\n(RSS 2.0 / Atom XML Parser)"]
        GPhotosProxy["/api/gphotos\n(Google Photos batchexecute RPC Paginator)"]
        GDriveProxy["/api/gdrive\n(Google Drive Shared Folder Ingestion)"]
    end

    subgraph Cloud ["Optional Cloud Sync (Supabase)"]
        Auth["Supabase Auth (Magic Link)"]
        PG[("Postgres DB + RLS\nReal-time Multi-Device Sync")]
    end

    UI <--> Store
    Store <--> IDB
    Store --> FSA
    UI <--> Cache
    UI --> ICalProxy
    UI --> RssProxy
    UI --> GPhotosProxy
    UI --> GDriveProxy
    Store <--> Auth
    Store <--> PG
```

---

## 2. Local-First Data Layer (`src/services/db.ts`)

Ambiently uses **Dexie.js** over browser `IndexedDB` (`AmbientlyDB`) with 5 core object stores:
1. `settings`: Global kiosk configuration (`dockPosition`, `carouselEnabled`, `nightModeStyle`, `nightModeStart`, `nightModeEnd`, `wakeLockEnabled`, `pinHash`).
2. `tabs`: Ordered canvas definitions (`id`, `name`, `icon`, `order`, `autoRotateDurationSec`, `isHome`, `enabled`).
3. `widgets`: Widget instances scoped by `tabId`, storing normalized freeform canvas coordinates (`freeformPos: { xRatio, yRatio, wRatio, hRatio, zIndex, rotation, isFullScreen }`), mobile display ordering (`mobileOrder`), and widget-specific `config` (e.g., calendar `.ics` sources, weather coordinates, photo settings, quote intervals).
4. `notes`: Sticky notes & checklists scoped by `tabId`, supporting soft-deletion (`archivedAt`), automatic expiration (`expiresAt`), canvas pinning status (`isPinnedToCanvas`), and freeform coordinates.
5. `localDeviceVault`: Device-only key-value store for sensitive local tokens that are never pushed to cloud sync.

---

## 3. Responsive Proportional Canvas Architecture (`src/App.tsx`)

To support 1080p tablets, 1440p monitors, and 4K TVs cleanly:
* The canvas renders at crisp native 1:1 resolution (`w-full h-full`) without artificial CSS zoom scaling or rasterization blur.
* Widget positions and dimensions use normalized viewport ratios (`xRatio`, `yRatio`, `wRatio`, `hRatio`), ensuring perfect responsiveness across arbitrary aspect ratios while preventing edge clipping.
* The `<NavigationDock />`, `<SettingsModal />`, and all configuration overlays remain pinned at the root viewport layer with dismiss-on-backdrop and fixed sticky headers.

---

## 4. Serverless Edge Functions (`functions/api/`)

Cloudflare Pages Functions handle CORS-free feeds, media parsing, and deep pagination:
* **`functions/api/ical.ts` (`/api/ical`)**: Normalizes `webcal://` URLs to `https://`, fetches raw `.ics` streams, parses `VEVENT` blocks (folded lines, `DTSTART`, `DTEND`, `SUMMARY`, `LOCATION`), and returns clean JSON cached at the edge for 15 minutes.
* **`functions/api/rss.ts` (`/api/rss`)**: Fetches RSS 2.0 `<item>` and Atom `<entry>` XML feeds, strips HTML/CDATA tags, and returns normalized JSON headlines cached for 15 minutes.
* **`functions/api/gphotos.ts` (`/api/gphotos`)**: Resolves public Google Photos shared albums (`photos.app.goo.gl` / `photos.google.com/share`). Extracts album metadata (`AF_initDataCallback 'ds:1'`) and automates subsequent `snAcKc` batchexecute RPC pagination to retrieve full photo collections (tested up to 7,500+ photos in ~11s, at most 10,000), kept in the browser's cache for 1 hour.
* **`functions/api/gdrive.ts` (`/api/gdrive`)**: Resolves public Google Drive shared folders (`drive.google.com/drive/folders/...`) into high-resolution streamable photos (`=w1920-h1080`), skipping video/document formats and validating public access permissions.
* **`functions/_shared/fetchExternal.ts`**: Every function fetches through this. It allows only public HTTPS addresses and checks each redirect too, caps the wait and the size of the answer, and refuses requests from other websites. The photo functions also only follow redirects within Google's hosts.
* **`npm run dev`** runs these same functions through a small adapter in `vite.config.ts`, so development behaves like the deployed site.

---

## 5. Mobile Companion Viewport Architecture (`MobileCompanion.tsx`)

To ensure flawless mobile touch interaction while preserving the kiosk corkboard's `overflow: hidden`:
* **Viewport Containment**: Mobile Companion renders inside a `fixed inset-0 w-full h-[100dvh]` container with `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`, and `overscroll-behavior-y: contain`.
* **Independent Mobile Reordering**: Widgets retain an optional `mobileOrder` integer property. Swapping cards on mobile modifies `mobileOrder` without impacting desktop freeform coordinates (`xRatio`, `yRatio`).
* **Persistent View State**: View filter preferences (`all`, `widgets`, `notes`) are preserved in `localStorage` under `ambiently_companion_view`.
