# Changelog

All notable changes to the **Ambiently** smart-display and command center platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.18] - 2026-11-10

### Delete All for Archived & Expired Notes & Permanent Reward Store Deletion Fix
* **Delete All for Archived & Expired Notes (`src/components/layout/Corkboard.tsx`, `src/components/widgets/StickyNotesWidget.tsx`, `src/store/dashboardStore.ts`, `src/App.tsx`):**
  * Added a **Delete All** header button with a touch-friendly inline two-tap confirmation (`Delete All` → `Cancel` / `Confirm (N)`) to the **Archived & Expired Notes** modal and the Sticky Notes widget's `Trash` tab, backed by an atomic `permanentlyDeleteNotes` batch tombstone update (`db.notes.bulkPut`).
* **Permanent Reward & Chore Template Deletion Across Cloud Sync (`src/types/chores.ts`, `src/utils/choreEngine.ts`, `src/store/choreStore.ts`):**
  * Added `deletedRewardIds` and `deletedTemplateIds` tombstones to `ChoreEngineSnapshot` and updated `mergeChoreSnapshotsAuthoritative` so deleted rewards (such as default rewards) and templates never resurrect from older snapshots during cloud pulls or Realtime sync.
  * Updated `applyRemoteSnapshot` to load persisted IndexedDB state before merging on startup (instead of merging against the uninitialized in-memory `DEFAULT_CHORE_SNAPSHOT`) and reduced the chore persist listener delay from `1500ms` to `150ms`.

---

## [0.4.17] - 2026-11-10

### Calendar Feed HTTP 429 Resilience, Private Feed Caching & US Holidays Fallback
* **Built-In US Holidays Fallback (`functions/_shared/usHolidaysFallback.ts`, `functions/api/ical.ts`):**
  * Added deterministic generation of US federal and major cultural holidays so Google's `en.usa#holiday` public feed seamlessly serves holidays (`200 OK`) whenever shared Cloudflare egress IPs are throttled (`HTTP 429` / `403` / `5xx`) or time out.
* **Private & Public Edge Caching, `304` Revalidation & `stale-if-error` (`functions/api/ical.ts`, `functions/_shared/fetchExternal.ts`):**
  * Added SHA-256-keyed Edge + server caching (15 minutes for private `.ics` feeds, 6 hours for public feeds, 60s manual-refresh floor), conditional `ETag` (`If-None-Match`) and `Last-Modified` (`If-Modified-Since`) `304 Not Modified` revalidation, 12-hour `stale-if-error` retention, and upstream `Retry-After` cooldown enforcement while keeping `Cache-Control: private, no-store` on browser responses.
* **Shared Per-URL Client Cache & Cross-Canvas Cooldown (`src/services/feeds.ts`, `src/components/widgets/CalendarWidget.tsx`):**
  * Added hashed per-URL client caching across up to 16 feeds and 12 multi-canvas Calendar widgets so testing/adding private calendars in Settings, changing colors, or rotating across canvases never triggers duplicate fetches.
  * Added per-URL exponential backoff with jitter (`15m -> 30m -> 60m` on `429`) and a 12-hour transient warning grace window so temporary rate limits never spam `/api/ical` on 30s canvas rotations or display false broken-link banners over fresh cached events.

---

## [0.4.16] - 2026-11-10

### Parent Participation, Point Banks & Equal Point Splitting on Shared Family Tasks
* **Parent Profiles in the Chore & Point Engine (`src/store/choreStore.ts`, `src/services/db.ts`):**
  * Included active `parent` household profiles alongside `kid` profiles (`kid` profiles ordered first) in `mapHouseholdToChoreProfiles` so parents earn, bank, and split points equally from the ledger.
* **Shared Chore Solo & Point-Split Support (`src/components/chores/PointSplitModal.tsx`):**
  * Enabled Parents and Kids to claim solo or split points equally on Shared Family Tasks with subtle `Parent` badges for instant role clarity.
* **Clean Daily Sub-Groups & Whole-Family Scope (`src/components/chores/ChoreDashboardView.tsx`, `src/components/widgets/ChoreWidget.tsx`, `src/components/chores/ParentChoreDrawer.tsx`, `src/components/widgets/WidgetSettingsModal.tsx`):**
  * Updated Household filter labels to **Everyone**, added Parent Point Bank cards, omitted empty `Today's Chores` sub-cards for parents without personal daily templates, and preserved `Select All Kids` in the Parent Chore Drawer.

---

## [0.4.15] - 2026-11-10

### Full-Screen Chore & Reward Hub on Canvas Rotation & Tile Settings Polish
* **Full-Screen Chore & Reward Hub on Canvas (`src/components/widgets/WidgetSettingsModal.tsx`, `src/components/chores/ChoreDashboardView.tsx`, `src/components/layout/Corkboard.tsx`, `src/types/chores.ts`):**
  * Replaced the one-off overlay launcher button in Tile Settings with a persistent **Canvas Presentation Mode** (`Compact Bento Tile` vs `Full-Screen Hub on Canvas`) synced via `config.displayMode` and `freeformPos.isFullScreen`.
  * Added `mode="canvas"` to `ChoreDashboardView` so maximizing a Chores widget or selecting **Full-Screen Hub on Canvas** embeds the 3-column **Point Banks + Daily Chores + Reward Store** Hub directly onto that canvas in the board rotation loop.
  * Added Navigation Dock safe-area padding (`dockPaddingClass`), full Light & Dark canvas theme styling, and native touch scrolling across all three columns when embedded on a canvas.
* **Tile Settings Action Styling (`src/components/widgets/WidgetSettingsModal.tsx`):**
  * Updated the **Manage Chores & Profiles** action button to use neutral secondary styling instead of the emerald selected-state highlight.

---

## [0.4.14] - 2026-11-10

### Canvas Carousel Rotation Fix, Order Self-Healing & Realtime Sync Reliability
* **Canvas Order Self-Healing (`src/store/dashboardStore.ts`, `src/services/supabase.ts`):**
  * Guarded `order` indices with `Number.isFinite` across `initStore`, `addTab`, `syncRemoteTabChange`, and cloud sync payloads so null/undefined remote `order_index` values never corrupt new canvas ordering with `NaN`, and automatically repaired any affected local IndexedDB tabs.
* **Carousel Progression & Tap Reset Timing (`src/App.tsx`, `src/store/dashboardStore.ts`):**
  * Updated the carousel interval in `App.tsx` to advance from `activeTabIdResolved` and pause cleanly while any modal or drawer is open.
  * Adjusted `pauseCarouselTemporarily` so user taps reset the rotation countdown cleanly without stacking an extra 20-second pause on top of `defaultRotateDurationSec`.
* **Realtime WebSocket & Background Sync Reliability (`src/services/supabase.ts`, `src/stores/useProfileStore.ts`):**
  * Removed the `household_profiles` binding from the shared `dashboard-realtime` WebSocket channel (profiles already sync via `__ambiently_household_profiles__` in `public.widgets`), preventing `CHANNEL_ERROR` rejections on databases without the optional table.
  * Stopped `initProfileStore` from firing `profilePersistListener` on normal startup/pull reads so background `initStore` calls no longer trigger redundant cloud pushes.

---

## [0.4.13] - 2026-11-10

### Chore Widget Canvas Drag Fix, Schedule-Aware Overdue Cleanup & Header Polish
* **Chore Widget Canvas Dragging (`src/components/widgets/ChoreWidget.tsx`):**
  * Removed `data-no-drag="true"` from the root container of `ChoreWidget.tsx` so the tile can be dragged freely across the canvas while interactive chore rows and buttons remain clickable.
* **Schedule-Aware Pending & Overdue Auto-Dismissal (`src/utils/choreEngine.ts`, `src/components/chores/ChoreDashboardView.tsx`, `src/components/widgets/ChoreWidget.tsx`, `src/components/chores/ParentChoreDrawer.tsx`):**
  * Added `isDateMatchingTemplateCadence` validation in `evaluateChoreRollover` and UI filters so any `pending` instance whose `dateScheduled` no longer matches its template's configured day(s) of the week is immediately expired.
  * Updated the default weekly day selection for new specific-day weekly chores from `[1, 3, 5]` (Mon, Wed, Fri) to `[6]` (Saturday).
* **Removed Redundant Inner Maximize Button (`src/components/widgets/ChoreWidget.tsx`):**
  * Removed the duplicate inner `Maximize2` button from the `ChoreWidget` tile header.

---

## [0.4.12] - 2026-11-10

### Self-Hosting AGPLv3 Attribution & Comprehensive Documentation Refresh
* **Unobtrusive AGPLv3 Attribution Touchpoints (`src/components/dock/AmbientQuickMenu.tsx`, `src/components/settings/SettingsModal.tsx`, `src/components/changelog/ChangelogModal.tsx`, `README.md`):**
  * Added subtle `Powered by Ambiently • trinhism.com • Source (AGPLv3)` credit links inside the top-left Quick Hub popover and the Settings & Changelog modal footers while keeping the live ambient display canvas 100% watermark-free.
  * Documented the AGPLv3 Sections 7(b) and 13 Self-Hosting & Attribution Policy in `README.md`.
* **Comprehensive Documentation Refresh (`README.md`, `FEATURES.md`, `ARCHITECTURE.md`, `CHANGELOG.md`):**
  * Updated all system documentation to reflect the Ambiently Chore & Reward Engine, Global Household Profiles, client-side iOS 17/18 `.HEIC` decoding (`libheif-js`), In-App Reader Mode (`/api/reader`), and Horizontal Toolbar Pop-Out Panels.

---

## [0.4.11] - 2026-11-10

### Toolbar Horizontal Pop-Out Panels & Flexible Weekly (1× / Any Day) Chores
* **Compact Toolbar Horizontal Pop-Out Panels (`src/components/dock/NavigationDock.tsx`):**
  * Grouped the **Family Hub** (`Chores & Rewards` + `Meal Planner` preview), the **`+` Add Menu** (`New Sticky Note`, `Add Widget Tile`, `Create New Canvas`), and **Quick Utilities** (`Night Mode`, `Fullscreen`, `Refresh / Apply Update`, `Hide Toolbar`) into horizontal pop-out bars so all canvas buttons fit comfortably on smaller screens without clipping.
* **Weekly — Any Day (`1× / Week`) Chore Schedule (`src/types/chores.ts`, `src/utils/choreEngine.ts`, `src/components/chores/ParentChoreDrawer.tsx`, `src/components/chores/ChoreDashboardView.tsx`, `src/components/widgets/ChoreWidget.tsx`):**
  * Added a flexible `Weekly — Any Day (1× / Week)` cadence option (`weeklyAnyDay: true`) allowing weekly chores to be completed on any day from Sunday to Saturday for full points without becoming overdue mid-week, and automatically completing for the rest of the week once checked off.

---

## [0.4.10] - 2026-11-10

### iOS 18 HEIC Decoder Upgrade, Active Reward Store Management & 24h Overdue Auto-Dismiss
* **Upgraded HEIC/HEIF Decoder (`libheif-js` v1.23.5) (`src/utils/avatarCompressor.ts`, `src/types/libheif-js.d.ts`, `vite.config.ts`):**
  * Upgraded client-side HEIC/HEIF decoding to `libheif-js` v1.23.5 to decode modern iOS 17/18 HDR Gain Map (`tmap` / `MiHB`) `.heic` photos cleanly without Web Worker or CSP `script-src` restrictions.
* **Active Reward Store Goal Management (`src/components/chores/ParentChoreDrawer.tsx`):**
  * Added an **Active Reward Store Goals** section inside **Parent Settings (PIN) → Wishlist Pricing** so parents can remove (`Trash2`) or re-price live rewards in the Reward Store at any time.
* **24-Hour Overdue Grace Window & Manual Dismiss (`src/utils/choreEngine.ts`, `src/store/choreStore.ts`, `src/components/chores/ChoreDashboardView.tsx`, `src/components/widgets/ChoreWidget.tsx`):**
  * Overdue tasks remain actionable for a 24-hour grace window (`daysLate === 1`) and automatically transition to `expired` once past 24 hours (`daysLate > 1`), accompanied by a manual **Dismiss** button on overdue chore cards.

---

## [0.4.9] - 2026-11-09

### HEIC Avatar Cropper, Multi-Kid Chores, Web Preview Fix & Toolbar Hub Polish
* **Universal `.HEIC` / `.HEIF` Photo Upload & Interactive Avatar Cropper (`src/components/common/AvatarCropModal.tsx`, `src/utils/avatarCompressor.ts`, `src/components/common/HouseholdProfileManager.tsx`):**
  * Added an interactive circular avatar placement modal supporting drag-to-pan, zoom (`1×`–`3×`), and `90°` rotation before exporting a `256×256` WebP avatar.
* **Multi-Kid Chore Checkboxes, One-Click Duplicate & Weekly Day Badges (`src/components/chores/ParentChoreDrawer.tsx`):**
  * Added multi-kid assignment checkboxes (`Select All Kids`) to create individual chores for multiple kids in one save, a one-click **Duplicate (`Copy`)** action on existing templates, and scheduled day-of-week labels (`weekly • Sat`) on weekly chore badges.
* **Custom Keyboard Emoji Entry & Expanded Icon Presets (`src/components/chores/ParentChoreDrawer.tsx`, `src/components/common/HouseholdProfileManager.tsx`):**
  * Expanded preset icons to 36 chore icons and 24 profile icons, plus a custom emoji input supporting native OS emoji keyboards (`Win + .` / `Ctrl + Cmd + Space` / mobile emoji keyboard).
* **RSS Web Preview Service Worker Exclusion (`vite.config.ts`, `src/components/common/InAppWebViewerModal.tsx`):**
  * Added `navigateFallbackDenylist: [/^\/api\//, /^\/functions\//]` to Workbox PWA configuration and automatic stale Service Worker recovery so **Web Preview** loads the proxied article page instead of the dashboard shell.
* **Dedicated Middle Toolbar Hub & PIN Keyboard Fix (`src/components/dock/NavigationDock.tsx`, `src/components/kiosk/PinOverlay.tsx`, `src/App.tsx`):**
  * Isolated the Chores & Rewards Hub into a dedicated middle section of the Navigation Dock and fixed keyboard digit entry on the 4-digit PIN pad when multiple canvases are present.

---

## [0.4.8] - 2026-11-09

### RSS Reader Mode Image & SVG Fixes + Expanded 26-Feed Curated Directory
* **Reader Mode Full-Screen Image & SVG Overlay Fixes (`functions/api/reader.ts`, `src/components/common/InAppWebViewerModal.tsx`):**
  * Fixed an issue where Next.js `fill` images (`style="position:absolute;height:100%;width:100%;..."`) on shorter articles (e.g., on *The Verge*, *NASA*, and *GitHub Blog*) stretched across 100% of the Reader modal viewport and blocked scrolling.
  * Strips inline `style` attributes globally, promotes high-resolution `srcset` URLs over `data:` blur placeholders, removes unstyled inline `<svg>` icons and `<source>` tags, and cleans out author bio / follow popovers and NBC video playlist drawers.
  * Enforces `position: static !important; max-height: 520px; object-fit: contain;` on `.ambiently-reader-body img`.
* **Expanded 26-Feed Curated RSS Directory & Category Filters (`src/data/curatedFeeds.ts`, `src/components/widgets/WidgetSettingsModal.tsx`, `functions/api/rss.ts`):**
  * Expanded the built-in RSS feed directory from 8 to 26 live-verified feeds across 6 categories (`Featured`, `News`, `Tech`, `Science`, `Lifestyle`, `Sports & Finance`).
  * Added category filter pills and a quick search bar in the RSS Tile Settings modal, plus `<content>` / `<content:encoded>` snippet fallback in `/api/rss`.

---

## [0.4.7] - 2026-11-09

### Generic Household Sample Seeds & Settings Modal Navigation Polish
* **Generic Default Household Profiles (`src/services/db.ts`, `src/stores/useProfileStore.ts`, `src/store/choreStore.ts`):**
  * Replaced personal family names in default sample seeds with generic defaults (`Parent 1`, `Parent 2`, `Alex`, `Maya`).
  * Automatically migrates untouched legacy sample profiles in IndexedDB and strips untouched epoch-seeded legacy profiles during Supabase cloud pulls so sample names are never re-imported.
