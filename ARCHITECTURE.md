# Ambiently — System Architecture

## 1. High-Level Overview

Ambiently is engineered as a **Local-First Progressive Web App (PWA)** hosted on **Cloudflare Pages** (`dashboard.trinhism.com`) and packaged as a **standalone multi-architecture Docker & Raspberry Pi container** (`linux/amd64` + `linux/arm64`). It boots in **0ms offline** with zero server dependency for core operations, while running identical `/api/*` feed/media proxy handlers on either **Cloudflare Pages Functions** or the **bundled Node HTTP server (`server/index.ts`)**, plus optional **Supabase** multi-device cloud synchronization.

```mermaid
flowchart TB
    subgraph Client ["Browser / Kiosk Client (React 19 + Vite PWA)"]
        UI["UI Layer (Pure Corkboard Canvases, Widgets, Chore Hub, Meal Planner, Kanban Engine, Mobile Companion)"]
        Store["Zustand State Stores\n(dashboardStore.ts, choreStore.ts, useMealStore.ts, useKanbanStore.ts, useProfileStore.ts)"]
        IDB[("IndexedDB (Dexie.js v5)\nSettings, Tabs, Widgets, Notes, Chores, Meals, Kanban, Routines, Profiles, Vault")]
        Cache[("CacheStorage API\nOffline Photos & Assets")]
        FSA["File System Access API\n(ambiently-data.json Auto-Backup)"]
    end

    subgraph Edge ["Proxy & Runtime Layer (Cloudflare Pages Edge OR Self-Hosted Docker / Pi server/index.ts)"]
        ConfigEndpoint["/config.js & /api/health\n(Runtime Env Injection & Healthcheck)"]
        ICalProxy["/api/ical\n(RFC 5545 & IANA Timezone Parser)"]
        RssProxy["/api/rss\n(RSS 2.0 / Atom XML Parser)"]
        FinanceProxy["/api/finance\n(Zero-Key Market Quotes, Sparklines & Ticker Search)"]
        ReaderProxy["/api/reader & /api/web-proxy\n(Readability Article Extractor & Iframe Proxy)"]
        MetadataProxy["/api/metadata\n(OpenGraph Wishlist & Recipe JSON-LD Scraper)"]
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
    UI --> ConfigEndpoint
    UI --> ICalProxy
    UI --> RssProxy
    UI --> FinanceProxy
    UI --> ReaderProxy
    UI --> MetadataProxy
    UI --> GPhotosProxy
    UI --> GDriveProxy
    Store <--> Auth
    Store <--> PG
```

---

## 2. Local-First Data Layer (`src/services/db.ts`)