* **Settings Modal Tab Bar Layout Fix (`src/components/settings/SettingsModal.tsx`):**
  * Shortened the 5th tab label to `Household` and applied balanced flex sizing (`sm:flex-1 sm:px-2`) so the rightmost tab never clips against the right border of the modal.

---

## [0.4.6] - 2026-11-09

### Ambiently Chore & Reward Engine & Global Household Profiles
* **Global Household Profile & Avatar Engine (`src/stores/useProfileStore.ts`, `src/utils/avatarCompressor.ts`, `src/components/common/HouseholdProfileManager.tsx`):**
  * Promoted family profiles (`parent` and `kid` roles, calming low-arousal palette colors, and fallback icons) to a global system store shared across Chores and upcoming planners.
  * Added zero-dependency client-side avatar processing that center-crops and compresses uploaded photos to `256×256` WebP Data URLs synced via IndexedDB and Supabase Realtime.
* **Polymorphic Dual-View Chore & Reward UI (`src/components/widgets/ChoreWidget.tsx`, `src/components/chores/ChoreDashboardView.tsx`):**
  * **Compact Bento Tile (`variant="tile"`):** Household or Single-Profile scope, three collapsible accordions (`Today's Chores`, `Awaiting Parent Review`, `Completed Today`) with child sub-grouping, and a maximize button.
  * **Full-Screen Chore & Reward Hub (`variant="view"`):** 3-column dashboard accessible from the Navigation Dock with live pending-parent-action badges, profile point banks, daily/overdue/bounty chores, and the visual Reward Store.
* **Append-Only Audit Ledger, Midnight Rollover & Interactive Point Splitting (`src/store/choreStore.ts`, `src/utils/choreEngine.ts`, `src/components/chores/PointSplitModal.tsx`):**
  * Derives spendable `balance` and `lifetimePoints` from an immutable transaction ledger (`chore_completion`, `reward_redemption`, `manual_adjustment`, `reversion`).
  * Evaluates day boundaries automatically at `00:00:00` local time, locking past-day chores and applying per-chore overdue point policies (`full`, `half`, `zero`, `custom` %).
  * Supports interactive integer point splitting across kids for shared chores and Night-Mode-aware confetti celebrations.
* **Wishlist Pipeline, `/api/metadata` Scraper & Trophy Case (`functions/api/metadata.ts`, `src/components/chores/ProposeRewardModal.tsx`, `src/components/chores/TrophyCaseModal.tsx`):**
  * Extracts `og:title`, `og:image`, and `product:price:amount` from product URLs into a dedicated Proposals Tray (`needs_pricing`).
  * Archives fulfilled rewards into the child's Trophy Case with automatic annual pruning on calendar year rollover.
* **Unified 4-Digit Parent PIN Drawer & Kiosk Polish (`src/components/chores/ParentChoreDrawer.tsx`, `src/hooks/useIdleCursor.ts`, `src/components/settings/SettingsModal.tsx`):**
  * Added 5-tab parent drawer (Approvals with split rebalancing & *Approve All*, Wishlist Pricing Calculator, Redemptions, Audit Ledger & Bonus, and Chore Templates / Vacation Mode).
  * Fixed stationary mouse cursor visibility during Night Mode and simplified the Display & Kiosk settings panel.

---

## [0.4.5] - 2026-11-09

### Reader Mode & RSS Feed Full-Article Extraction Fixes
* **Full Article Preservation Against Readability Layout Pruning (`functions/api/reader.ts`):**
  * Fixed an issue where `@mozilla/readability` deleted `<article>` containers nested inside layout wrappers with `sidebar` modifier classes (such as Hugo Primer's `Layout--sidebarPosition-end` on *Tony's Tipbits*), which previously caused Reader Mode to show only the summary and copyright footer.
  * Added semantic `<article>` / `[itemprop="articleBody"]` and JSON-LD `articleBody` extraction fallbacks alongside Readability.
* **Restored Primary Reader & Web Proxy User-Agents (`functions/api/reader.ts`, `functions/api/web-proxy.ts`):**
  * Restored `Ambiently-Reader/1.0` and `Ambiently-Display/1.0` as the primary User-Agents and removed social crawler User-Agents from `web-proxy.ts` so feeds like BBC News and Today.com return full pages rather than link-preview stubs.
* **Direct Iframe Embedding & Rich Typography (`functions/_shared/fetchExternal.ts`, `src/components/common/InAppWebViewerModal.tsx`):**
  * Automatically detects when destination sites permit direct iframe embedding (no `X-Frame-Options` or `CSP frame-ancestors`) so **Web Preview** loads natively without proxy overhead, and added Reader Mode styles for Markdown tables, code blocks, and dividers.

---

## [0.4.4] - 2026-11-09

### Reader Mode & News Site Compatibility
* **Link Preview Fallback for Paywalled & Bot-Protected News Sites (`functions/api/reader.ts`, `functions/api/web-proxy.ts`):**
  * Added automated crawler fallback using whitelisted social link-preview headers (`facebookexternalhit/1.1`, `Slackbot-LinkExpanding 1.0`).
  * Resolves `403 Forbidden` anti-bot blocks on major news outlets (The New York Times, The Wall Street Journal, Bloomberg, etc.), allowing clean Reader Mode article extraction and web previews.

---

## [0.4.3] - 2026-11-09

### Kiosk In-App Web Viewing & Article Reader
* **Clean 'Reader Mode' Article Extractor (`functions/api/reader.ts`, `src/components/common/InAppWebViewerModal.tsx`):**
  * Added edge-powered article extraction powered by Mozilla Readability (`@mozilla/readability`) and DOM parsing (`linkedom`).
  * Formats clean headlines, byline/author, publication date, lead hero images, and formatted article text while stripping ads, scripts, and trackers.
  * Captures in-article link clicks to browse related articles directly inside reader mode without escaping kiosk mode.
* **Edge Web Proxy Fallback (`functions/api/web-proxy.ts`):**
  * Proxies target web pages server-side, stripping `X-Frame-Options` and `CSP frame-ancestors` headers that trigger browser iframe blocking (🚫) on sites like today.com, NYTimes, and CNN.
  * Injects `<base href="...">` for relative asset and stylesheet resolution, plus anti-frame-busting guards to protect kiosk display state.
* **Always-Pinned Chrome Controls (`src/components/common/InAppWebViewerModal.tsx`):**
  * Pinned top header bar with one-touch toggle pills (**📖 Reader View** / **🌐 Web Preview**), a reload button, and a prominent touch-friendly **✕ Close** button (with Esc shortcut) ensuring kiosk users are never locked out.

---

## [0.4.2] - 2026-11-09

### Calendar Trustworthiness & Feed Health
* **Fallback IANA Timezone Offset Resolution (`functions/api/ical.ts`):**
  * When third-party or school calendar feeds omit explicit `VTIMEZONE` blocks, standard IANA zone names are resolved via `Intl.DateTimeFormat` (`zoneFormatter`, `wallTimeInZoneToDate`).
  * Prevents events from being wrongly interpreted in server local time (UTC on Cloudflare Pages) and shifting on the display.
* **Ongoing & Multi-Day Event Retention (`functions/api/ical.ts`, `src/components/widgets/CalendarWidget.tsx`):**
  * Multi-day events and ongoing activities (vacations, conferences, week-long trips) remain visible while in progress across agenda and multi-day views until their actual end date.
* **Pasted Webpage URL Detection (`functions/api/ical.ts`):**
  * Checks for `BEGIN:VCALENDAR` in response payloads, returning a descriptive 422 HTTP response when an HTML calendar webpage URL was pasted instead of an `.ics` feed URL.
* **Live Feed Pre-Flight Testing (`src/services/feeds.ts`, `src/components/widgets/WidgetSettingsModal.tsx`):**
  * Testing newly entered calendar links verifies access and shows event count feedback before saving, with an "Add anyway" bypass if a feed is temporarily unreachable.
* **Feed Health Warning Banners (`src/services/feeds.ts`, `src/components/widgets/CalendarWidget.tsx`):**
  * Displays a non-intrusive warning banner at the top of the calendar widget if a feed fails to refresh, showing the error and how long ago it last succeeded.

---

## [0.4.1] - 2026-11-09

### Settings & Time Preferences
* **Clock Format (12h/24h) & Week Starts On (`src/utils/timePrefs.ts`, `src/components/settings/SettingsModal.tsx`):**
  * Added **Clock Format** (*Auto*, *12-hour*, *24-hour*) and **Week Starts On** (*Sunday*, *Monday*) options in Settings → Display & Kiosk.
  * Synchronized across all clock widgets, weather clock, world clock, and OLED night mode clock.
  * Synchronized across Calendar timeline hour gutter, agenda event timestamps, week grid header, and month view column alignment.
* **Per-Tile Error Boundary (`src/components/common/TileErrorBoundary.tsx`, `src/components/layout/Corkboard.tsx`):**
  * Wrapped canvas widgets in a React error boundary with auto-retry and manual retry button, preventing single-widget crashes from taking down the entire dashboard.

---

## [0.4.0] - 2026-11-08

### Kiosk Display & Window Management
* **In-App Web Viewer Window Frame (`src/components/common/InAppWebViewerModal.tsx`, `src/utils/linkHandler.ts`):**
  * When clicking external links (RSS articles, image banner URLs, guides) while in kiosk mode, Ambiently opens an in-app window frame modal instead of allowing the browser to spawn an uncloseable fullscreen window.
  * Features a touch-friendly **✕ Close** button, window title bar, domain badge, and keyboard `Escape` closing.
  * Includes a **Pop-out Window** button that opens pages with `popup=yes,width=1150,height=850` to force Edge into a floating window with native window chrome when an external window is desired.
* **Global Smart Link Interceptor (`src/App.tsx`):**
  * Automatically catches external HTTP/HTTPS link clicks anywhere across all widgets and modals without requiring widget-by-widget rewrites.
  * Bypasses internal routes, file downloads, and hash anchors.

---

## [0.3.29] - 2026-11-08

### Notes & Checklists
* **Uncheck Items on Duplicate Checklist Notes (`src/components/layout/Corkboard.tsx`, `src/components/widgets/StickyNotesWidget.tsx`):**
  * Duplicated notes now automatically reset all checklist item checkboxes to unchecked (`done: false`).
  * When choosing the "Edit" duplicate action, the Note Creator modal opens pre-populated with unchecked items.
  * Reset any markdown checkboxes (`- [x]`) in note content to unchecked (`- [ ]`).

### UI & Night Mode
* **Elevated Night Mode Overlay (`src/components/kiosk/NightMode.tsx`):**
  * Elevated the Night Mode dim overlay and OLED clock to layer `z-[70]`, covering the navigation dock and edge caret handle (`z-[65]`).
  * Tapping anywhere on the screen (including over the dock or caret) now wakes the dashboard cleanly without triggering navigation drawer peeks.
* **Muted Tap-to-Wake Badge & Edge Caret (`src/components/kiosk/NightMode.tsx`, `src/components/dock/NavigationDock.tsx`):**
  * Dimmed the "Night Mode (Tap to wake)" badge to ambient `opacity-35` with muted tones (`text-gray-500/80`, `text-blue-400/40`, `bg-black/60`).
  * Dimmed the hidden toolbar peek caret button to `opacity-30` with muted border and icon styling when Night Mode is active, preventing light bleed in dark rooms.

---

## [0.3.28] - 2026-11-08

### Security & Kiosk Lockdown
* **Full-Viewport Kiosk Blocker Curtain (`src/App.tsx`):**
  * Replaced the small top warning banner with a full-viewport modal barrier (`fixed inset-0 z-[9990] bg-black/95 backdrop-blur-2xl`) whenever fullscreen drops while Kid Lock is active.
  * Tapping anywhere outside the card or tapping the primary button immediately forces the browser back into full-screen display.
* **Parent PIN Challenge for Windowed Mode (`src/App.tsx`):**
  * Added an **"Enter Parent PIN to Unlock"** button on the blocker card. Entering the parent PIN sets `isUnlocked`, allowing parents to legitimately work in windowed mode or access settings.
  * Security automatically re-arms with `lockKiosk()` the moment the display returns to full-screen.
* **Keyboard Lock & Keydown Interception (`src/App.tsx`):**
  * Activated Chromium Keyboard Lock API on both `Escape` and `F11`.
  * Added global keydown interception for `Escape` and `F11` to challenge with the PIN overlay before the window can exit fullscreen.
* **Window Closure Prevention (`src/App.tsx`):**
  * Added a `beforeunload` listener while kiosk fullscreen lock is active to guard against accidental or unauthorized closing of the window/tab from the OS taskbar.

---

## [0.3.27] - 2026-11-08

### Security
* **Protected Phone Pairing & Plex Reauth (`src/App.tsx`, `src/components/dock/AmbientQuickMenu.tsx`):**
  * Enforced PIN challenge before opening the "Connect Phone (QR Code)" household sharing screen and Plex reauthentication dialog when PIN protection is active.
* **Email OTP PIN Reset (`src/components/kiosk/PinOverlay.tsx`):**
  * Removed the 4-second hold bypass button. Added **"Forgot PIN?"** with a secure 6-digit email OTP reset flow delivered to the authenticated account's email via `signInWithOtp`.
* **Cross-Board Data Isolation (`src/services/supabase.ts`, `src/store/dashboardStore.ts`):**
  * Tracked the board owner's ID in `ambiently_local_board`. When accepting an invite or switching accounts, the device replaces its local board rather than merging private notes into the shared board.

### Bug Fixes
* **PWA Offline Boot Caching (`vite.config.ts`):**
  * Fixed glob pattern in `vite-plugin-pwa` so compiled application scripts and stylesheets are properly precached in the service worker, eliminating offline blank screens.
* **Preserved Canvas Themes & Photo Lists in Realtime (`src/services/syncMerge.ts`, `src/services/supabase.ts`):**
  * Ensured canvas appearance changes mark settings dirty and incoming Realtime updates preserve local photo frame lists and canvas wallpapers.
* **Concurrent Settings Resolution (`src/services/supabase.ts`):**
  * Tracked `settings_updated_at` to prevent concurrent board edits from overwriting each other's settings.

### Performance & Database
* **Eliminated Redundant Full-Board Re-downloads (`src/services/supabase.ts`):**
  * Normalized stored timestamp comparisons to prevent false-positive revisions on polling.
  * Stopped unconditional board downloads on periodic token refresh events.
* **Statement-Level Touch Triggers (`supabase/migrations/20261109_touch_board_once_per_save.sql`, `supabase/schema.sql`):**
  * Converted the board `updated_at` touch trigger to fire once per statement rather than once per row, reducing database block reads by ~30%.

---

## [0.3.26] - 2026-11-08

### Security & Hardening
* **Edge SSRF Hardening (`functions/_shared/fetchExternal.ts`, `functions/api/*`):**
  * Hardened calendar (`/api/ical`), RSS (`/api/rss`), Google Photos (`/api/gphotos`), and Google Drive (`/api/gdrive`) edge functions with strict target validation.
  * Blocked private/internal IPv4 ranges, IPv6 literals, cloud metadata endpoints (`169.254.x.x`), decimal/hex IP encodings, and local network TLDs (`.local`, `.internal`, `.lan`, `localhost`).
  * Enforced per-hop URL validation on redirects (up to 5 hops) and added response download size and timeout cutoffs (5 MB for RSS, 15 MB for calendars, 10 MB for Google Photos/Drive).
  * Restricted cross-site execution (`Sec-Fetch-Site: cross-site`) and removed wildcard CORS headers.
* **Production Security Headers (`public/_headers`):**
  * Configured Content-Security-Policy (`script-src 'self'`), `Strict-Transport-Security: max-age=31536000`, `object-src 'none'`, and restricted `Permissions-Policy` across Cloudflare Pages deployments.
* **Media Embed Sandboxing (`src/components/widgets/MediaEmbedWidget.tsx`):**
  * Sandboxed embedded iframes with restricted permissions and enforced `https://` protocols for custom URLs.

### Performance & Database
* **Zero-IO Board Limit Triggers (`supabase/schema.sql`, `supabase/migrations/20261108_board_limit_every_write.sql`):**
  * Replaced disk-heavy full-tuple TOAST scans with per-column `pg_column_size` inspection via `private.row_size_expression`, allowing incremental quota enforcement without fetching large stored values off disk.
  * Restricted `strip_plex_tokens` triggers to only fire on writes to `settings` or `config` columns, preventing expensive regex searches on routine timestamp updates.
* **Vite Dev Server Parity (`vite.config.ts`):**
  * Replaced ~470 lines of mock server endpoints with an SSR module loader that runs the actual Cloudflare Pages functions directly in local development.

---

## [0.3.25] - 2026-11-08

### Added
* **User-Facing Sync Refusal Alerts (`src/components/common/SyncRefusedBanner.tsx`, `src/services/syncRefusal.ts`, `src/hooks/useSyncRefusal.ts`):**
  * Added `SyncRefusedBanner` that appears at the bottom of the screen (dock-aware and hidden during night mode) whenever the cloud refuses writes due to board size limits (`board_full`).
  * Provides an inline 1-click **"Try again"** button and informs users that changes remain safely saved locally on their device.
  * Updated `MobileCompanion` to switch its sync pill badge from `"Synced"` to `"Not syncing"` while changes are refused.

### Improved
* **Zero-Payload Cloud Tombstones & Priority Deletions (`src/services/supabase.ts`):**
  * Soft-deleted widgets and notes are now sent with empty configurations (`{}`) and empty contents (`""`), immediately releasing database quota rather than holding stored space for 30 days.
  * Reordered cloud synchronization to push deletions first before additions and edits, ensuring capacity is reclaimed on full boards first.
  * Expanded chunked upsert retry logic to fall back to single-row pushes across tabs, widgets, and notes, skipping refused items while letting all other changes sync cleanly.

---

## [0.3.24] - 2026-11-08

### Added
* **Smart Timed Note Duplication & Quick Time-Shift Pills (`src/components/layout/Corkboard.tsx`, `src/components/widgets/StickyNotesWidget.tsx`):**
  * Clicking **Duplicate Note** on a note with an expiration/reminder timestamp now defaults to incrementing the duplicated note's date by **+1 day** (`+1d` badge) while preserving its exact local time of day.
  * Added an inline **Duplicate Time Shift** pill bar (`+1d`, `+1w`, `Same`, `Edit`) directly in the note context menu whenever a note has a timestamp, allowing 1-click shifts or opening the Note Modal pre-filled with the copy (`Edit`).
  * Added a 1-click **Duplicate (`Copy`)** button to note cards inside the `StickyNotesWidget` tile.

---

## [0.3.23] - 2026-11-07

### Performance
* **89 KB Main Bundle Size Reduction (`src/data/version.ts`, `src/components/dock/AmbientQuickMenu.tsx`, `src/components/settings/SettingsModal.tsx`, `src/components/mobile/MobileCompanion.tsx`):**
  * Extracted `APP_VERSION` into a dedicated module (`src/data/version.ts`) so importing the version string no longer pulls the 80 KB release history array (`RELEASES`) into the main bundle.
  * Lazy-loaded `ChangelogModal` (`80.36 kB` chunk) and `ShareBoardModal` (`13.05 kB` chunk) on demand, reducing `index.js` from `433.52 kB` to `344.49 kB`.
* **Cached `Intl.DateTimeFormat` Instances & Idle Timer Elimination (`src/components/widgets/WorldClockWidget.tsx`, `src/components/widgets/CountdownWidget.tsx`, `src/components/dock/AmbientQuickMenu.tsx`, `src/components/kiosk/NightMode.tsx`):**
  * Cached `Intl.DateTimeFormat` formatters and validated IANA timezone strings in module-level `Map` caches, eliminating 54,000+ ICU object allocations per hour during 1-second clock ticks.
  * Added visibility-aware timer sleeping to `WorldClockWidget` and `CountdownWidget`.
  * Stopped hidden 1-second background timers in `AmbientQuickMenu` when closed and in `NightMode` when using the dim overlay style.
* **15-Minute Weather & RSS Caching Across Canvas Rotations (`src/services/weather.ts`, `src/services/feeds.ts`):**
  * Added 15-minute TTL in-memory + `localStorage` fallback caching to `fetchWeatherData` and `fetchRssFeed` so canvas carousel switches render weather and news feeds in 0ms without firing redundant network requests every 30 seconds.
* **LocalStorage Cache Pruning & Local Photo Blob Reclamation (`src/services/feeds.ts`, `src/services/photos.ts`):**
  * Automatically swept stale `ambiently_cal_cache_*`, `ambiently_weather_cache_*`, and `ambiently_rss_cache_*` keys from `localStorage`.
  * Tracked and revoked previous `blob:` ObjectURLs via `URL.revokeObjectURL()` whenever rescanning local photo directories.

---

## [0.3.22] - 2026-11-07

### Added
* **Automatic Tombstone Garbage Collection (`src/services/db.ts`, `src/services/supabase.ts`, `src/store/dashboardStore.ts`):**
  * Added `purgeOldTombstones(30)` to permanently purge soft-deleted tabs, widgets, and notes older than 30 days from local IndexedDB on startup.
  * Added non-blocking automatic deletion of 30-day-old soft-deleted rows in Supabase Cloud during sync, preventing database bloat.
* **Photo Cache Storage LRU Cap (`src/services/photos.ts`):**
  * Capped offline `CacheStorage` (`ambiently-photo-cache-v1`) to 50 items with automatic eviction of oldest requests, preventing unbounded disk cache growth.
* **Photo Focal Point Memory Cap (`src/components/widgets/PhotoFrameWidget.tsx`):**
  * Implemented bounded LRU caching for detected facial and focal point coordinates (`MAX_FOCAL_CACHE_ENTRIES = 250`), keeping memory strictly flat on 24/7 displays.

### Performance
* **Visibility-Aware Sleeping & Timer Optimization (`src/App.tsx`, `src/components/widgets/*`):**
  * Increased night mode schedule check interval from 5 seconds to 30 seconds, eliminating 83% of schedule interrupts.
  * Paused clock tick intervals in `ClockWidget` and `ClockWeatherWidget` when the display or tab is hidden, resuming immediately on screen wake. Reduced tick frequency when seconds are not displayed.
  * Paused background polling in `WeatherWidget`, `ClockWeatherWidget`, `RssWidget`, `CalendarWidget`, and `QuotesWidget` when the document is hidden.
* **Desktop Bundle Code-Splitting (`src/App.tsx`):**
  * Code-split `MobileCompanion` into an on-demand chunk, shaving ~20 KB off the initial bundle for wall displays and desktop screens.

---

## [0.3.21] - 2026-11-07

### Added
* **Two-Option Sign-Out Dialog (`src/components/settings/SettingsModal.tsx`):**
  * Added a confirmation decision dialog when signing out of Cloud Sync, providing two distinct workflows:
    * **Keep Local Board (Offline):** Disconnects cloud sync and session, preserving all current widgets, notes, and photos locally.
    * **Wipe & Clean Slate (Reset):** Signs out and purges IndexedDB databases, browser caches, and storage, returning the machine to a factory-fresh dashboard.

### Fixed
* **Pure Config Cloud Sync & Catalog Stripping (`src/services/supabase.ts`):**
  * Completely removed photo catalog arrays (`customPhotos` and `commonPhotos`) from the Supabase cloud sync payload, keeping database payloads strictly under 5 KB and executing backups in milliseconds.
  * Preserved local Dexie photo collections during cloud pulls, ensuring remote config sync never overwrites or empties locally scanned photo libraries.
* **Plex Total Photo Count Probe & Smart Section Picker (`src/services/plex.ts`, `src/components/photos/PhotoSourcesModal.tsx`):**
  * Fixed Plex pagination probe query (`Container-Size=1`) so Plex Media Server computes and returns the actual total photo count instead of returning 0.
  * Configured library dropdowns to automatically detect and pre-select photo libraries (`📷 Photo`) by default.

---

## [0.3.20] - 2026-11-07

### Fixed
* **Cloud Backup Payload Capping & Statement Timeout Prevention (`src/services/supabase.ts`):**
  * Sliced `customPhotos` on widgets and `commonPhotos` in settings to 250 items in the cloud JSON sync payload, reducing payload sizes from multi-megabyte blobs to ~50 KB and completely preventing PostgreSQL `statement_timeout` (8000ms) errors.
  * Chunked widget upserts into small batches of 5 with an automatic single-item fallback retry, ensuring individual large widgets cannot abort the entire backup transaction.
  * Chunked note upserts into batches of 25.
* **Supabase Disk IO & Memory Commitment Optimization (`supabase/migrations/20261107_optimize_disk_io.sql`):**
  * Provided an idempotent SQL migration replacing heavy 5-table sequential detoasting scans (`pg_column_size`) with an in-memory batch size validation check (`< 5 MB`), stabilizing memory commitment and preventing compute restarts.

---

## [0.3.19] - 2026-11-07

### Fixed
* **Shared Photos Settings Layout & Clean Card Separation (`src/components/settings/SettingsModal.tsx`):**
  * Fixed an issue where the "Show Date Taken by Default" toggle was nested inside the single-line flexbox container of `Current Shared Source`, causing the toggle card to be cramped and lopsided.
  * Separated into an independent, full-width card with theme-consistent blue accenting (`text-blue-400`, `bg-blue-600`).
* **Sleek Photo Date Taken Typography & Ambient Layout (`src/components/widgets/PhotoFrameWidget.tsx`):**
  * Replaced the boxy emerald monospace badge with an integrated ambient bullet separator (`(1/150) · Aug 15, 2023`) in soft `text-gray-300 font-normal`.
  * Moved clean picture mode date badge to a minimal, translucent glass pill in the bottom-right corner.
  * Cleaned up Mosaic 2x2 grid captions by placing date as a soft subtitle underneath the photo title.
  * Filtered out raw 4-digit numeric years from Plex photographer attributions (`Photo: 2024`).

---

## [0.3.18] - 2026-11-07

### Added
* **Photo Capture Date Taken Option (`src/components/widgets/PhotoFrameWidget.tsx`, `src/components/widgets/WidgetSettingsModal.tsx`, `src/components/layout/Corkboard.tsx`, `src/components/settings/SettingsModal.tsx`, `src/services/photos.ts`):**
  * Added a dedicated **Show Date Taken** toggle in Photo Frame Tile Settings, allowing users to show or hide capture dates for each photo.
  * Added a quick-toggle option directly in the canvas right-click context menu (`Date Taken: ON / OFF`) for instant one-click toggling.
  * Added `Show Date Taken by Default` in the Shared Photos settings tab to control the baseline display state across shared board frames.
  * Displayed capture dates across all photo display styles:
    * **Ken Burns**: Shown in the ambient header pill with a calendar badge, or as a corner timestamp in clean picture mode.
    * **Mosaic Grid**: Shown in each quadrant's caption overlay or as a corner timestamp.
    * **Polaroid**: Rendered handwritten on the bottom margin of polaroid prints.
    * **Filmstrip**: Displayed on the centered active photo.
  * Added `formatPhotoDate` helper to parse Plex EXIF timeline dates (`YYYY-MM-DD`), timestamps, and localized strings into human-readable date formats (e.g., `Aug 15, 2023`).
* **Photo Count Visibility in Photo Sources Hub (`src/components/photos/PhotoSourcesModal.tsx`):**
  * Added an emerald photo count badge (`📷 X photos loaded`) in the Photo Sources modal header.
  * Added a live server-side count indicator beside the Plex library dropdown (e.g. `4,521 photos on server`).
  * Added an Active Configured Library Banner to both Plex and Local tabs showing current library name and loaded photo counts.
  * Added a persistent scan completion banner with checkmark and photo count badge (`Scan Complete: Plex sync complete (X photos loaded)!`).
  * Updated streaming buttons to show total server counts: `Stream Entire Library (X Photos)`.

### Fixed
* **Full Plex Library Scan Pagination (`src/services/plex.ts`):**
  * Removed artificial 100-photo cutoff when querying `/all?type=13` on Plex Media Server sections.
  * Implemented container pagination in chunks of 250 (`X-Plex-Container-Start` and `X-Plex-Container-Size`) until all photos are retrieved, streaming batches progressively into the dashboard.

---

## [0.3.17] - 2026-11-07

### Fixed
* **Supabase Disk IO Budget & Burst Credit Preservation (`src/App.tsx`, `src/services/supabase.ts`, `supabase/schema.sql`):**
  * **Smart Realtime & Visibility Polling:** Replaced aggressive unconditional 60s full-table polling with smart revision polling that pauses when tabs are hidden, backs off to 10 minutes when Realtime WebSockets are connected, and checks lightweight `dashboards.updated_at` timestamps (1 row, 1 column, 20 bytes) before querying tables.
  * **Strict Push Deduplication:** Fixed a timestamp comparison bug (`>= remoteTime` changed to `> remoteTime`) in `pushToCloud()`. Only records that are genuinely new or newer locally are pushed to PostgreSQL, reducing write operations by 95%+.
  * **In-Memory Target Cache:** Added a 3-minute in-memory cache for `resolveActiveDashboardId` to eliminate repeated `dashboard_members` and `dashboards` queries on every sync cycle.
  * **Database Composite Indexes & Triggers:** Added `(dashboard_id, updated_at desc)` composite indexes, an automatic `touch_dashboard_updated_at` trigger across tabs/widgets/notes, and replaced expensive 5-table detoasting scans in `private.check_board_limits()` with an in-memory batch size guard.

---

## [0.3.7] - 2026-11-06

### Fixed
* **Plex Nested Subfolder & PhotoAlbum Traversal (`src/services/plex.ts`):**
  * Fixed an issue where selecting a parent folder in Plex (such as `Photos / Personal`) only loaded the loose photos directly inside that folder and skipped nested year/event subfolders (`2011`–`2024`).
  * Diagnosed that Plex Media Server returns nested folders and photo albums (`type: "photoalbum"`) inside `MediaContainer.Metadata` rather than `MediaContainer.Directory`.
  * Added `getContainerEntries()`, `isPlexDirectoryItem()`, and `getPlexDirectoryTargetKey()` so recursive breadth-first traversal (up to 15 levels deep) inspects both `Directory` and `Metadata` arrays, automatically resolves `/children` paths, and discovers all thousands of nested photos.
  * Increased batch metadata enrichment size from 25 to 50 items per request for faster scanning of large libraries.
* **Mobile Settings & Photo Sources Tab Visibility (`src/components/settings/SettingsModal.tsx`, `src/components/photos/PhotoSourcesModal.tsx`):**
  * Replaced hidden horizontal scrolling (`overflow-x-auto no-scrollbar`) on mobile viewports with a responsive `grid-cols-5` (Settings) and `grid-cols-4` (Photo Sources) icon + label layout so every settings tab (**Canvases**, **Display**, **Photos**, **Sync**, **Security**) is immediately apparent at a glance without scrolling.

---

## [0.3.6] - 2026-11-06

### Added
* **Multi-Display Local Folder Notice & Plex Guidance (`src/components/photos/PhotoSourcesModal.tsx`):**
  * Added a prominent informational notice to the Local Folder photo source settings explaining that browser-sandboxed local PC and mapped NAS folders are restricted to the local device and cannot be read across secondary synchronized displays.
  * Added 1-click tab switching to Plex Media Server to guide users towards streaming NAS photos to multiple household kiosks and companion screens.

### Fixed
* **Night Mode Command Center Floating Panel Dismissal (`src/components/dock/AmbientQuickMenu.tsx`, `src/components/dock/NavigationDock.tsx`):**
  * Fixed an orphaned UI state bug where clicking the Night Mode card in the Ambient Command Hub floating HUD collapsed the navigation toolbar but left the command center panel stranded open over the dimmed night screen.
  * Added immediate `onClose()` on Night Mode toggle and enforced automatic closure of quick menus and organize popovers whenever Night Mode activates.

---

## [0.3.5] - 2026-11-06

### Security
* **Resolved PostgreSQL RLS Infinite Recursion (`supabase/schema.sql`):**
  * Moved all cross-table authorization checks into a dedicated `private` Postgres schema with `SECURITY DEFINER` functions (`can_read_dashboard`, `owns_dashboard`, `can_edit_dashboard`, `dashboard_owner`, `is_me`) and locked empty `search_path = ''`.
  * Completely eliminated the circular policy evaluation between `dashboards` and `dashboard_members` that previously caused PostgreSQL to halt with `infinite recursion detected in policy`.