Ambiently uses **Dexie.js** over browser `IndexedDB` (`AmbientlyDB` schema version `5`) with 12 core object stores:
1. `settings`: Global kiosk configuration (`dockPosition`, `carouselEnabled`, `canvasSwipeEnabled`, `nightModeStyle`, `nightModeStart`, `nightModeEnd`, `wakeLockEnabled`, `pinHash`, `lockSettingsAccess`, `settingsPinOptOut`, `clockFormat`, `weekStartsOn`, `defaultWidgetStyle`, `confirmWidgetDelete`, `photoAutoSyncInterval`, plus pure-config shared photo metadata `commonPhotoSourceType`, `commonPhotoSourceLabel`, `commonPhotoSourceUrl`, `commonPhotoCuratedCategory`, `commonPhotoPlexConfig`). Device-local PIN and lock flags are stripped from shared Cloud Sync payloads and normalized on startup so legacy `lockSettingsAccess: false` residue cannot bypass Settings locks unless `settingsPinOptOut` is explicitly enabled. **Sync Now** reconciles local and cloud changes bidirectionally (flushing pending pushes before pulling newer remote updates and pushing newer local edits/deletions back); **Back Up to Cloud** protects newer/tied remote deletions or archives from stale-device overwrites and pulls them down immediately; **Restore from Cloud** uses authoritative overwrite semantics (`overwriteLocal: true`) so `defaultWidgetStyle` and board preferences restore cleanly even if local defaults have newer timestamps, while device-local PIN/kiosk locks stay protected.
2. `tabs`: Ordered canvas definitions (`id`, `name`, `icon`, `order`, `autoRotateDurationSec`, `isHome`, `enabled`).
3. `widgets`: Widget instances scoped by `tabId` (updated cleanly via `moveWidgetToTab` / `moveWidgetToNewTab` with collision-avoidant destination placement via `computeMovedWidgetPosition` and a `MovedWidgetToast` quick-jump banner; soft-deleted tiles populate `deletedWidgets` for 30-day 1-click `restoreWidget` recovery in **Trash & Recovery**, while `permanentlyDeleteWidget` / `permanentlyDeleteWidgets` purges credentials/`db.vault` local media and shrinks tombstones to `{ __purged: true }`), storing normalized freeform canvas coordinates (`freeformPos: { xRatio, yRatio, wRatio, hRatio, zIndex, rotation, isFullScreen }`), mobile display ordering (`mobileOrder`), and widget-specific pure-config `config` (e.g., calendar `.ics` sources, weather coordinates, sticker frame overrides `transparentBg`/`bgStyle`, photo frame scope & source metadata `useCommonSource`, `sourceType`, `curatedCategoryId`, `plexSyncConfig`, `ImageWidget` `mp4Url`/`mediaSource`, quote intervals, chore widget scope, meal planner scope, Markets & Watchlist `FinanceWidgetConfig { watchlist, range, displayMode, showSparkline, showAbsoluteChange, refreshIntervalMin }`, Kitchen Timer `TimerWidgetConfig { timers, chimeEnabled }`, Air Quality `AirQualityWidgetConfig { locationName, latitude, longitude, timezone, showPollen, showUvStrip, refreshIntervalMin }`, Sun & Moon `SunMoonWidgetConfig { locationName, latitude, longitude, timezone, showGoldenHour, showMoonDetails }`, Check-In & Home Rhythms tile preferences `RoutinesWidgetConfig { defaultProfileId, compactMode, transparentBg }`, Guest Wi-Fi & House-Sitter `WifiQrWidgetConfig { activeView, homeAddress, emergencyContacts, sitterNotes, autoHidePasswordSec, transparentBg }`, Family Decision Wheel `DecisionMakerWidgetConfig { mode, prompt, options, votes, allowMultiVote, removeWinnerOnSpin, eliminatedOptionIds, lastWinnerOptionId, lastSpunAt, transparentBg }`, and independent per-widget Kanban selection `KanbanWidgetConfig { widgetInstanceId, activeBoardId, activeColumnId, displayMode }` — bulky `commonPhotos`, `customPhotos` arrays, oversized inline `data:` image URLs, and all Guest Wi-Fi QR credentials (`ssid`, `password`, `security`, `hiddenNetwork`, `credentialStorage`) are unconditionally stripped before Cloud Sync push/pull/Realtime to keep payloads `< 5 KB` and Wi-Fi credentials strictly local). Pending debounced cloud pushes flush automatically before sign-out, wipe, cloud pulls, or tab hide.
4. `notes`: Sticky notes, checklists, & shopping lists (`isShoppingList: true`) scoped by `tabId`, supporting soft-deletion (`archivedAt`), automatic expiration (`expiresAt`), canvas pinning status (`isPinnedToCanvas`), custom `textColor`, and freeform coordinates (`isPinnedToCanvas`, `isShoppingList`, and `textColor` round-trip through `public.notes.freeform_pos` JSONB). Note, widget, and tab mutations advance monotonic `updatedAt` timestamps (`nextMonotonicIso`), track in-memory + IndexedDB deletion tombstones (`deletedNoteTimestamps`, `deletedWidgetTimestamps`, `deletedTabTimestamps`), and apply delete/archive precedence tie-breakers across Realtime broadcasts, Cloud pulls, and Cloud pushes so deleted or unpinned notes cannot resurrect.
5. `localDeviceVault`: Device-only key-value store for sensitive local tokens, file handles, device-only Guest Wi-Fi QR credentials (`wifi-cred:<widgetId>` storing `{ ssid, password, security, hiddenNetwork }`), and uploaded `ImageWidget` media (`vault://local-media:*`, included automatically in JSON backup exports/restores) that are never pushed to cloud sync.
6. `choreEngineState`: Singleton household snapshot (`id: 'household_chores'`) storing chore templates, active instances (across `pending`, `awaiting_approval`, `completed`, `skipped`, and `expired` lifecycle states), wishlist rewards, trophy case records, the immutable append-only point audit ledger, household chore settings, deletion tombstones (`deletedRewardIds`, `deletedTemplateIds`), and authoritative parent vs. self-service sync resolution (`mergeChoreSnapshotsAuthoritative`).
7. `householdProfiles`: Global family member profiles (`id`, `name`, `role`, `color`, `avatarDataUrl`, `icon`) shared across the Chore Engine and household planners.
8. `meals`: Singleton household meal planner snapshot (`id: 'household_meals'`) storing saved recipes (`recipes`), scheduled calendar meals (`scheduledMeals`, automatically pruned after 21 days in the past), checked grocery item keys (`checkedGroceryKeys`), and deletion tombstones for conflict-free cloud merging.
9. `kanbanBoards`: Normalized local table (`'id, sortOrder, updatedAt'`) for multi-board definitions (`id`, `name`, `autoArchiveDays`, `sortOrder`, `createdAt`, `updatedAt`).
10. `kanbanCards`: Normalized local table (`'id, boardId, [boardId+columnId+isArchived+sortOrder], updatedAt'`) storing active and archived Kanban cards with fractional `sortOrder` (`1000`-step reindexing when bisect gaps narrow below `0.001`), `assigneeIds`, JSON `checklist` arrays, and Done/Archive timestamps (`completedAt`, `archivedAt`).
11. `kanban`: Singleton household Kanban snapshot (`id: 'household_kanban'`, synced alongside relational Supabase tables `public.kanban_boards` & `public.kanban_cards` from `supabase/migrations/kanban_boards_and_cards.sql` plus sentinel note fallback `KANBAN_ENGINE_CLOUD_ROW_ID = '__ambiently_kanban_engine__'`) carrying bounded deletion tombstones (`deletedBoardIds`, `deletedCardIds`) and LWW state merging (`mergeKanbanSnapshots`) across Realtime events and JSON backups.
12. `routines`: Singleton household Check-In & Home Rhythms snapshot (`id: 'household_routines'`, synced via `ROUTINES_CLOUD_ROW_ID = '__ambiently_routines_store__'` and `useRoutinesStore`) carrying household routine schedules, bounded completion stamps, and `deletedRoutineIds` tombstones with automatic first-run/legacy migration (`pickMigratableRoutineWidget`) from active or soft-deleted `routines` tiles so deleting a widget never clears household routines.

Workbox (`vite.config.ts`) and `mediaOptimization.ts` also maintain bounded `CacheFirst` runtime caches for static GIPHY/Wikimedia CDN media assets (`ambiently-media-cache-v1`, max 120 entries / 14-day expiry) and lazy-excluded hashed chunks (`ambiently-lazy-chunks-v1` for `ChangelogModal` and `vendor-heif`) alongside `ambiently-photo-cache-v1` offline photo caching, without ever caching tokenized Plex URLs.

---

## 3. Responsive Proportional Canvas & Performance Architecture (`src/App.tsx`, `src/components/layout/Corkboard.tsx`)

To support 1080p tablets, 1440p monitors, and 4K TVs cleanly:
* The canvas renders at crisp native 1:1 resolution (`w-full h-full`) without artificial CSS zoom scaling or rasterization blur.
* Widget positions and dimensions use normalized viewport ratios (`xRatio`, `yRatio`, `wRatio`, `hRatio`), ensuring perfect responsiveness across arbitrary aspect ratios while preventing edge clipping.
* Heavy dashboard widgets (`CalendarWidget`, `RssWidget`, `PhotoFrameWidget`, `ChoreWidget`, `MealPlannerWidget`, `KanbanWidget`, `FinanceWidget`, `TimerWidget`, `AirQualityWidget`, `SunMoonWidget`, `RoutinesWidget`, `WifiQrWidget`, `DecisionMakerWidget`, `StickyNotesWidget`), `Corkboard` interactive overlays (`CorkboardNoteModal`, `CorkboardTrashModal`, `CorkboardContextMenu`, `CanvasBlueprintPicker`, `ShoppingListNoteBody`), and sub-modals (`WidgetDeleteConfirmModal`, `KanbanBoardView`, `KanbanCardModal`, `KanbanBoardModal`, `KanbanArchiveDrawer`, `KanbanConfirmDialog`, `MealEntryModal`, `CookingModeModal`, `SharedSplitModal`, `ProposeRewardModal`, `ProposalsTrayModal`, `TrophyCaseModal`, `CalendarUrlGuideModal`) are code-split via `React.lazy` and `Suspense` to shrink the initial entry bundle.
* Toast banners (`PlexReauthBanner`, `UpdateNotificationBanner`, `SyncRefusedBanner`) use GPU-composited CSS animations instead of `framer-motion` so `framer-motion` is co-located inside the lazy `PhotoFrameWidget` chunk and only loads when a `PhotoFrameWidget` mounts. Likewise, `@supabase/supabase-js` loads lazily on demand (`getSupabaseAsync` / `hasSupabaseCredentials` in `src/services/supabase.ts`), while `scheduleCloudAutoPush` debounces before reading cached session credentials (`getCachedSessionUser`) and `fetchWeatherData` (`src/services/weather.ts`) deduplicates concurrent in-flight requests per coordinate/unit key.
* Canvas widget bodies are isolated inside `MemoizedCanvasWidgetBody` (`React.memo` with ref-backed callbacks and `willChange` promotion strictly during active drag/resize/rotate gestures) and guarded against React Portal synthetic event bubbling (`isPortalEvent`). `Corkboard` scopes its photo-modal `settings` subscription to active `photoSourcesTarget` edits, uses `--card-z` + `hover:z-[55]` instead of React hover state, exits `handlePointerMove` immediately when idle, caches the container `DOMRect` on `pointerdown`, coalesces drag/resize/rotate updates via `requestAnimationFrame`, and temporarily suspends `backdrop-blur-md` during active card manipulation.
* Time-based widgets (`ClockWidget`, `ClockWeatherWidget`, `WorldClockWidget`, `CountdownWidget`, `TimerWidget`, `SunMoonWidget`), `GlobalTimerAlarmOverlay` (gated off when no timers are active/ringing), and `NightMode` subscribe to the wall-clock-aligned shared ticker (`useSharedClock` in `src/utils/sharedClock.ts`). Under `oled_clock` Night Mode (`isOledNightClock` via `useDisplayActivity`), visual clock widgets suspend shared clock subscriptions alongside paused animated `<video>` GIF streams, `PhotoFrameWidget` rotation intervals, background polling/rotation in `AirQualityWidget`, `WeatherWidget`, `ClockWeatherWidget`, `QuotesWidget`, and `RssWidget`, and canvas rendering; `astronomy.ts` caches `Intl.DateTimeFormat` instances by timezone and `SunMoonWidget` buckets ephemeris calculations to 60-second intervals.
* `src/App.tsx` reads Zustand state via targeted individual selectors paired with `useCallback` handlers, while `<NavigationDock />` is wrapped in `React.memo` and `<SettingsModal />` and configuration overlays remain pinned at the root viewport layer with dismiss-on-backdrop and fixed sticky headers. Canvas layout changes (`updateWidgetPosition`, `updateNotePosition`, `autoOrganizeCanvas`) record up to 20 geometry snapshots (`layoutUndoStack`, ignoring pure `zIndex`/layer changes via `classifyLayoutGeometryChange`) and surface a 5-second `LayoutUndoToast` + global `Ctrl+Z`/`Cmd+Z` keyboard shortcut (`undoLayoutChange`) alongside the Dock's Undo control. Canvas-to-canvas swipe navigation (`src/hooks/useCanvasSwipe.ts`, `src/utils/canvasSwipe.ts`, `CanvasSwipePreviewPill.tsx`) binds capture-phase pointer listening, native HTML5 `dragstart` prevention, `touch-action: pan-y` descendant isolation, and post-swipe synthetic click suppression across `visibleTabs`: immediate horizontal swipes work across empty space, fullscreen tiles (`data-canvas-fullscreen="true"`), multi-widget layouts, `36px` dock-aware edges (`isPointInCanvasEdgeSwipeZone`), Mobile Companion feeds, and trackpad wheel swipes; on unlocked `Corkboard` cards when multi-canvas swipe is active, a `230ms` (`CARD_DRAG_HOLD_MS`) press-and-hold picks up the tile via `requestCancelActiveCanvasSwipe` while moving >`12px` cancels the hold so widgets never nudge during a swipe, leaving resize/rotate handles (`data-no-canvas-swipe="true"`), explicit `[draggable="true"]` items, text inputs, Kanban cards, dialogs, and overflowing horizontal scrollers isolated.