* **Explicit Invitation Consent & Hijack Prevention (`src/services/supabase.ts`, `src/components/settings/ShareBoardModal.tsx`):**
  * Added `accepted_at` timestamp column to `dashboard_members`. Adding an email to household members now creates an unaccepted invitation granting zero access to the board.
  * Prevented silent dashboard hijacking: `resolveActiveDashboardId` now ignores unaccepted invitations (`accepted_at is not null`), ensuring external users cannot pull someone else's device onto their board without explicit consent.
* **Interactive Board Invitations UI (`src/components/settings/ShareBoardModal.tsx`):**
  * Added **Board Invitations** management in the Sync & Backup settings showing inviting owners, board titles, and explicit **Accept**, **Decline**, and **Leave** buttons.
* **Multi-User Composite Primary Keys (`supabase/schema.sql`):**
  * Changed primary keys for `tabs`, `widgets`, and `notes` to composite `(dashboard_id, id)` so multiple accounts can sync default IDs without primary key collision errors.
* **SQL LIKE Wildcard Leak Fix (`src/services/supabase.ts`):**
  * Replaced `.ilike('email', ...)` with exact lower-case `.eq('email', ...)` to prevent `_` and `%` wildcard characters from unintentionally matching user emails.
* **Least Privilege Grants & Realtime Hygiene (`supabase/schema.sql`):**
  * Revoked all table permissions from `anon` and `PUBLIC`, prevented table `TRUNCATE` from authenticated users, and restricted member updates strictly to `accepted_at`.
  * Dropped `dashboards` and `dashboard_members` from the `supabase_realtime` publication since client devices only listen to `tabs`, `widgets`, and `notes`.
* **Security Verification Audit Script (`supabase/security-check.sql`):**
  * Added a comprehensive read-only SQL script that verifies 13 RLS and grant invariants and flags any un-cleared Plex tokens or open permissions.

---

## [0.3.4] - 2026-11-06

### Fixed
* **Night Mode Initialization Race Condition (`src/App.tsx`):**
  * Prevented uninitialized default settings from overwriting Dexie and syncing to Supabase when a user reloads the app during night schedule hours (between 22:00 and 07:00).
  * Added `if (!isInitialized || settings.nightScheduleEnabled === false) return;` guard to guarantee local storage settings are loaded first.
* **Atom RSS Feed Crash (`functions/api/rss.ts`):**
  * Handled typed Atom title and summary elements (e.g. `<title type="html">` or numeric nodes) parsing as objects by extracting plain text via `textOf()`, fixing HTTP 500 crashes on Atom feeds like The Verge.
* **Recurring Calendar Event Disappearance & Overrides (`functions/api/ical.ts`):**
  * Fast-forwarded repeating event calculation using `iterator.fromUnixTime()` to bypass past occurrences up to a 20,000 occurrence cap, preventing daily events older than 10 months from vanishing.
  * Correctly incorporated recurrence exceptions/rescheduled instances (`RECURRENCE-ID`) and dropped `STATUS:CANCELLED` instances.
* **Calendar Cache Resilience (`src/services/feeds.ts`):**
  * Retained previously cached events when a single calendar feed fails or times out, preventing the calendar widget from turning blank during temporary network outages.
* **Midnight Event Boundary (`src/components/widgets/CalendarWidget.tsx`):**
  * Fixed midnight-ending events (00:00:00) so they do not spill over and duplicate onto the following day.
* **Canvas Auto-Rotation & Timer Reset (`src/App.tsx`, `src/store/dashboardStore.ts`):**
  * Fixed canvas rotation timers resetting every 60 seconds on cloud refresh, applied the user-selected Rotation Interval setting, and introduced `rotateToTab()` to prevent automated switches from activating the 20-second manual interaction pause.
* **Empty Board Re-Seeding (`src/store/dashboardStore.ts`):**
  * Fixed store initialization logic so intentionally deleting all widgets or sticky notes leaves the board empty instead of restoring default demo widgets on reload.
* **Firefox & Safari Local Folder Picker (`src/services/photos.ts`):**
  * Corrected relative path depth handling so root-level images within picked directories are recognized alongside subdirectories across all browsers.

### Added
* **Automatic Night Schedule Switch (`src/components/settings/SettingsModal.tsx`, `src/types/dashboard.ts`):**
  * Added a user setting to enable or disable automatic night schedule dimming.
  * Preserved manual night mode overrides triggered outside schedule hours until tapped.

---

## [0.3.3] - 2026-11-06

### Security
* **Zero-Trust Security Architecture & Complete Removal of Public QR/Invite Codes (`supabase/schema.sql`, `src/services/supabase.ts`, `src/components/settings/ShareBoardModal.tsx`):**
  * **Removed Unauthenticated Invite Codes & Session Token QR Links:** Completely eliminated public 6-character `invite_code` sharing (`?join=CODE`) and raw session token QR URLs (`#access_token=...`) so no anonymous visitor or stolen link can ever read or modify a dashboard.
  * **Zero-Trust Authenticated RLS Policies (`supabase/schema.sql`):** Replaced `invite_code is not null` public policies with strict `to authenticated` PostgreSQL Row-Level Security policies. Access to `dashboards`, `tabs`, `widgets`, and `notes` now requires a cryptographically verified Supabase JWT matching either the board owner (`auth.uid() = user_id`) or an explicitly authorized household email (`lower(dashboard_members.email) = lower(auth.jwt()->>'email')`).
  * **Verified Household Email Accesslist (`ShareBoardModal.tsx`):** Replaced the QR/join code modal with an authenticated Household Email Accesslist where owners can authorize or revoke specific family emails (e.g., spouse/partner) who sign in via Email OTP verification.
  * **Local Kiosk PIN Isolation:** Stripped `pinHash` before pushing settings to Supabase Cloud (`pushToCloud`) so device kiosk PIN hashes remain strictly local.
  * **Serverless Proxy SSRF & Private Cache Hardening (`functions/api/ical.ts`, `rss.ts`, `gphotos.ts`, `gdrive.ts`):** Changed `/api/ical` response headers from `Cache-Control: public` to `Cache-Control: private, no-store` so private calendars are never cached on public CDN edge nodes, and added strict HTTPS protocol and SSRF private-IP/host validation across all 4 Cloudflare Pages Functions.

---

## [0.3.2] - 2026-11-06

### Added
* **Local Folder Subdirectory Multi-Select & Year Presets (`src/services/photos.ts`, `src/components/photos/PhotoSourcesModal.tsx`):**
  * **Interactive Subfolder Multi-Selection:** When picking a parent folder containing decades of archived photos (e.g. `media\personal\2011`, `media\personal\2012` ... `media\personal\2020`), Ambiently now immediately detects all subdirectories and opens an interactive subfolder selection checklist.
  * **1-Click "Last 5 Years" & "Last 3 Years" Presets:** Automatically detects year-formatted folders (e.g. `2020`–`2024`) and selects the 5 or 3 most recent years with a single click, allowing users with 20+ years of photos to effortlessly isolate recent years.
  * **Search & Subdirectory Filtering:** Added instant search filtering to quickly locate specific years or events within large photo collections.
  * **Selective Folder Scanning:** Scans only the checked subdirectories (`scanSelectedSubfolders`), creating clean labeled folder entries in the selection list and avoiding unwanted historical archives.

### Security
* **Strict Realtime Isolation & Private Calendar Protection (`src/App.tsx`, `src/services/supabase.ts`, `src/components/settings/ShareBoardModal.tsx`):**
  * **Eliminated Unauthenticated Realtime Broadcast Leak:** Prevented unauthenticated visitors on the root domain (`https://dashboard.trinhism.com/`) from subscribing to global Supabase Realtime `postgres_changes` events. Previously, `subscribeToRealtimeBoard('default', ...)` subscribed to unfiltered `widgets`, `notes`, and `tabs` changes on boot, allowing live dashboard pushes to leak across open anonymous sessions.
  * **Dashboard-Scoped Realtime Filters:** Enforced explicit `filter: dashboard_id=eq.${boardId}` and payload `dashboard_id` verification on all Realtime channels, and disabled Realtime completely unless the user is authenticated or has explicitly joined a board via invite code.
  * **Owner-Only Private Calendar Feeds:** Added `sanitizeWidgetForGuest` to strip private Google/Apple/Outlook `.ics` calendar feed URLs whenever syncing widgets to unauthenticated guest devices joined via code.
  * **Clipboard Session Token Guard & Invite Code Reset:** Prevented the Share Board modal from copying raw Supabase `access_token` / `refresh_token` hashes to the clipboard, and added a 1-click **Reset Code** button (`rotateInviteCode`) to revoke old invite codes immediately.

### Fixed
* **Plex High-Resolution & Direct Play Photo Streaming (`src/services/plex.ts`, `src/services/photos.ts`):**
  * **Eliminated Blurry Plex Photos:** Diagnosed the root cause of blurry Plex photos—Plex folder listings omit the `Media[0].Part[0].key` in directory responses, causing image URLs to fall back to Plex's tiny pre-rendered thumbnails (`item.thumb`, ~256x256), which were then upscaled (`upscale=1`) to 1080p, resulting in heavily pixelated and blurry images.
  * **Direct Play Full Camera Resolution:** For all standard web image formats (JPEG, PNG, WebP), `PhotoItem.url` now directly streams the original uncompressed image file via `${cleanUri}${partKey}?X-Plex-Token=...`. Photos display with 100% native camera sensor fidelity with zero compression artifacts and zero CPU transcoding load on the Plex server.
  * **4K Transcoding & Upscaling Guard:** Upgraded transcode bounds from 1080p to full 4K UHD (`3840x2160`), enabled near-lossless JPEG quality (`quality=95`), and disabled upscaling (`upscale=0`) so images are never artificially stretched beyond their native pixels.
  * **Batch Metadata Enrichment (`enrichPlexPhotoItemsWithParts`):** When traversing folders or section listings where Plex omits `Media` parts, Ambiently now automatically batch-resolves full item metadata (`/library/metadata/{ids}?includeDetails=1&checkFiles=1`) to ensure every photo is paired with its original media part key.
  * **RAW & HEIC Seamless Fallback:** For non-browser-native formats (e.g. iPhone HEIC/HEIF, DSLR RAW .CR2, .NEF, .ARW, .DNG), transcode converts them to pristine 4K JPEGs with direct stream as fallback.
  * **Transcoder URL Optimization (`src/services/photos.ts`):** `getOptimizedPhotoUrl` now dynamically tunes Plex `/photo/:/transcode` requests when loading tiny modal/picker previews (`<= 600px`), saving bandwidth while preserving full 4K resolution on smart-display widgets.

---

## [0.3.1] - 2026-11-06

### Fixed
* **Plex Recursive Photo Discovery & Deep Folder Traversal (`src/services/plex.ts`):**
  * Fixed Plex photo loading when parent directories are selected (e.g., `Photos > Personal > 2018 > pictures.jpg`). Previously, parent directories returned only child directory cards (`Old`, `Wallace Falls`, etc.) rather than the pictures inside them.
  * Implemented breadth-first recursive directory traversal (`getPlexPhotosFromSection`) that automatically explores child folders and sub-subfolders (up to 12 levels deep) to gather all leaf photo items.
  * Removed arbitrary photo limits: Plex photo scanning now supports **unlimited** photos (`maxPhotos = Infinity`) with live progress reporting, allowing users with 10,000+ photo libraries to load every picture.
  * Enhanced `getPlexSectionFolders` to discover immediate subdirectories (`depth: 1`) so users can optionally select specific subfolders (e.g. `Personal ❯ 2018`) directly from the dropdown.
* **Plex Image Transcode URL Resolution & Fallback (`src/services/plex.ts`, `src/components/widgets/PhotoFrameWidget.tsx`):**
  * Fixed Plex `/photo/:/transcode` target URLs: previously used `item.key` (`/library/metadata/{ratingKey}` which is an API endpoint), causing HTTP 400/500 transcode errors and triggering continuous photo cycling in `PhotoFrameWidget`.
  * Now properly resolves `item.Media[0].Part[0].key || item.thumb` as the transcode image resource.
  * Added `fallbackUrl` support pointing directly to the raw Part key on Plex Media Server (`${cleanUri}${partKey}?X-Plex-Token=...`).
  * Updated `PhotoFrameWidget` (Ken Burns, Mosaic, Polaroid, Filmstrip) to automatically fallback to `photo.fallbackUrl` on error before advancing, and added a guard to prevent runaway cycling if a remote server is unreachable.
* **Photo Sources Modal & Display (`src/components/photos/PhotoSourcesModal.tsx`):**
  * Added indented subfolder rendering in the folder dropdown (`↳ 📁 2018`) and updated source labels to reflect the full path (e.g. `Plex (Server - Photos / Personal / 2018)`).

---

## [0.3.0] - 2026-11-06

### Added
* **One-Tap Mobile Companion QR Pairing (`src/services/supabase.ts`, `src/components/settings/ShareBoardModal.tsx`):**
  * Added session token pairing to the QR code when logged in on desktop: encodes a secure auth transfer fragment (`#access_token=...&refresh_token=...`) so phone cameras instantly log in with zero typing required on mobile.
  * Prunes initial seeded starter template notes (*"Welcome to Ambiently"*, *"Weekly Essentials"*) and default placeholder widgets on first login so the phone cleanly mirrors the user's actual cloud dashboard.
* **Multi-Tier Household Roles: Admin vs Family/Kids Mode (`src/components/settings/ShareBoardModal.tsx`):**
  * Added dedicated pairing tabs in the Mobile Connect modal:
    * **Pair My Phone / Spouse (Admin)**: Full admin companion controls for managing boards, calendar feeds, Plex tokens, and cloud backups.
    * **Kids & Family (Safe Member Mode)**: Zero account or email required! Kids scan or enter a 6-character code on their phone or tablet to check off chores and add notes without admin access.
* **Two-Way Live Sync for Unauthenticated Family Members (`src/store/dashboardStore.ts`, `src/services/supabase.ts`):**
  * Allowed unauthenticated devices joined via invite code to push note updates (`pushNotesToJoinedBoard`), enabling kids to toggle checklist chores and add notes from their phones with instant live updates on the wall display.
  * Added wake-up re-sync for joined family members on mobile screen unlock.
* **Interactive Mobile Connection & Inline Cloud Activation (`src/components/mobile/MobileCompanion.tsx`, `src/components/settings/ShareBoardModal.tsx`):**
  * Replaced the dead-end unauthenticated QR box with an informative feature card explaining why Cloud Sync enables mobile control, including an embedded 1-step sign-in form directly in the modal.
  * Added an unconnected phone banner and interactive "Enter 6-Digit Join Code" modal in Mobile Companion, plus a live Household Member badge with 1-click disconnect.

---

## [0.2.9] - 2026-11-06

### Added
* **Multiple Plex Photo Library Discovery & Flexible Classification (`src/services/plex.ts`):**
  * Removed strict `d.type === 'photo'` filter from `getPlexPhotoLibraries`, expanding discovery to support all photo and personal media library types (`photo`, `photos`, `picture`, `pictures`, `image`, `photoalbum`, and `homevideo` / Personal Media / Other Videos).
  * Added `isLikelyPhotoLibrary` helper that inspects section types, scanner names (`Plex Photo Scanner`), agents, and title keywords.
  * Enhanced library response to include all available server library sections with categorized `optgroup` sections ("Photo & Personal Media Libraries" and "Other Server Libraries"), ensuring users with multiple photo collections or home video libraries can select from all of them.
* **Plex Subfolder & Album Drill-Down (`src/services/plex.ts`, `src/components/photos/PhotoSourcesModal.tsx`):**
  * Added `getPlexSectionFolders` to discover folders (`/library/sections/{id}/folder`) and albums (`/library/sections/{id}/all?type=14`) within any selected library section.
  * Added optional "Folder / Album" dropdown selector in the Plex tab, enabling users whose photos are organized into subfolders/albums within a single section (e.g. Vacation, Family, Holidays) to stream either a specific subfolder or the entire library.
  * Updated `getPlexPhotosFromSection` to support `folderOrAlbumKey`, with flattened `type=13` photo retrieval and fallback handling.
  * Added live scan indicator and a 1-click library refresh button to re-scan libraries on the connected server instantly.