---

## 4. Serverless Edge Functions (`functions/api/`)

Cloudflare Pages Functions handle CORS-free feeds, media parsing, and deep pagination:
* **`functions/api/ical.ts` (`/api/ical`)**: Normalizes `webcal://` URLs to `https://`, fetches raw `.ics` streams, parses `VEVENT` blocks and `RRULE` recurrences via `ical.js` with fallback IANA timezone resolution (`Intl.DateTimeFormat`), and returns clean JSON cached at the edge for 15 minutes.
* **`functions/api/rss.ts` (`/api/rss`)**: Fetches RSS 2.0 `<item>` and Atom `<entry>` XML feeds, strips HTML/CDATA tags, extracts lead images and content snippets, and returns normalized JSON headlines cached for 15 minutes.
* **`functions/api/finance.ts` (`/api/finance`)**: Fetches live market quotes, sparklines (`1d` / `5d` / `1mo`), trading session states, and ticker search suggestions (`?q=`) strictly from Yahoo Finance hosts (`allowedHosts` allowlist, 60s in-memory TTL cache, max 15 symbols per request) with zero API keys required.
* **`functions/api/reader.ts` (`/api/reader`)**: Extracts clean, distraction-free article HTML, headlines, bylines, and hero images using `@mozilla/readability` and `linkedom` with semantic `<article>` and JSON-LD fallbacks.
* **`functions/api/web-proxy.ts` (`/api/web-proxy`)**: Proxies external web pages for in-app kiosk viewing when sites block direct iframe embedding via `X-Frame-Options` or `CSP frame-ancestors`.
* **`functions/api/metadata.ts` (`/api/metadata`)**: Extracts OpenGraph (`og:title`, `og:image`), product price metadata (`product:price:amount`, JSON-LD `Offer`) for the Chore & Reward Engine's Wishlist URL scraper, and Schema.org `Recipe` JSON-LD (`recipeIngredient`, `recipeInstructions` including `HowToStep`/`HowToSection`, `recipeYield`, and ISO 8601 `prepTime`/`cookTime`) for the Family Meal Planner's Recipe URL importer.
* **`functions/api/gphotos.ts` (`/api/gphotos`)**: Resolves public Google Photos shared albums (`photos.app.goo.gl` / `photos.google.com/share`). Extracts album metadata (`AF_initDataCallback 'ds:1'`) and automates subsequent `snAcKc` batchexecute RPC pagination to retrieve full photo collections (tested up to 7,500+ photos in ~11s, at most 10,000), kept in browser/edge cache for 1 hour unless `?rescan=1` bypasses caching (`Cache-Control: no-store`) during `photoSyncService.ts` scheduled background rescans or 15-minute cooldown-protected manual syncs.
* **`functions/api/gdrive.ts` (`/api/gdrive`)**: Resolves public Google Drive shared folders (`drive.google.com/drive/folders/...`) into high-resolution streamable photos (`=w1920-h1080`), skipping video/document formats, validating public access permissions, and supporting `?rescan=1` cache-bypass (`Cache-Control: no-store`) for scheduled/manual library rescans via `photoSyncService.ts`.
* **`functions/_shared/fetchExternal.ts`**: Every function fetches through this. It allows only public HTTPS addresses by default and checks each redirect too, caps the wait and the size of the answer, and refuses requests from other websites. Self-hosted Docker instances on private home networks can optionally set `AMBIENTLY_ALLOW_PRIVATE_FEEDS=true` to allow RFC1918 LAN / `.local` calendar and RSS feeds while keeping loopback (`127.0.0.1` / `localhost`) and cloud metadata (`169.254.169.254`) blocked. The photo functions always strictly require Google's HTTPS hosts.
* **`npm run dev`** runs these same functions through a small adapter in `vite.config.ts`, so development behaves like the deployed site.
* **Standalone Docker & Raspberry Pi Runtime (`server/index.ts`, `vite.server.config.ts`, `Dockerfile`, `compose.yaml`)**: Bundles `server/index.ts` and all 8 `functions/api/*` handlers into a single zero-dependency Node ESM bundle (`dist-server/index.mjs`) served alongside `dist/` in a non-root `node:22-alpine` (`linux/amd64` + `linux/arm64`) container, with runtime `/config.js` Supabase credential injection and `/api/health` readiness probes.

---

## 5. Mobile Companion Viewport Architecture (`MobileCompanion.tsx`)

To ensure flawless mobile touch interaction while preserving the kiosk corkboard's `overflow: hidden`:
* **Viewport Containment**: Mobile Companion renders inside a `fixed inset-0 w-full h-[100dvh]` container with `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`, and `overscroll-behavior-y: contain`.
* **Independent Mobile Reordering**: Widgets retain an optional `mobileOrder` integer property. Swapping cards on mobile modifies `mobileOrder` without impacting desktop freeform coordinates (`xRatio`, `yRatio`).
* **Persistent View State**: View filter preferences (`all`, `widgets`, `notes`) are preserved in `localStorage` under `ambiently_companion_view`.

---

## 6. Self-Hosted Docker & Raspberry Pi Runtime Architecture

Ambiently supports 100% feature-parity self-hosting alongside its Cloudflare Pages deployment without duplicating backend logic:

* **Single-File Zero-Dependency Server Bundle (`server/index.ts`, `vite.server.config.ts`)**:
  * `npm run build:server` compiles `server/index.ts` and all 8 `functions/api/*` handlers (`noExternal: true`) into a single standalone ESM file (`dist-server/index.mjs`) using Node's native `node:http`, `node:fs`, `node:zlib`, and Web Fetch API (`Node 22`).
  * Incoming `/api/*` and `/functions/api/*` requests are converted into standard Web `Request` objects, passed directly into the exact same `onRequestGet` handlers used on Cloudflare Pages, and streamed back to the client.