* **Contextual Photo Source Display & Stale URL Prevention (`src/components/widgets/WidgetSettingsModal.tsx`, `src/store/dashboardStore.ts`):**
  * Resolved confusing UI where a previously configured Google Drive URL persisted and rendered underneath the Plex badge in the Widget Settings Modal and the "Make Shared" promotion card.
  * Implemented type-aware source rendering: displays `📺 Plex Media Server: [Library Name]` (amber) for Plex, `📁 Local Storage: [Folder Name]` (emerald) for Local, and reserves `🔗 [URL]` strictly for Web / Google Drive sources.
  * Automatically purges stale web URLs from `commonPhotoSourceUrl` and tile `sourceUrl` whenever switching to Plex, Local, or Curated sources.
* **Per-Widget vs Shared Board Library Scoping (`src/components/photos/PhotoSourcesModal.tsx`, `src/components/layout/Corkboard.tsx`, `src/components/mobile/MobileCompanion.tsx`):**
  * Updated the Photo Sources Modal footer toggle so users can explicitly choose between "Apply to all photo frames (Shared Board Library)" and "Apply to this widget only (Tile-Specific Album)".
  * Allows multiple photo widgets on the same or different boards to independently stream from distinct Plex libraries, albums, or local folders without overwriting other frames.

---

## [0.2.8] - 2026-11-06

### Improved
* **Standard 4-Character TV PIN Pairing (`src/services/plex.ts`):**
  * Removed `strong=true` parameter when requesting PINs from `https://plex.tv/api/v2/pins`, ensuring Plex generates a genuine 4-character TV link code (`[P][X][X][J]`) matching `plex.tv/link`.
  * Eliminated 25-character hash overflow that previously pushed the QR code and PIN container across card boundaries.
* **One-Tap QR Code Auto-Link (`src/components/photos/PhotoSourcesModal.tsx`, `src/services/plex.ts`):**
  * Upgraded QR code generator to encode `https://plex.tv/link?pin=CODE`, enabling phone cameras to scan and automatically pre-fill the PIN on Plex's pairing page without manual typing.
* **Refined Character Tile Layout & Actions (`src/components/photos/PhotoSourcesModal.tsx`):**
  * Rendered the PIN as four distinct, illuminated square monospace character tiles.
  * Added 1-click "Copy" button with checkmark feedback.
  * Added direct "Open plex.tv/link" action button and "New Code" refresh trigger with graceful waiting indicator.

---

## [0.2.7] - 2026-11-06

### Fixed
* **Multi-Device Last-Write-Wins (LWW) Timestamp Protection (`src/store/dashboardStore.ts`):**
  * Added timestamp comparisons on incoming Supabase Realtime WebSocket events (`syncRemoteWidgetChange`, `syncRemoteTabChange`, `syncRemoteNoteChange`).
  * If a remote event has an `updated_at` older than the local record in memory/Dexie, the stale event is ignored. This guarantees that moving a widget on Screen A is never stomped or reverted by delayed broadcasts from Screen B.
* **Non-Stomping Cloud Push (`src/services/supabase.ts`):**
  * In `pushToCloud`, remote timestamps (`updated_at`) are queried before performing upserts.
  * Only records that are newly created locally or have a timestamp newer than or equal to the remote record are included in the upsert batch, preventing an idle or lagging device from overwriting fresher edits in Supabase Cloud.
* **Timestamp-Aware Dexie Pull (`src/services/supabase.ts`):**
  * Replaced blind destructive `db.*.clear()` in `pullFromCloud` with non-destructive, timestamp-aware record merging.
  * Local modifications made prior to a background poll or wake sync are preserved.
  * Seeded default templates with epoch timestamps (`1970-01-01T00:00:00.000Z`) that do not exist in the cloud are safely cleaned up so second displays cleanly adopt the remote board without retaining unreferenced default widgets.
* **Active Canvas Preservation During Background Sync (`src/store/dashboardStore.ts`):**
  * Updated `initStore` to preserve the user's currently active canvas (`activeTabId`) if it remains valid, preventing background sync polls, auth updates, or display wakeups from resetting the user back to the home canvas.

---

## [0.2.6] - 2026-11-06

### Fixed
* **Supabase Table RLS Write Permissions for Widgets & Tabs (`supabase/schema.sql`):**
  * Fixed Row Level Security (RLS) policies on `public.tabs` and `public.widgets` which were previously defined as `FOR SELECT` only, blocking all client `INSERT`, `UPDATE`, and `UPSERT` operations with PostgreSQL 42501 RLS violations.
  * Added `FOR ALL USING (...) WITH CHECK (...)` policies to both `tabs` and `widgets` allowing authenticated users and dashboard editors to write, update, and persist new widgets (including Quotes, Countdowns, Calendars, and Custom Canvases).
* **Decoupled Foreign Key Constraint on Widgets (`supabase/schema.sql`):**
  * Removed strict `widgets_tab_id_fkey` constraint on `public.widgets.tab_id` to prevent foreign key rejections when synchronizing decoupled tabs and widgets across machines.
* **Strict Error Handling in Cloud Push & Pull (`src/services/supabase.ts`):**
  * Added explicit error checking on every Supabase upsert and query call, throwing on error instead of silently returning `{ success: true }`, ensuring any database or network issues are clearly surfaced to the user.
* **Full Mirror Cloud Restore (`src/services/supabase.ts`):**
  * Enhanced `pullFromCloud` to cleanly replace local Dexie store with cloud widgets and tabs upon restore, guaranteeing second machines accurately reflect the latest remote board without retaining unreferenced default widgets.

---

## [0.2.5] - 2026-11-06

### Added
* **Continuous Night Schedule Window Evaluation (`src/utils/nightMode.ts`, `src/App.tsx`):**
  * Replaced exact-minute check with continuous `isTimeInNightWindow()` evaluation, correctly handling schedules that cross midnight (e.g. `22:00` -> `07:00`).
  * Booting, reloading, or interacting with the kiosk at 23:30 or 03:00 reliably recognizes that it is within the active night schedule.
* **2-Minute Inactivity Wake Re-Engage (`src/App.tsx`):**
  * Waking the display during night mode temporarily disengages the overlay and begins an inactivity timer (defaulting to 2 minutes).
  * Active screen interactions (touches, clicks, keypresses) continuously reset and extend the 2-minute timer while in use.
  * Once idle for 2 minutes, if the current time is still within the night window, Night Mode seamlessly re-engages without requiring manual toggling.
  * At morning wake time (`07:00`), Night Mode automatically disengages for the day.
* **Configurable Wake Timeout Options in Settings (`src/components/settings/SettingsModal.tsx`, `src/types/dashboard.ts`):**
  * Added selectable wake timeout under **Settings → Kiosk & Ambient Display**: `1 min`, `2 mins (Default)`, `5 mins`, `10 mins`, or `Until Morning`.
* **Real-Time Cross-Device Auto-Sync (`src/services/supabase.ts`, `src/store/dashboardStore.ts`, `src/App.tsx`):**
  * Added 1.2-second debounced background auto-push to Supabase Cloud on any tile, note, canvas, or setting mutation.
  * Extended Supabase Realtime WebSocket subscription to listen for postgres changes on `widgets`, `tabs`, and `notes`, broadcasting changes to other devices in real time (< 1.5s).
  * Added initial cloud pull on startup, on-wake (`visibilitychange`) sync, and 60-second fallback polling for always-on wall displays.
* **12 New Canvas Icons (`src/data/canvasIcons.ts`, `src/components/dock/NavigationDock.tsx`, `src/components/dock/CreateCanvasModal.tsx`):**
  * Added `Utensils` (Kitchen), `ChefHat` (Cooking), `Briefcase` (Work), `GraduationCap` (School), `Dumbbell` (Fitness), `ShoppingCart` (Shopping), `Compass` (Travel), `Baby` (Family), `Gamepad2` (Gaming), `CloudSun` (Weather), `Lightbulb` (Ideas), and `Bell` (Alerts).

---

## [0.2.4] - 2026-11-06

### Added
* **Multi-Day Calendar Layout Choice — Timeline Grid vs. Chronological Cards (`src/components/widgets/CalendarWidget.tsx`):**
  * Added user-selectable layout toggle for 3-day and week calendar views: choose between a 24-Hour Timeline Grid (with hour lines, time gutter, and red current-time marker) or Chronological Cards (cards stacked in order of time).
  * Added 1-click `[ Cards | Timeline ]` toggle button directly in the calendar widget header and persistent preference in widget settings.
* **Mosaic Photo Widget with Ken Burns Zoom & Focus Interactivity (`src/components/widgets/PhotoWidget.tsx`):**
  * Added optional Ken Burns cinematic zoom and slow pan for Mosaic collage photo frames.
  * Added interactive click-to-focus on quadrants with smooth transition indicators.
* **Realtime App Version Update Detection & 1-Click Refresh Banner (`src/services/updateChecker.ts`, `src/components/common/UpdateNotificationBanner.tsx`):**
  * Built automatic version polling against `/version.json` and Service Worker status every 5 minutes and on screen wake.
  * Floating notification banner alerts users when a new version is published with a 1-click "Refresh Now" action.
  * Added dedicated refresh button in the navigation dock and settings system tab with notification badge when updates are ready.
* **Expanded OTP Verification (`src/services/supabase.ts`, `src/components/settings/SettingsModal.tsx`):**
  * Expanded OTP verification input to support 6 to 10 digit Supabase authentication codes alongside magic links.
* **Canvas Theme & Wallpaper Cloud Sync (`src/services/supabase.ts`, `src/store/dashboardStore.ts`):**
  * Preserved per-canvas themes, custom wallpaper URLs, and dim levels across Supabase Cloud sync.
* **PIN Lock Cleanup (`src/services/fileSync.ts`, `src/store/dashboardStore.ts`):**
  * Purged lingering PIN lock states during backup export, restore, and PIN disable.

---

## [0.2.3] - 2026-11-05

### Added
* **Card-based Day Columns for Calendar 3-Day & Week Views (`src/components/widgets/CalendarWidget.tsx`):**
  * Redesigned the 3-day and week view modes into clean, card-based day columns matching the readability and design language of Agenda and Month views.
  * Eliminated the cramped 24-hour vertical timeline grid, replacing it with chronologically stacked event cards (All-Day banners + timed events with start/end times, bold titles, locations, and calendar badges).
  * 3-Day View features full-width card columns with rich date headers, "Today" badge, event count pills, and detailed agenda cards.
  * Week View features a 7-column card layout with weekday headers, date pills, compact event cards, and horizontal scroll preservation on narrow viewports (`min-w-[560px]`).
  * Day column headers and event cards link directly to the interactive `selectedDayDetail` popup with full event details.
* **Light Mode & Daylight Theme Support in Calendar Modal (`src/components/widgets/CalendarWidget.tsx`):**
  * Added complete `isLight` theming across day column cards, borders, headers, and the `selectedDayDetail` agenda popup.

---

## [0.2.2] - 2026-11-05

### Added
* **Rich JSON-LD `@graph` Structured Data (`index.html`):**
  * Upgraded structured data to a multi-entity `@graph` combining `WebApplication` (with `featureList`, `softwareVersion`, `codeRepository`, `screenshot`, and `alternateName`) and `FAQPage` targeting long-tail smart display search queries.
* **Semantic Crawler & Screen-Reader Heading Hierarchy (`index.html`, `src/App.tsx`):**
  * Added an accessible `sr-only` `<header><h1>` in `App.tsx` so desktop and tablet views expose a primary `<h1>` heading to crawlers and screen readers.
  * Expanded `<noscript>` fallback in `index.html` with structured `<h1>`/`<h2>` feature breakdowns covering Multi-Canvas Corkboard, Unified iCal Calendars, Photo Frames, Local-First Persistence, and Kiosk Protection.
* **Core Web Vitals Code-Splitting (`vite.config.ts`, `src/App.tsx`):**
  * Converted heavy secondary modals (`SettingsModal`, `LocalBackupModal`, `AddWidgetModal`, `CreateCanvasModal`) to `React.lazy()` dynamic imports wrapped in `<Suspense>`.
  * Configured Rollup/Rolldown `manualChunks` to split `ical.js`, `@supabase`, `framer-motion`, `lucide-react`, and `dexie` into dedicated vendor bundles, eliminating Vite's >500 kB chunk warning and improving initial LCP/INP.
* **PWA Precache & Brand Asset Compression (`scripts/generate-icons.js`, `vite.config.ts`):**
  * Added `sharp` PNG palette compression (`compressionLevel: 9, palette: true`) across generated icons and Open Graph banners, cutting image weights by ~65%.
  * Removed duplicate `icon-192.png` and `icon-512.png` files and excluded `og-banner.png` and `/assets/*` from Workbox precaching.
  * Automated build-time synchronization of `sitemap.xml` `<lastmod>` and `index.html` `softwareVersion`.
* **Image Attributes & Crawl Hygiene (`public/robots.txt`, `SupportPanel.tsx`, `SettingsModal.tsx`, `ChangelogModal.tsx`, `MobileCompanion.tsx`):**
  * Added `Disallow: /*?join=` to `robots.txt` to prevent duplicate query-string indexing.
  * Added explicit `width`, `height`, and `loading="lazy"` attributes to UI and modal `<img>` elements.

---

## [0.2.1] - 2026-11-05

### Added
* **Persistent PC Auto-Sync Across Sessions (`fileSync.ts`, `LocalBackupModal.tsx`, `SettingsModal.tsx`, `App.tsx`):**
  * Stored `FileSystemFileHandle` inside IndexedDB so Ambiently automatically remembers your bound `ambiently-data.json` file across browser reloads without requiring folder browsing.
  * Added silent permission checks on startup via `queryPermission()`.
  * Added 1-click **Reconnect Auto-Sync** action when browser security policies require user re-authorization after reload.
  * Added real-time reactive `useFileSync()` hook with color-coded status badges (`Connected`, `Paused (Reloaded)`, `Unsupported`, `Optional`).
  * Added manual **Sync Now** button to force immediate snapshot writes to disk on demand.
  * Added clean **Disconnect** / **Unlink** buttons to release the file handle cleanly without altering the file on disk.
* **Queued Safe Writes & Debounced Snapshots (`fileSync.ts`, `dashboardStore.ts`):**
  * Implemented an in-memory queue for concurrent write requests, preventing `DOMException` file stream collisions when multiple widgets or notes are updated rapidly.
  * Debounced reactive store backup calls (400ms) to eliminate disk thrashing during rapid user interactions while guaranteeing the latest snapshot is always written.
* **Newsstand Canvas Icon (`canvasIcons.ts`, `NavigationDock.tsx`):**
  * Added a dedicated `Newspaper` / `Newsstand` icon option for news, briefing, and media canvas boards in canvas creation and settings modals.
* **SEO & Social Share Metadata (`index.html`, `public/robots.txt`, `public/sitemap.xml`, `vite.config.ts`):**
  * Added comprehensive Open Graph (`og:*`) and Twitter (`twitter:*`) cards pointing to 1200×630 `og-banner.png` for rich previews on Slack, Discord, and Twitter/X.
  * Added Schema.org `WebApplication` structured data (JSON-LD) and a semantic `<noscript>` crawler fallback.
  * Added static `robots.txt` and `sitemap.xml` files.
  * Dropped restrictive `maximum-scale=1.0` and `user-scalable=no` viewport flags to improve mobile accessibility (WCAG 1.4.4).
* **Comprehensive Documentation (`README.md`, `FEATURES.md`):**
  * Added dedicated **Local File PC Auto-Sync & Backup Architecture** guide detailing the 3-tier persistence model, offline guarantees, session persistence, and Dropbox/Google Drive/Synology sync folder synergy.

---

## [0.2.0] - 2026-11-05

### Added
* **Dual-Tier Light Theming & Daylight Canvases (`canvasThemes.ts`, `Corkboard.tsx`, `MobileCompanion.tsx`, `App.tsx`):**
  * Added 3 daylight canvas themes: **Daylight Dots** (`paper_dots`, crisp off-white stationery with soft slate dot matrix), **Warm Linen** (`warm_linen`, natural cream parchment with warm fiber grain), and **Studio White** (`minimal_light`, modern minimal light gray studio backdrop).
  * Automatically sets the root viewport background to light mode when a daylight canvas is active to eliminate dark border and transition flashes.
* **Per-Widget Theme Customization (`Corkboard.tsx`, `WidgetSettingsModal.tsx`, `types/dashboard.ts`):**
  * Added `themeMode?: 'auto' | 'light' | 'dark'` to widget configurations.
  * In `auto` mode, widgets dynamically inherit the board theme (light canvas -> light card, dark canvas -> dark card).
  * In `light` or `dark` mode, widgets override the canvas (e.g. crisp paper cards on photo or dark canvases, or dark cards on daylight boards).
  * Added **Card Appearance** 3-button selector directly into the right-click tile context menu and Tile Settings modal.
* **Widget Light Palette Refinements:**
  * Adapted Clock, Weather, Clock-Weather, World Clock, Calendar, Quotes, RSS, Countdown, TextBox, and Sticky Notes widgets with high-contrast slate typography, light card containers, and daylight forecast/calendar accents.
* **World Timezone Clock Grab-and-Sort Sorter (`WorldClockWidget.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Added interactive drag-and-drop grab handles to reorder active timezone cities directly on the multi-city clock widget.
  * Added grab handles, drag-and-drop reordering, and precision move up/down controls (`▲`/`▼`) in Tile Settings.
  * Added 1-click Quick Sort presets: sort by GMT time offset (West to East), alphabetical (A-Z), and reverse order.
* **Mobile Companion Light Mode (`MobileCompanion.tsx`):**
  * Fully synchronized light styling for widget cards and inner renderers in the mobile companion stream.

---

## [0.1.24] - 2026-11-05

### Added
* **Adaptive RSS Typography & Multi-Column Layout (`RssWidget.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Implemented responsive `ResizeObserver` container measurement that adaptively scales article typography across 4 sizing tiers (`sm`, `base`, `lg`, `xl`) to ensure high readability from small tiles to large wall displays and fullscreen kiosk mode.
  * Added responsive multi-column magazine grid: wide tiles (>= 580px) automatically flow into 2 columns, and fullscreen/widescreen displays (>= 1050px) flow into 3 columns.
  * Added article timestamps (`2h ago`, `Yesterday`, or formatted date).
  * Added a **Text Size & Readability** selector in Tile Settings (`Adaptive`, `Compact`, `Normal`, `Large`, `Jumbo`).
* **Dynamic README Release Badge (`README.md`):**
  * Switched static release badge to Shields.io's dynamic GitHub package.json badge integration so the README badge updates automatically on every release without manual intervention (#38).

---

## [0.1.23] - 2026-11-05

### Added
* **Sticky Note Toolbar Plus Badge (`NavigationDock.tsx`):**
  * Added a prominent amber badge with a `+` icon (`Plus` stroke `3`) to the **New Sticky Note** button in the navigation toolbar.
  * Harmonized micro-interactions (`group-hover:scale-105`) and styling to mirror the adjacent Add Widget Tile button.

---

## [0.1.22] - 2026-11-05

### Added
* **Granular Kid Protection & Kiosk Security Controls (`SettingsModal.tsx`, `Corkboard.tsx`, `NavigationDock.tsx`, `App.tsx`, `dashboardStore.ts`, `types/dashboard.ts`):**
  * Added independent "Lock Canvas Layout & Content" toggle (`lockCanvasEditing`) in both Security & System and Display & Navigation settings. Freezes widget tiles and sticky notes in place, disabling tile dragging, rotating, resizing, deleting, adding widgets/canvases, or auto-organizing. Interactive widgets and chore checklist checkboxes remain usable. Can be toggled independently with or without a PIN.
  * Added independent "Lock Fullscreen Kiosk Mode" toggle (`lockFullscreenKiosk`) that traps the Escape key, integrates the Chromium Keyboard Lock API (`navigator.keyboard.lock(['Escape'])`), blocks context menus, and auto-returns to fullscreen on touch/tap. Exiting fullscreen requires the parent PIN.
  * Added independent "Require PIN for Command Center Settings" toggle (`lockSettingsAccess`) to guard settings access.
  * Added visual lock indicators in the navigation dock and canvas empty state when canvas editing is locked.
* **Single Image & GIF Widget (`ImageWidget.tsx`, `MediaSearchModal.tsx`, `mediaSearch.ts`, `AddWidgetModal.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Added dedicated Image & GIF tile widget with integrated GIPHY GIF & animated sticker search, Wikimedia Commons public domain image search, custom image URLs, and direct file upload.
  * Supports frameless transparent sticker mode, object-fit scaling (`contain`, `cover`, `fill`), optional captions, and click-through external hyperlinks.
* **Ambient Mouse Cursor Auto-Hide (`useIdleCursor.ts`, `index.css`, `SettingsModal.tsx`):**
  * Automatically hides the idle mouse cursor after 3 seconds of inactivity (customizable from 1 to 15s in settings), accelerated to 1.2s in Night Mode (`dim` and `oled_clock`), instantly restoring cursor visibility on mouse movement.

---

## [0.1.21] - 2026-11-04

### Fixed
* **Short & Concurrent Calendar Event Display (`CalendarWidget.tsx`):**
  * Eliminated vertical text squishing and clipping for 30-minute and short timed events in 3-Day and Week views.
  * Implemented adaptive inline single-row layout (`[Time] [Title]`) with vertical centering (`justify-center`) for events under 46px.
  * Increased grid `HOUR_HEIGHT` to `60px` (28px height per 30-minute event) to provide generous breathing room.
  * Prevented event locations from crowding and truncating the event title in 1-hour events (locations are rendered inline only when `height >= 75px`).
  * Added rich hover tooltips (`title` attribute) with complete summary, time range, and location across all timed event blocks.

---

## [0.1.13] - 2026-11-03

### Added
* **Shared Common Photo Library (`dashboardStore.ts`, `db.ts`, `types/dashboard.ts`, `SettingsModal.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Added board-wide shared photo library allowing multiple photo widgets across boards to display from a single centralized photo album (Google Photos, Plex, Local Folders, or Curated Scenery).
  * Added segmented "Photo Library Scope" selector in Tile Settings (`Shared Board Library` vs `This Tile Only`), giving users granular control over whether a widget uses the shared album or an independent collection.
  * Added dedicated "Common Photo Library" configuration card in Board Settings for direct management of the board-wide photo album.
  * Added option in Photo Sources Modal to set any configured album as the common library for all photo frames with 1 click.
* **Toolbar Auto-Hide on Click-Off & Dynamic Pinning Eye State (`NavigationDock.tsx`, `AmbientQuickMenu.tsx`, `SettingsModal.tsx`):**
  * When the toolbar is hidden, clicking the edge handle peeks the dock open; clicking anywhere outside the dock or pressing Escape automatically re-hides it back to the edge.
  * Added dynamic eye icon indicator: shows crossed-out eye (`EyeOff`) when in auto-hide mode and open eye (`Eye`) when pinned. Clicking the crossed-out eye un-crosses it and pins the toolbar permanently open so it stops auto-hiding.
* **Google Photos Link Persistence & Restore in Sources Modal (`PhotoSourcesModal.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Fully pre-populates configured album URLs in the Google Photos & Web input textarea upon reopening sources modal.
  * Added currently active album banner displaying the saved link with a 1-click "Restore Link" action to prevent confusion when revisiting sources.

---

## [0.1.12] - 2026-11-03

### Fixed
* **Mobile Companion Viewport Layout & Tab Compression (`MobileCompanion.tsx`, `index.css`, `index.html`):**
  * Added `shrink-0`, `min-h-[44px]`, and `py-1.5` to the mobile tab switcher bar, preventing Flexbox from squashing the tab buttons and slicing off tab labels (`Family Board`, `Photos`).
  * Enforced `shrink-0` across the top mobile bar, filter selectors, note quick-add bar, and main stream container so headers and controls maintain their designed dimensions when scrolling long content streams.
  * Added cross-browser `.no-scrollbar` utility classes in `src/index.css` to hide horizontal scrollbars from eating up vertical space on mobile browsers.
  * Added `pt-[max(1rem,env(safe-area-inset-top))]` in `MobileCompanion.tsx` and `viewport-fit=cover` in `index.html` to prevent clipping under device notches, cutouts, and mobile browser URL bars.

---

## [0.1.11] - 2026-11-03

### Added
* **Hideable Navigation Toolbar (`NavigationDock.tsx`, `App.tsx`, `AmbientQuickMenu.tsx`, `SettingsModal.tsx`):**
  * Added off-screen sliding animation to hide the navigation toolbar for immersive full-screen smart-display and kiosk setups.
  * Added an unobtrusive edge restore handle with a directional chevron anchored at the dock's edge position for 1-click reveal.
  * Added keyboard shortcut `\` (backslash) and quick toggles in the dock utilities, Quick HUD menu, and Settings modal.
  * Automatically removed dock canvas padding when hidden, allowing widgets and notes to utilize 100% of the display edge-to-edge.
* **Snap-to-Grid Bento Alignment (`Corkboard.tsx`, `SettingsModal.tsx`, `AmbientQuickMenu.tsx`, `store/dashboardStore.ts`):**
  * Implemented a real-time 24×16 grid snapping engine (`1/24` X step, `1/16` Y step) for dragging and resizing widgets and sticky notes.
  * Added an ambient blue alignment grid overlay with an active status badge that appears dynamically during pointer drag and resize actions.
* **Clean Picture Mode (`WidgetSettingsModal.tsx`, `PhotoFrameWidget.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Added a `showCaptions` toggle option in Tile Settings allowing users to remove album titles, numbering, and captions across Ken Burns, Mosaic, Polaroids, and Filmstrip modes.
* **Clock & Weather Center Alignment (`ClockWeatherWidget.tsx`, `WidgetSettingsModal.tsx`):**
  * Center-justified clock and date display by default with a user-configurable text alignment selector (`left`, `center`, `right`) in Tile Settings.
* **Sticky Note Toolbar Icon (`NavigationDock.tsx`):**
  * Replaced the ambiguous pin icon on the navigation dock with a dedicated sticky note icon for immediate recognition.

### Fixed
* **Night Mode Navigation Dock Dimming (`NightMode.tsx`):**
  * Elevated the night mode dim overlay to `z-[9999]` above the fixed navigation dock to ensure the dock dims evenly and prevents OLED light bleed in dark environments.
* **Google Photos Broken Images & 429 Recovery (`index.html`, `services/photos.ts`, `PhotoFrameWidget.tsx`):**
  * Added `<meta name="referrer" content="no-referrer" />` and explicit `referrerPolicy="no-referrer"` to resolve HTTP 403 Forbidden hotlink blocks from `lh3.googleusercontent.com`.
  * Implemented dynamic resolution scaling (`=w600` for polaroids, `=w800` for mosaic/filmstrip) to prevent HTTP 429 rate limits.
  * Added auto-healing fallback error handlers that retry failed image URLs with alternative sizing tokens.
* **Google Photos Link Persistence in Sources Modal (`PhotoSourcesModal.tsx`, `PhotoFrameWidget.tsx`, `Corkboard.tsx`):**
  * Persisted configured Google Photos and Google Drive shared URLs in widget configuration, automatically populating the textarea and displaying an active album badge when reopening the sources dialog.
* **Filmstrip Center Image Enlargement (`PhotoFrameWidget.tsx`):**
  * Enlarged the active center image to 1.42x scale with increased offset stride (`70%`) and enhanced drop shadow for a more dramatic spotlight effect.

---

## [0.1.10] - 2026-11-02

### Added
* **Default Random Photo Playback (`PhotoFrameWidget.tsx`, `WidgetSettingsModal.tsx`):**
  * Configured random shuffle as default across Ken Burns, Mosaic, Filmstrip, and Polaroids to ensure ambient smart-displays always show fresh, non-repetitive photos.
  * Added a dedicated **Photo Playback Order** setting in Tile Settings (`🔀 Random Shuffle (Default)` vs `➡️ Sequential Order`).
* **Continuous Photo Rotation & Carousel Persistence (`PhotoFrameWidget.tsx`, `Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Implemented persistent runtime state caching keyed by widget instance and photo collection signature.
  * Preserved photo indices across canvas switches, preventing frames from restarting at photo #1 every time the board carousel scrolls into view.
* **Infinite Centered Filmstrip Reel (`PhotoFrameWidget.tsx`):**
  * Overhauled filmstrip presentation into an always-centered hero stage with scale elevation (`scale: 1.15`), drop shadow, and bottom caption bar.
  * Added smooth physics-based decelerate transitions (`ease: [0.25, 1, 0.5, 1]`) that shrink the current photo and slide it left while gliding the incoming photo into the center.
  * Added perforated film rails, edge vignettes, hover navigation chevrons, and infinite modulo loop streaming.

### Fixed
* **Auto-Rotating Mosaic Collage (`PhotoFrameWidget.tsx`):**
  * Fixed static 4-photo limitation by introducing an active quadrant rotation queue that continually cross-fades fresh photos into the collage at the configured interval.
* **Polaroid Polish (`PhotoFrameWidget.tsx`):**
  * Removed faux washi tape decals from Scattered Polaroids for authentic white photo paper prints with natural drop shadows.
* **Photo Sources Hub Cleanup (`PhotoSourcesModal.tsx`):**
  * Removed redundant presentation style, density, and speed controls from the media picker, establishing Tile Settings as the single source of truth.
* **Canvas Resolution & Display Density (`App.tsx`, `SettingsModal.tsx`, `ARCHITECTURE.md`):**
  * Removed artificial CSS canvas scaling (`displayDensity`) in favor of crisp native 1:1 proportional rendering without edge clipping or distortion.
* **Modal UX & Dismissal (`SettingsModal.tsx`, `WidgetSettingsModal.tsx`, `PhotoSourcesModal.tsx`, `AddWidgetModal.tsx`, `CreateCanvasModal.tsx`):**
  * Added click-outside backdrop dismissal and `Escape` key close across all system dialogs.
  * Pinned the settings modal header with title and close button (`✕`) so users never have to scroll up to close.

---

## [0.1.9] - 2026-11-02

### Added
* **5,000 Photo NAS & Local Folder Capacity (`PhotoSourcesModal.tsx`, `services/photos.ts`):**
  * Increased default local folder and network share scan limit to 5,000 photos with 8-level recursive directory traversal.
  * Added live real-time scanning feedback reporting photo counts and the active subdirectory being read.
  * Added a scan capacity selector (`1k`, `2.5k`, `5k`, `10k`) in the photo sources modal.
  * Enhanced multi-folder support allowing consecutive folder additions without overwriting existing selections, plus an inline `[ + Add Another Folder ]` action bar.

### Fixed
* **Mobile Companion Viewport Touch Scrolling (`MobileCompanion.tsx`, `index.css`):**
  * Resolved mobile touch scrolling inability by anchoring the companion container to `fixed inset-0 w-full h-[100dvh]` with explicit `overflow-y: auto`, `touch-action: pan-y`, and `-webkit-overflow-scrolling: touch`.
  * Added an end-of-stream breathing room spacer (`h-20`) so bottom cards and notes clear mobile browser bars and navigation handles.

---

## [0.1.8] - 2026-11-02

### Added
* **Google Drive Shared Folder Ingestion (`functions/api/gdrive.ts`, `vite.config.ts`, `services/photos.ts`, `PhotoSourcesModal.tsx`):**
  * Added automated parser and serverless endpoint (`/api/gdrive`) to extract all images from public Google Drive folders into high-resolution streamable photos (`=w1920-h1080`).
  * Added detection for Google Drive folder URLs (`drive.google.com/drive/folders/...`) in the Photo Sources modal.
  * Added clean filtering to skip video and document formats for photo frame playback.

### Fixed
* **Cloudflare Pages API Function Routing (`services/photos.ts`, `services/feeds.ts`, `vite.config.ts`):**
  * Corrected client API requests from `/functions/api/...` to `/api/...`, matching Cloudflare Pages' native function mounting path and resolving `Unexpected token '<', "<!doctype "... is not valid JSON` errors on production.
  * Added `Content-Type: application/json` verification before parsing response bodies to prevent syntax errors on unexpected HTML fallbacks.
* **Sanitized Example Placeholders (`PhotoSourcesModal.tsx`):**
  * Replaced live links in the photo sources modal textarea placeholder with sanitized generic examples.

---

## [0.1.7] - 2026-11-02

### Added
* **Google Photos Deep Pagination (`functions/api/gphotos.ts`, `vite.config.ts`, `services/photos.ts`, `PhotoSourcesModal.tsx`):**
  * Automated `snAcKc` batchexecute RPC pagination to ingest full Google Photos shared albums of 7,000+ photos (benchmarked and verified with 7,579 photos).
  * Maintained lightweight photo descriptors (~200 bytes per item) and on-demand lazy image loading for smooth performance on smart displays and mobile devices.
  * Added live album progress badges and total count transparency in the photo sources hub.
* **Centralized Photo Frame Configuration (`PhotoFrameWidget.tsx`, `WidgetSettingsModal.tsx`, `MobileCompanion.tsx`):**
  * Relocated slideshow presentation styles (Ken Burns, Mosaic Collage, Scattered Polaroids, Filmstrip) and photo library sources entirely into Tile Configuration (`WidgetSettingsModal` / `PhotoSourcesModal`).
  * Removed all in-canvas overlay buttons to eliminate hover action collisions and provide a completely clean ambient smart-display aesthetic.
  * Enabled full photo library management parity inside the Mobile Companion tile settings workflow.
* **Multi-Folder Selection & Local NAS Photo Support (`PhotoSourcesModal.tsx`, `services/photos.ts`):**
  * Added multi-folder selection with `[ ➕ Add Another Folder ]`, folder item cards with remove actions, and `[ Apply Selected Folders ]`.
  * Enabled recursive subfolder scanning (up to 5 levels deep) and file-extension fallback (`IMAGE_EXT_REGEX`) to support network shares and NAS drives.
* **Configurable Quote Update Intervals (`WidgetSettingsModal.tsx`, `QuotesWidget.tsx`):**
  * Added quote update interval selector (`30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `Daily`, `Manual`) with smooth cross-fade rotation transitions and interval badge indicators.

### Fixed
* **Sticky Note Canvas Visibility & Placement (`Corkboard.tsx`, `App.tsx`):**
  * Resolved invisible pinned notes by auto-unhiding notes, elevating `zIndex`, detecting widget collisions, auto-positioning into open canvas spaces, and adding a 2.5s visual pop-out ring.

---

## [0.1.6] - 2026-11-02

### Added
* **Mobile Companion Vertical Tile Stream (`MobileCompanion.tsx`, `App.tsx`, `types/dashboard.ts`):**
  * Replaced the notes-only mobile companion view with a full single-column vertical tile stream of the active canvas.
  * Every widget tile (Clock & Weather, Countdown, Photos, RSS Headlines, Quotes, Text Boxes, Media Embeds, and Notes) displays a clean mobile-responsive card with live preview.
  * **Persistent View Option**: 3-way segmented filter pills (`All Tiles` | `Widgets` | `Notes & Tasks`) automatically persisted in `localStorage`.
  * **Independent Mobile Reordering (`▲ / ▼`)**: Added move buttons on each widget card modifying an isolated `mobileOrder` property with zero impact on the non-mobile desktop/kiosk layout.
  * **Mobile Tile Customizer & Creation**: 1-tap `⚙️` button opens `WidgetSettingsModal` on mobile to adjust weather cities, milestone dates, photo densities, font styling, or RSS feeds. Added an `+ Add Tile` button to add widgets from your phone.
* **Close Individual Sticky Notes & Pop Out from Tile (`Corkboard.tsx`, `StickyNotesWidget.tsx`, `types/dashboard.ts`):**
  * Added an `X` button in the header of every floating sticky note on the corkboard canvas.
  * Clicking `X` removes that specific note from the corkboard without deleting it. It remains safely saved, checkable, and active in the Notes Tile widget (`isPinnedToCanvas: false`).
  * In the Notes Tile widget list, added a `📌 Pin to Board` / `📌 On Canvas` status toggle button to pop notes back onto the corkboard with one tap.

### Fixed
* **Command Hub Click Registration (`NavigationDock.tsx`, `AmbientQuickMenu.tsx`, Modals):**
  * Elevated the Navigation Dock and Command Hub menu to `z-50`, placing them strictly above the `z-40` transparent click-outside backdrop so all 4 kiosk controls and shortcuts immediately respond to clicks and touches.
  * Added `max-w-[calc(100vw-5rem)]` and `pointer-events-auto` for narrow mobile screens.
  * Re-layered fullscreen modals to `z-[70]`–`z-[100]`.

---

## [0.1.5] - 2026-11-02

### Added
* **Selectable Default Home Board (`types/dashboard.ts`, `store/dashboardStore.ts`, `services/db.ts`):**
  * Added `isHome?: boolean` to `DashboardTab`, allowing users to explicitly designate any canvas as the default Home Board without having to shift it to position #1.
  * Added `setHomeTab(tabId)` action to `dashboardStore` that persists to Dexie DB and updates local backups.
  * Updated app initialization to prioritize explicitly designated Home Boards when loading dashboards.
  * Added deletion fallback to reassign home status gracefully if the current Home Board is deleted.
* **Canvases & Boards Manager Polish (`SettingsModal.tsx`):**
  * Added prominent purple `[🏠 Home Board]` badge next to the canvas name for instant identification.
  * Added 1-click `Home` icon button (`🏠`) in the canvas action controls row for rapid 1-tap assignment.
  * Added **"Default Home Board"** toggle switch inside the inline canvas editor.
* **Ambient Command Hub & Navigation Dock Indicators (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`, `App.tsx`):**
  * Ambient Command Hub popover now dynamically displays the actual name of your configured Home Board on the Home button and navigates directly to it.
  * Navigation Dock shows a subtle purple glowing indicator dot on inactive Home Board icons and appends `(Home Board)` to the tooltip.
* **Mobile Companion Tab Indicator (`MobileCompanion.tsx`):**
  * Mobile companion tab switcher pills display a subtle Home icon (`🏠`) beside the Home Board.

---

## [0.1.4] - 2026-11-02

### Added
* **Text Box & Canvas Heading Widget (`TextBoxWidget.tsx`, `AddWidgetModal.tsx`, `WidgetSettingsModal.tsx`, `Corkboard.tsx`, `types/dashboard.ts`):**
  * New dedicated `textbox` widget type designed for clean text, messages, announcements, and titles floating directly on the screen without looking like a sticky note or standard tile box.
  * **Background Modes:** Clean / Transparent (no card box, no border, text floating directly over wallpaper), Frosted Glass, and Solid Dark card styles.
  * **Typography & Styling:** 9 font sizes (`XS` to `5XL` hero display headings), 5 font weights, Left/Center/Right alignment, 4 font families (Clean Sans, Editorial Serif, Modern Mono, Cursive Script), letter spacing, text transform (UPPERCASE, Capitalize).
  * **Text Color & High-Contrast Shadow:** 9 curated pastel & vibrant colors plus custom hex color picker, with high-contrast drop shadow toggle for readability over wallpapers.
  * **Markdown & Editing:** Supports markdown formatting (`# Header 1`, `## Header 2`, `**Bold**`, `*Italic*`, `__Underline__`, `- Bullet points`), double-click inline editing on the canvas with `Esc` / `Ctrl+Enter`, and full visual customizer with WYSIWYG preview in tile settings.
* **1-Tap Switch to Mobile Companion (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`, `App.tsx`):**
  * Added a dedicated **"Switch to Mobile Companion"** button inside the Ambiently Command Hub menu on mobile viewports.
  * Enables instant 1-tap switching back to Mobile Companion mode from Kiosk view without having to reload the browser.

### Fixed
* **Mobile Sticky Note Hold-and-Drag Movement (`Corkboard.tsx`):**
  * Fixed checklist item row element trapping touch pointer events by refactoring checklist items to `<div>` rows and isolating `<button>` to the checkbox toggle icon.
  * Applied `touchAction: 'none'`, `WebkitUserSelect: 'none'`, and `userSelect: 'none'` across sticky note card containers, eliminating scroll-gesture cancellation (`pointercancel`) on mobile browsers.
  * Added window-level touch pointer listeners with `{ passive: false }` and non-blocking 60 FPS local drag state, committing once on release (`pointerup`).
* **Mobile Sticky Note Editing (`Corkboard.tsx`, `MobileCompanion.tsx`, `App.tsx`):**
  * Updated note action bar to `opacity-90 md:opacity-0 md:group-hover:opacity-100`, making Edit pencil, Trash, 0° Straighten, and Pastel Color Swatches always visible on mobile touchscreens while preserving sleek desktop hover behavior.
  * Added a direct Edit pencil icon in the note header for 1-tap editing on mobile.
  * Added touch double-tap gesture detection (`< 350ms`) to open the note editor on touchscreens.
  * Added note deletion and individual checklist item removal when editing in Mobile Companion mode.
* **Blurry Screen on Dock Menu Open (`AmbientQuickMenu.tsx`):**
  * Removed `bg-black/20 backdrop-blur-[1px]` from the click-outside dismisser in `AmbientQuickMenu.tsx`. The background canvas remains 100% crisp and sharp when opening the menu on mobile.

---

## [0.1.3] - 2026-11-02

### Added
* **Configurable Polaroid Photo Density & Full-Screen Collage (`PhotoFrameWidget.tsx`, `WidgetSettingsModal.tsx`, `PhotoSourcesModal.tsx`):**
  * Added user-configurable photo counts: `6 (Light)`, `12 (Desk)`, `18 (Dense)`, `24 (Wall Collage)`, and `32 (Fill Complete Screen)`, plus a continuous `4`–`36` photo slider.
  * When set to Fill Screen, polaroids generously overlap across 100% of the canvas surface for a rich tabletop or memory wall appearance.
  * 1-tap quick pill controls on the widget header to adjust count (`Count: 6 | 12 | 18 | 24 | Fill`) and size mode on the fly.
* **Varied & Random Polaroid Sizing (`PhotoFrameWidget.tsx`):**
  * Added **Random / Mixed Sizes** mode, scattering an authentic assortment of **Hero Large Prints** (`280px–310px`), **Classic Medium Polaroids** (`200px–230px`), and **Compact Snapshots** (`135px–165px`).
  * Supports **Uniform Medium**, **Compact Snapshots**, and **Large Hero Prints** presets in settings.
  * Faster dynamic photo swapping on dense collages to keep high-count boards continuously refreshed.

### Fixed
* **Trapped Release Notes & Share Modals (`ChangelogModal.tsx`, `ShareBoardModal.tsx`, `AmbientQuickMenu.tsx`):**
  * Wrapped `ChangelogModal`, `ShareBoardModal`, and the quick menu click-outside backdrop in `createPortal(..., document.body)` with `z-[100]`.
  * Eliminates the CSS transform clipping bug where modals opened from the dock were trapped within the 48px-wide dock column.
  * Added click-outside backdrop dismissal and `Escape` key listeners to seamlessly close modals.

---

## [0.1.2] - 2026-11-02

### Added
* **Ambient Quick Command & Kiosk HUD Popover (`AmbientQuickMenu.tsx`, `NavigationDock.tsx`):**
  * Turned the Ambiently brand logo in the Navigation Dock into an interactive trigger opening a floating kiosk HUD popover.
  * Instant 1-tap toggles for **Night Mode**, **Fullscreen Kiosk**, **Tab Carousel (Auto-Rotate)**, and **Return to Home Board**.
  * Shows live system status (`🟢 Local-First Engine`), clock, and release version badge linking directly to the Changelog modal.
  * Direct shortcuts for **Connect Phone (Family QR Code)** and **Settings & Boards Manager**.
* **Scattered Polaroids Multi-Photo Gallery (`PhotoFrameWidget.tsx`):**
  * Redesigned the Polaroid display style into an organic 6-photo scattered collage with natural tilts (`-7°` to `+8°`), drop shadows, and vintage washi tape decals.
  * Live random photo updates: continuously swaps in fresh, non-repeating photos from connected libraries (curated presets, Plex, local folders) with smooth spring drop animations.
  * Interactive controls: hover to zoom in (`scale: 1.12`) and inspect at `0°`, or tap any individual Polaroid to immediately shuffle its photo.

### Fixed
* **Uncropped Sticky Note Rotate Handle (`Corkboard.tsx`):**
  * Lifted the `overflow-hidden` restriction on sticky note card containers so the top-center rotate grab handle sits cleanly above the top border without being cut in half.
  * Aligned the handle to `-top-3` with a crisp `w-6 h-6` circular pill matching widget tiles.
* **Sticky Notes Tile Header Action Collision (`StickyNotesWidget.tsx`):**
  * Relocated the **`+ New Note`** button to the left alongside the **`Notes (x)`** / **`Trash (x)`** tab cluster, preventing the top-right widget hover toolbar from covering it.
  * Added clearance padding (`pr-28`) to **Calendar** and **RSS** tile headers to safeguard view toggle and refresh buttons from hover overlay collisions.

### Removed
* **Dock Auto-Backup Icon (`NavigationDock.tsx`):** Removed the redundant `FolderSync` auto-backup icon from the navigation dock toolbar (backup and auto-sync remain accessible in Settings under Backup & Sync).

---

## [0.1.1] - 2026-11-02

### Added
* **Unified Navigation Dock Action Cluster (`NavigationDock.tsx`):**
  * Relocated **Pin New Sticky Note** (`Pin`), **Add Widget Tile** (`LayoutGrid`), **Auto-Organize / Auto-Tile** (`Wand2`), and **Trash / Archive Drawer** (`Archive` with badge) into the Navigation Dock to eliminate top-right button overlaps on full-bleed canvases.
* **1-Click Auto-Organize & Auto-Tile Engine (`autoLayout.ts`, `dashboardStore.ts`, `Corkboard.tsx`):**
  * **Smart Bento Grid:** Packs widgets into balanced golden-ratio columns (`60% / 40%`, `2×2`, or `3-column` grids) and aligns sticky notes cleanly below or beside.
  * **Keep Current Sizes (Pack Only):** Uses a 2D shelf-packing algorithm to resolve overlaps while preserving custom user-resized tile dimensions, plus a 1-click `0°` rotation straightening option.
  * **Widgets Left | Sticky Notes Right:** Splits the board into a `68%` structured widget zone on the left and a `30%` 2-column sticky note rail on the right.
  * Includes **1-Click Undo (`Undo2`)** snapshot restoration, smooth `300ms` CSS layout transitions, and smart non-overlapping placement (`findOpenCanvasSpot`) when spawning new widgets or notes.
* **Per-Canvas Background Themes, 4K/5K Picture Upload & Dim Slider (`canvasThemes.ts`, `imageUpload.ts`, `CreateCanvasModal.tsx`, `SettingsModal.tsx`):**
  * 5 procedural surface themes (`Midnight Dots`, `Warm Cork`, `Pure OLED Black`, `Ambient Aurora`, `Glass Blueprint`).
  * Custom picture background uploader with adaptive 1080p / 4K / 5K Ultra HD client-side WebP/JPEG compression (`3840×2160` / `5120×2880`) and 4 curated 4K presets.
  * **Background Dim Level Slider (`0%` – `90%`)** per canvas with live preview to keep white widget typography legible over bright photos.
* **Per-Canvas Sticky Note Isolation & Visibility Controls (`App.tsx`, `Corkboard.tsx`, `SettingsModal.tsx`, `MobileCompanion.tsx`):**
  * Fixed note filtering so each canvas displays only its own notes (`tabId === activeTabId`) or global notes (`tabId === 'all'`).
  * Added a **Canvas Board Selector** (including `📌 Pin to All Canvases`) inside the Note Creator/Editor modal and a per-canvas **Show / Hide Sticky Notes (`Eye` / `EyeOff`)** toggle in Settings.
* **Sticky Note Resizing, Rotation, Inline Editing & Color Swatches (`Corkboard.tsx`, `MobileCompanion.tsx`):**
  * Expanded sticky note resizing from compact `8% × 8%` mini post-its up to `100% × 100%` full-canvas posters.
  * Added **Typography Size Pills (`S`, `M`, `L`, `XL`)**, a smooth **360° Grab-and-Rotate Handle (`↻`)** with `0°` magnetic snap, **Inline Note Editing** (`✏️` button or double-click), and **1-Click Inline Pastel Color Swatches** directly on the note hover bar and Mobile Companion cards.
* **World Timezone Clock & Universal Display Seconds Toggle (`WorldClockWidget.tsx`, `ClockWidget.tsx`, `ClockWeatherWidget.tsx`, `WidgetSettingsModal.tsx`):**
  * New **World Timezone Clock (`world_clock`)** widget with Open-Meteo city geocoding lookup supporting **Single-City Hero Clock** (digital, minimalist, or analog dial) and **Multi-City World Timezone List** modes with live day/night indicators and relative day badges (`Today`, `+1d`, `-1d`).
  * Added **Display Seconds (`showSeconds`)** toggle and optional city timezone override across all Clock and Clock+Weather tiles.
* **Ambient Stream & Web Embed Tile (`MediaEmbedWidget.tsx`) & Custom Family Affirmations (`QuotesWidget.tsx`):**
  * Added **Ambient Stream & Web Embed (`media_embed`)** widget with 1-click presets (`Lofi Girl`, `Synthwave Radio`, `NASA ISS Live Earth`, `Monterey Bay Jellyfish Cam`, `Tokyo Night Walk`) and custom YouTube / HTTPS iframe support with persisted mute toggle.
  * Upgraded **Daily Quotes & Affirmations (`QuotesWidget.tsx`)** to support custom family affirmations, house rules, and Wi-Fi reminders alongside curated philosophical quotes.

### Removed
* Removed the floating top-right Corkboard action buttons (`Corkboard.tsx`) in favor of the unified Navigation Dock action cluster.
* Removed the decorative red pushpin dots (`bg-red-600`) from the top of Corkboard tiles and sticky notes for a cleaner modern aesthetic.

---

## [0.1.0] - 2026-11-02

### Added
* **Multi-Source iCal / Webcal Feed Manager (`WidgetSettingsModal.tsx`):**
  * Added connected feed manager in Calendar Tile Settings to merge, toggle, color-tag, and remove multiple public or secret Google, Apple iCloud, and Outlook `.ics` / `webcal://` URLs.
  * Default View selector (`Agenda Schedule` vs `Monthly Grid`).
* **1-Click City Geocoding Lookup (`WidgetSettingsModal.tsx`):**
  * Integrated Open-Meteo Geocoding API to auto-resolve latitude, longitude, and formatted city/state/country names directly from city text input.
* **Expanded Clock Face Engine (`ClockWidget.tsx`, `ClockWeatherWidget.tsx`):**
  * Added **Analog Dial** (with SVG hands, tick marks, and live seconds ticker), **Minimalist** typographic face, and **Digital** styles.
  * Clock face selectors available for both standalone Clock and Clock+Weather combo tiles.
* **Note Expiration Engine & Recoverable Trash Drawer (`Corkboard.tsx`):**
  * Freeform sticky notes on Corkboard canvases now support expiration (`Permanent`, `Expire 24h`, `Expire 3d`, `Custom Date/Time`).
  * Visual warning ring for notes expiring within 12 hours.
  * Corkboard header **Trash / Archive Recovery Drawer** with 1-click note restore and permanent wipe options.
  * Added **Sticky Notes & Reminders** tile support directly on Corkboard canvases.
* **Interactive Canvas Layering & Rotation Controls (`Corkboard.tsx`):**
  * Automatic bring-to-front (`zIndex`) layering whenever a widget or note is touched or dragged.
  * Tile tilt (`↺`, `0°`, `↻`) controls on card hover.
* **Night Mode & Kiosk Hardware Controls (`SettingsModal.tsx`, `App.tsx`):**
  * Configurable auto-start and morning wake schedule (`22:00`–`07:00`) with automatic 60-second schedule timer.
  * Night Mode visual style selector: **OLED Pixel-Shift Clock** (with burn-in prevention movement) vs **Dim Screen Overlay** with darkness slider.
  * Screen Wake Lock API 24/7 toggle.
  * Canvas interaction pauses tab carousel auto-rotation for 20 seconds.
* **Per-Widget Photo Sources Persistence (`PhotoFrameWidget.tsx`, `Corkboard.tsx`):**
  * Photo sources modal connected to individual widget configuration in IndexedDB so Plex, local folders, Google Drive, and presets persist seamlessly.
* **Family QR Code Invite Modal Button (`SettingsModal.tsx`):**
  * Added **Family QR Invite** button to launch the mobile companion QR onboarding modal.

---

## [0.0.12] - 2026-11-01

### Added
* **Pure Dynamic Canvas Platform:**
  * Sunmsetted BentoGrid (`BentoGrid.tsx`) and hardcoded Photos tabs in favor of a 100% unified Corkboard canvas architecture.
  * Every board is a flexible canvas capable of hosting freeform widgets, sticky notes, or full-screen photo streamers.
* **Canvas Creator & Icon Picker (`CreateCanvasModal.tsx`):**
  * Added `+` button to the Navigation Dock and Settings to create unlimited custom canvases.
  * 16 custom icon choices: Pin, Photos, Home, Calendar, Coffee, Heart, Star, Music, Sun, Tasks, Sparkles, Smile, Display, Folder, Clock, and Grid.
* **1-Click Tab Reordering (`SettingsModal.tsx`):**
  * Added Move Up (`▲`) and Move Down (`▼`) controls to reorder tabs in the dock and auto-rotate carousel.
  * Inline canvas renaming and icon customization.
* **Interactive Tile Resizing (`Corkboard.tsx`):**
  * Bottom-right corner drag handles on all widgets and sticky notes with live fluid canvas scaling.
* **Dedicated Tile Settings Modal (`WidgetSettingsModal.tsx`):**
  * ⚙️ Edit button on all tile headers to configure titles, countdown dates, photo slideshow transition styles, speeds, and weather/clock settings.

---

## [0.0.11] - 2026-11-01

### Added
* **Dashboard Views & Tabs Manager (`SettingsModal.tsx`):**
  * Added a dedicated "Dashboard Views & Tabs" selector in Settings to toggle visible tabs in the Navigation Dock and ambient carousel.
  * Overview (Bento Grid) is now an optional tab that users can enable on demand, keeping the dashboard unified around Corkboard.
  * Built-in safeguards prevent users from disabling all views.
* **1-Click Fullscreen / Canvas Fill on Corkboard (`Corkboard.tsx`):**
  * Added a Maximize / Restore button to all widget tiles on Corkboard.
  * Allows expanding the Photo Frame (or any widget) to 100% borderless display, turning Corkboard into an edge-to-edge photo streamer.
* **Interactive Bento Grid Touch Dragging & Swapping (`BentoGrid.tsx`):**
  * Added pointer drag handles with live blue drop-preview box.
  * Automatic collision detection swaps grid tile coordinates when dragging one tile over another.
  * Added a 1-click quick-swap button on each tile header for fast adjacent reordering on tablets.

### Changed
* **Corkboard as Primary View:** Default fresh installations start on Family Board (Corkboard) as the primary ambient display.
* **Support & Donate Panel Relocation:** Moved Support & Donate to the bottom of the Settings modal above the Danger Zone.
* **User-Friendly Cloud Sync Terminology:** Replaced technical "Supabase" and "Magic Link" terminology with "Cloud Sync & Multi-Device Backup".

---

## [0.0.10] - 2026-11-01

### Fixed
* **Mobile & Tablet Touch Dragging:**
  * Added `touch-action: none` and `-webkit-touch-callout: none` to prevent mobile browsers (iOS Safari, Android Chrome) from intercepting touch gestures as scrolling or zooming.
  * Corrected local container coordinate offsets `(e.clientX - rect.left)` and `(e.clientY - rect.top)` for precise 1:1 finger tracking.
  * Bound pointer capture to card containers (`e.currentTarget`) to eliminate sub-element text selection glitches.
  * Disabled CSS transitions during active dragging for fluid 60fps/120fps movement without input latency.

---

## [0.0.9] - 2026-11-01

### Added
* **Plex Media Server OAuth & Streaming:**
  * Automated Plex PIN generation (`plex.tv/api/v2/pins`), pairing status polling, and secure token vault storage (`db.vault`).
  * Kiosk-friendly 4-character code and QR code pointing to `plex.tv/link` for fast mobile authorization.
  * Discovers servers and filters secure `plex.direct` HTTPS endpoints to avoid browser mixed-content restrictions.
  * Photo library enumeration and high-resolution photo transcode streaming into the slideshow.
* **Universal 1-Click JSON Backup & Restore Hub:**
  * Added 1-click **Download Backup (`.json`)** working across all desktop and mobile browsers.
  * Added 1-click **Upload & Restore (`.json`)** to restore all customized tabs, widgets, notes, and layouts into local IndexedDB (`AmbientlyDB`).
* **Danger Zone Factory Reset:**
  * Added two-step confirmation Factory Reset button in Settings Modal to wipe local databases, photo caches, and credentials.
* **Dedicated Standalone Weather Widget (`WeatherWidget.tsx`):**
  * Decoupled weather from the clock tile into a dedicated card with current temperature, condition icon, humidity, wind, high/low, and a 5-day daily forecast strip powered by Open-Meteo.
* **Dedicated Standalone Clock Widget (`ClockWidget.tsx`):**
  * Clean, focused ambient clock display with date and live seconds.
* **Visual Widget Catalog & Manager (`AddWidgetModal.tsx`):**
  * Added `+` button in the dock and `+ Add Tile` button on the Family Board to add any widget.
  * Added widget removal controls (`🗑️`) on tile hover.
* **Photo Sources Hub Modal (`PhotoSourcesModal.tsx`):**
  * Replaced the hidden folder icon with a prominent **Sources** button on the photo frame header supporting Plex, Local Folders, Google Drive links, and Curated presets.
* **Family Board Note Creator & Touch-Friendly Deletion:**
  * Added floating `+ Pin New Note` creator modal and made note deletion buttons permanently visible for touch and kiosk displays.

### Fixed
* **Redundant Photo Tile Time Overlay:** Stripped digital clock overlay from the ambient photo frame so it no longer duplicates the main Clock & Weather widget beside it.

---

## [0.0.8] - 2026-11-01

### Added
* **Multi-User Dashboard Sharing:** Shareable QR codes and 6-character join codes (e.g. `?join=CODE`) allowing family members to instantly connect to a shared dashboard on their phones.
* **Live Realtime WebSocket Sync:** Powered by Supabase Realtime, updating sticky notes and checklist toggles on wall displays in < 300ms without reloading.
* **Database Schema Migrations:** Added `dashboard_members` and idempotent column migrations in `supabase/schema.sql`.

---

## [0.0.7] - 2026-11-01

### Added
* **Tab Carousel Settings:** Exposed toggle switch and rotation duration pills (15s, 30s, 45s, 60s, 120s) in Settings Modal.
* **Support & Donate Panel:** Embedded accordion in Settings with Venmo, PayPal, and Zelle QR codes.

### Fixed
* **Display Density Zoom Trap:** Isolated CSS zoom transform to the board canvas, keeping Navigation Dock and Modals fixed at 100% viewport resolution.

---

## [0.0.6] - 2026-11-01

### Added
* **Interactive Changelog Modal (`ChangelogModal`):**
  * Subtle version pills (`v0.0.6`) placed in the Settings Modal and Mobile Companion headers.
  * Clicking the pill opens a modal with release history cards and a direct link to `CHANGELOG.md` on GitHub.
* **Documentation Suite:**
  * Created `CHANGELOG.md` following the Keep a Changelog standard.
  * Created `FEATURES.md` covering all 10 core feature pillars.
  * Created `ARCHITECTURE.md` documenting the local-first engine, edge proxy functions, and Supabase RLS sync.
  * Enriched `README.md` with official banners and setup instructions.

---

## [0.0.5] - 2026-11-01

### Added
* **Mobile Companion Remote:** Responsive viewport detector (`< 768px`) that automatically loads a touch-optimized mobile remote on smartphones.
  * Rapid sticky-note and checklist adder syncing in real-time to wall kiosk.
  * Remote tab switcher controlling what view is rendered on the wall display.
  * Interactive task checklist feed with tap-to-complete checkboxes.
  * One-tap "Kiosk" preview button to view the full desktop board on mobile.
* **Supabase Multi-Tenant Cloud Sync:**
  * Passwordless Magic Link email authentication.
  * Bidirectional synchronization (`pushToCloud` and `pullFromCloud`) bridging browser `IndexedDB` with Supabase Postgres.
  * Created `supabase/schema.sql` defining `dashboards`, `tabs`, `widgets`, and `notes` tables, with Row-Level Security (RLS) policies and Realtime publications.
* **Cloud Sync UI:** Account sign-in, session status, manual push/pull sync triggers inside Settings Modal.

---

## [0.0.4] - 2026-11-01

### Added
* **Multi-Source Photo Frame (`PhotoFrameWidget`):**
  * **Ken Burns Style:** Ambient pan-and-zoom transitions with Framer Motion crossfades and a subtle corner clock & date overlay.
  * **Mosaic Style:** 4-quadrant photo collage grid with active selection indicators and captions.
  * **Polaroid Stack Style:** Angled white paper polaroid frame with handwritten labels and photo credit.
  * **Filmstrip Style:** Horizontally scrolling carousel for rapid browsing.
* **Local Folder Support:** File System Access API directory handle (`showDirectoryPicker`) to loop through local PC or mapped NAS photos.
* **Curated Photography:** High-resolution ambient landscape fallback via Unsplash.
* **Offline Photo Resiliency:** Integrated Cache Storage API (`cachePhotosLocally`) keeping the last 30 photos available even when internet connectivity drops.

---

## [0.0.3] - 2026-11-01

### Added
* **Cloudflare Pages Serverless Edge Functions (`/functions/api/*`):**
  * `/functions/api/ical.ts`: Normalizes `webcal://` and `https://` URLs, expands recurring `RRULE` events, and returns sanitized JSON for a 60-day window.
  * `/functions/api/rss.ts`: Proxies and converts XML RSS 2.0 and Atom feeds via `fast-xml-parser` into clean JSON headlines with a 10-minute edge cache.
* **Multi-Calendar Widget (`CalendarWidget`):**
  * Unified chronological timeline merging multiple Google, Apple, and Outlook calendars.
  * Per-calendar color coding.
  * Dual views: **Agenda List View** with weekday tags and **Monthly Grid Matrix** with event dot indicators.
* **RSS Feed Reader Widget (`RssWidget`):** Card list layout showing headlines, summaries, and outbound links.

---

## [0.0.2] - 2026-11-01

### Added
* **Open-Meteo Weather Tile (`ClockWeatherWidget`):**
  * Zero-key geocoding and weather conditions with temperature, feels-like, highs, lows, and condition icons.
  * 3-day micro forecast strip with auto-refresh every 15 minutes.
* **Live Clock Tile:** Minimalist digital clock with live seconds counter, AM/PM tag, and an SVG analog clock face.
* **Interactive Sticky Notes Board (`StickyNotesWidget`):**
  * Rich text notes and checklists with clickable interactive checkmarks.
  * 6-color ambient pastel color palette (Amber, Emerald, Sky, Pink, Purple, Orange).
  * Expiration engine: Permanent, 24h, 3 days, or custom date/time expiration.
  * Approaching-expiration visual warning ring (within 12 hours).
  * Recoverable Trash and Archive drawer with 1-click restore.
* **Event Countdown Tile (`CountdownWidget`):** Real-time days, hours, minutes, and seconds countdown to target dates.
* **Rotating Daily Quotes Tile (`QuotesWidget`):** Curated inspirational thoughts of the day.

---

## [0.0.1] - 2026-11-01

### Added
* **Brand Assets Integration:** Placed master raw assets in `assets/brand/`.
* **Automated PWA Icon Generation Pipeline (`scripts/generate-icons.js`):**
  * Uses Sharp to build favicons, apple-touch-icon, standard PWA splash icons, OpenGraph cards, and 80% safe zone maskable Android icons on every build.
* **PWA & OpenGraph Configuration:** Updated `index.html` meta tags and `vite.config.ts` Workbox precache manifest.

---

## [0.0.0] - 2026-10-31

### Added
* Initial project architecture and repository initialization under **GNU AGPLv3**.
* Zero-millisecond local-first data engine via **Dexie.js (IndexedDB)** and **Zustand**.
* Chromium File System Access API bridge auto-saving to local `ambiently-data.json`.
* Dual-mode layout engine:
  * Snapped 12×8 zero-scrollbar **Bento Grid**.
  * Freeform draggable and rotatable **Corkboard**.
* Configurable **Navigation Dock** (Left, Top, Right, Bottom) with automated tab carousel.
* Kiosk hardware integration: Fullscreen API and Screen Wake Lock API.
* Scheduled Night Mode with low-glow, pixel-shifting OLED clock to prevent screen burn-in.
* Kid-Proof 4-digit PIN lock with a 4-second hold parent challenge.
* Display Density zoom scaler (75%, 100%, 125%, 150%) supporting 1080p, 1440p, and 4K displays.