* **Multi-Architecture Container & Asset Caching (`Dockerfile`, `compose.yaml`)**:
  * A multi-stage `node:22-alpine` build compiles `dist/` and `dist-server/index.mjs`, then copies only those two build outputs into a minimal non-root (`USER node`) runtime image supporting both `linux/amd64` and `linux/arm64` (Raspberry Pi 4/5).
  * Fingerprinted `/assets/*` bundles are served with `Cache-Control: public, max-age=31536000, immutable` and cached compressed (`gzip`) in memory, while `sw.js`, `version.json`, and `index.html` enforce `Cache-Control: no-cache` so updates propagate immediately.
  * Exposes `GET /api/health` (`{ status: "ok", version, uptimeSec }`) for Docker Compose `healthcheck` probes and kiosk boot synchronization.
* **Service-Worker-Safe Runtime Config Injection (`GET /config.js`, `src/services/supabase.ts`)**:
  * Because `vite-plugin-pwa` hashes `dist/index.html` into Workbox's precache manifest (`sw.js`), mutating `index.html` at container startup would conflict with cached Service Worker responses.
  * Instead, `index.html` loads `/config.js` (explicitly excluded from Workbox precaching and SPA navigation fallback in `vite.config.ts`). `server/index.ts` dynamically generates `window.__AMBIENTLY_CONFIG__` from runtime `SUPABASE_URL` / `SUPABASE_ANON_KEY` environment variables (`Cache-Control: no-store`), and `supabase.ts` caches the last known runtime config in `localStorage` so offline PWA reloads continue to initialize cleanly.
* **Raspberry Pi Kiosk & Standalone Appliance Lifecycle (`scripts/pi-kiosk-setup.sh`, [`RASPBERRY_PI.md`](./RASPBERRY_PI.md))**:
  * Supports both Raspberry Pi OS Bookworm Wayland (`labwc` / `wayfire` + `wlr-randr`) and X11 (`LXDE-pi` + `xrandr` + `unclutter`).
  * Can operate as a pure **Kiosk Display (`--mode kiosk`)** pointing at `https://dashboard.trinhism.com` or a LAN server, or as an **All-in-One Standalone Appliance (`--mode standalone`)** that runs the ARM64 Docker container locally (`restart: unless-stopped`), polls `http://localhost:8080/api/health` on boot before launching fullscreen Chromium, and clears Chromium crash flags after sudden power loss.
