# Ambiently — Features & Capabilities Reference

**Ambiently** (`dashboard.trinhism.com`) is a modern, ambient smart-display and command center Progressive Web App (PWA) built under the Trinhism ecosystem. It transforms idle tablets, Raspberry Pi monitors, smart TVs, and laptops into a glanceable, zero-clutter family hub and personal dashboard.

---

## 1. Core Layout & Kiosk Shell (Phase 1)

### Pure Freeform Corkboard Multi-Canvas Engine
* **Unified Corkboard Canvas Architecture:** Every tab is an independent, customizable freeform pinboard canvas (`Corkboard.tsx`) where both Sticky Notes and Live Widgets coexist with normalized coordinates (`xRatio`, `yRatio`, `wRatio`, `hRatio`), continuous `360°` rotation, and automatic bring-to-front (`zIndex`) layering.
* **1-Click Auto-Organize & Auto-Tile Engine (`autoLayout.ts`):**
  * Click the **Auto-Organize (`Wand2`)** button in the Navigation Dock to smoothly animate all widgets and sticky notes on the active canvas into a zero-overlap layout across **3 selectable modes**:
    1. **Smart Bento Grid (`bento`):** Full-canvas zero-overlap Bento grid prioritizing primary widgets in hero slots.
    2. **Keep Sizes & Pack (`pack`):** 2D shelf-packing that preserves each card's user-chosen dimensions and aspect ratio without overlapping.
    3. **Split Zones (`split`):** Tiles all Live Widgets on the left (`63%`) and organizes Sticky Notes into a clean corkboard column on the right (`31%`).
  * Includes **1-Click Undo (`RotateCcw`)** to restore your previous manual layout, plus **Smart Open-Space Spawning** so newly created tiles and notes automatically place themselves in unoccupied areas of the board.
* **Interactive Corner Drag Resizing (`↘`), Grab-and-Rotate Handle (`↻`), & 1-Click Fullscreen (`⛶`):**
  * Drag any widget or sticky note's bottom-right grip handle to resize it smoothly (with sticky notes scaling from compact `110px × 90px` mini post-it tags up to `100%` full-board posters).
  * Grab the **top-center Rotate Handle (`↻`)** next to any pushpin to spin notes or widgets smoothly to any angle with a live degree indicator (`14°`), magnetic snap to `0°` within `±2.5°`, and double-click to straighten.
  * Click the Maximize (`Maximize2`) button to expand any widget (such as a Photo Frame or Calendar) to fill 100% of the canvas.
* **Per-Canvas Background Themes, 4K Local Picture Upload & Dim Level Control (`canvasThemes.ts`, `imageUpload.ts`):**
  * Customize each canvas independently during creation (`CreateCanvasModal.tsx`) or in Settings (`SettingsModal.tsx`) with **Midnight Slate Dots**, **Warm Tactile Cork**, **OLED Pitch Black**, **Nordic Aurora**, **Architect Blueprint Grid**, or **Custom Picture Wallpaper**.
  * **Upload Local Picture (Up to 4K Ultra HD `3840×2160`):** Upload any photo from your device (optimized in-browser with native 4K/5K screen resolution support for 100% offline IndexedDB & JSON backup persistence), pick from **4 Curated 4K Photo Presets**, or paste a direct image URL.
  * **Adjustable Background Dim Level (`0%` – `90%`):** Fine-tune the dark contrast veil over any custom background picture with a live preview slider.
* **Custom Canvases & Icon Picker:** Create unlimited boards via the `+` button in the Navigation Dock or Settings, choosing from 16 curated Lucide icons and reorder tabs with 1-click `▲` / `▼` controls.
* **Blank-Canvas Context Menu:** Right-clicking open canvas space gives instant access to **Add Single Photo / GIF**, **New Sticky Note**, and **Add Widget Tile**.

### Multi-Tab Navigation Dock & Automated Carousel
* **4-Edge Dock Placement & Compact Horizontal Pop-Out Panels (`NavigationDock.tsx`):**
  * Position the glassmorphic navigation dock on the **Left, Right, Top, or Bottom** of the screen.
  * All Canvas board buttons (`1`–`0` hotkeys) stay directly accessible on the main toolbar while secondary actions expand into sleek **horizontal pop-out bars** so controls never clip on smaller screens:
    * **`+` Add Menu Pop-Out (`Plus`):** Opens **New Sticky Note**, **Add Widget Tile**, and **Create New Canvas** (while keeping **Auto-Organize (`Wand2`)** and **Archived & Expired Notes (`Archive`)** directly on the toolbar).
    * **Auto-Organize Pop-Out (`Wand2`):** Choose between **Smart Bento Grid**, **Keep Sizes & Pack**, or **Split Zones**, plus a 1-click **Undo Layout** button when a snapshot is available.
    * **Quick Utilities Pop-Out (`SlidersHorizontal`):** Opens **Night Mode**, **Fullscreen**, **Refresh / Apply Update** (with cyan live-update pulse badge), and **Hide Toolbar** right above the 1-click **Settings / Lock** button.
* **Automated Tab Carousel:** Enable auto-rotation (`15s`, `30s`, `45s`, `1m`, `2m`) to cycle across your canvases automatically. Touching or clicking anywhere on the screen temporarily pauses the carousel for 20 seconds.

### Kiosk Hardware & Screen Polish
* **Screen Wake Lock API:** Prevents tablets and smart displays from dimming or locking while the dashboard is open.
* **Fullscreen Kiosk Toggle:** One-tap fullscreen mode via the browser Fullscreen API.
* **Scheduled Night Mode & Burn-In Protection:**
  * Configurable auto-start and morning wake times (`22:00` – `07:00`). Turn off **Automatic Night Schedule** in Settings to only start night mode by hand.
  * **OLED Clock Mode:** Pitch-black `#000000` background with an ultra-dim red digital clock that shifts pixels every 60 seconds (`±15px`) to prevent OLED/LCD image retention.
  * **Dim Overlay Mode:** Adjustable opacity dark veil (`40%`–`95%`).
  * Tap anywhere on the screen to wake immediately.
* **Kid-Proof PIN Lock:**
  * SHA-256 hashed 4-digit PIN lock that disables widget dragging/editing when enabled and prompts for the Parent PIN on every attempt to open **Settings**, **Household Sharing**, or **Plex Pairing** (on both desktop Dock and Mobile Companion viewports, re-locking automatically when those modals or the Parent Chore Drawer close). Setting or changing the PIN requires double-entry confirmation (in both **Settings → Household** and the **Parent Chore Drawer** quick-setup banner) so masked digits cannot be mistyped, and changing an existing PIN keeps your current PIN/locks active until the new confirmed PIN is saved.
  * Device-local PIN and lock states stay isolated from Cloud Sync payloads (`dashboards.settings`) and auto-repair legacy lock residue so restoring from Cloud Sync or toggling a PIN off and back on never leaves Settings unprotected (unless *Require PIN for Command Center Settings* is explicitly turned off).
  * A forgotten PIN is removed with **a code emailed to the account the screen is signed in to** (Forgot PIN? on the PIN pad). Without cloud sign-in, only clearing the site's data removes it.
* **Isolated Canvas Display Density Scaler:** Scale board cards (`75%`, `100%`, `125%`, `150%`) for 1080p, 1440p, or 4K screens while keeping the Navigation Dock and Settings modals pinned at 100% viewport scale.
* **Sticker / No Outline Mode & Global Default Widget Style (`widgetStickerMode.ts`):** Toggle **Sticker / No Outline** per tile across 8 compatible ambient, media, and typography widgets (*Clock*, *World Clock*, *Clock & Weather*, *Weather*, *Countdown*, *Daily Quotes*, *Photo Frame*, and *Text Box*) so content floats cleanly over wallpapers with zero card chrome, or configure a global **Default Widget Style** (*Auto*, *Sticker / No Outline*, or *With Borders*) in **Settings → Display & Kiosk**. Both `defaultWidgetStyle` and per-widget `transparentBg` / `bgStyle` overrides sync across Cloud Sync (flushing pending auto-pushes before sign-out or tab hide) and restore authoritatively via **Restore from Cloud**.

---

## 2. Smart Sticky Notes, Checklists & Corkboard (Phase 2)

* **Per-Canvas Sticky Note Isolation & Board Assignment:**
  * Each canvas owns its own independent sticky notes by default so new canvases start completely clean and deleting a note on one canvas never deletes notes on another.
  * Move any note to another canvas—or explicitly select **📌 Pin to All Canvases**—via the Canvas Board selector inside the Note Creator / Editor modal.
  * Toggle **Show / Hide Sticky Notes (`Eye` / `EyeOff`)** per canvas in Settings to temporarily hide all sticky notes on a board without deleting them.
* **3 Sticky Note Formats (`Text Note`, `Checklist`, & `🛒 Shopping List`):**
  * **Text Note:** Free-form memo pad with auto-wrapping typography.
  * **Checklist:** Interactive to-do items with live strikethrough completion.
  * **Dedicated `🛒 Shopping List` (`ShoppingListNoteBody.tsx`):** Automatically groups unchecked items by grocery store aisle (*🥬 Produce*, *🥩 Meat & Seafood*, *🥛 Dairy & Eggs*, *🥖 Bakery & Bread*, *🥫 Pantry & Dry Goods*, *🧊 Frozen*, *🧴 Household*, and *📦 Other*), includes an inline `+ Add grocery item...` quick-add input directly on the note face, and provides a 1-tap `Clear (X)` button for checked items. Can also be populated automatically from the **Family Meal Planner** via *Send to Sticky Note*.
* **Inline Sticky Note Editing (`✏️` / Double-Click):** Edit any existing note's title, message body, checklist items (add, edit, or delete rows), pastel color, typography scale (`S`, `M`, `L`, `XL`), canvas board assignment, or expiration timer without losing its position, size, or rotation on the corkboard.
* **Wide-Range Sizing & 4 Font Scales (`S / M / L / XL`):** Resize sticky notes from tiny `8%` label tags all the way up to `100%` posters, and choose from Small (`S`), Medium (`M`), Large (`L`), or Poster (`XL`) text scales.
* **6-Color Pastel Palette:** Customize notes in Amber Yellow, Emerald Green, Sky Blue, Rose Pink, Lavender Purple, or Warm Peach.
* **Close Floating Sticky Notes & Smart Canvas Placement (`Corkboard.tsx`, `App.tsx`):**
  * **1-Click Close (`✕`)**: Every floating note on the corkboard features a close button in its header. Closing a note unpins it from the canvas (`isPinnedToCanvas: false`) without deleting it, keeping it active and safe in the Notes Tile.
  * **Pin to Board with Collision Avoidance**: Click `[ 📌 Pin to Board ]` in the Notes Tile to pop notes back onto the corkboard. Ambiently automatically unhides notes, elevates `zIndex`, detects widget coverage, auto-positions into open space, and displays a 2.5s visual pop-out ring.
* **Note Expiration, Smart Duplication & Auto-Cleanup Engine:**
  * Assign notes as **Permanent**, **Expire in 24 Hours**, **Expire in 3 Days**, or pick a **Custom Date/Time**.
  * **Smart Timed Note Duplication:** Duplicating a timed note automatically increments its date by **+1 day** (`+1d` badge) while preserving its local time of day, and exposes an inline **Duplicate Time Shift** bar (`+1d`, `+1w`, `Same`, `Edit`) in the context menu.
  * Notes expiring within 12 hours display an amber warning border and badge.
  * Expired or deleted notes automatically move to the **Trash / Archive Drawer** for 1-click restoration or permanent deletion.
* **Dedicated Sticky Notes Tile (`StickyNotesWidget.tsx`):** In addition to freeform notes pinned directly to the canvas, users can add a compact Sticky Notes list & Trash drawer tile from `+ Add Tile`.

---

## 3. Multi-Source Ambient Photo Frame (Phase 3)

### Clean Ambient Display & Centralized Configuration
* **100% Collision-Free Smart Display:** Presentation styles and photo library source management are located entirely inside **Tile Configuration (`WidgetSettingsModal` / `PhotoSourcesModal`)**. The photo frame itself is kept clean and immersive with only a subtle caption pill on the top-left and photo attribution on the bottom-right, eliminating hover action collisions with `{ ⚙️, ⤢, 🗑️ }`.

### 4 Distinct Visual Display Styles
1. **Ken Burns (Ambient Pan & Zoom):** Full-bleed edge-to-edge crossfades with smooth continuous scale/pan motion and readable gradient vignettes.
2. **Mosaic / Collage Grid:** 4-quadrant multi-photo grid highlighting active frames.
3. **Scattered Polaroids:** Angled vintage photo frames with custom density (`6`, `12`, `18`, `24`, `32` / Fill) and size modes (`Random Sizes` / `Uniform`).
4. **Scrolling Filmstrip:** Horizontal interactive thumbnail ribbon.

### Comprehensive Media Sources (`PhotoSourcesModal.tsx`)
* **Google Photos Shared Albums (Deep batchexecute Pagination):** Paste any public Google Photos shared album link (`photos.app.goo.gl` or `photos.google.com/share`). Automated `snAcKc` batchexecute RPC pagination retrieves massive libraries (tested and benchmarked with 7,500+ photos in ~11s) while maintaining lightweight in-memory descriptors and on-demand lazy loading.
* **Google Drive Public Shared Folders:** Paste public Google Drive folder links (`drive.google.com/drive/folders/...`) to extract all images into high-resolution streamable photos (`=w1920-h1080`) via our `/api/gdrive` serverless extractor.
* **Local PC & NAS Multi-Folder Stacking (5,000+ Photos):** Multi-folder selection using the browser File System Access API with recursive 8-level subdirectory scanning. Includes configurable scan capacity (`1k`, `2.5k`, `5k`, `10k`), live scan progress feedback, and an inline `[ + Add Another Folder ]` action bar.
* **Plex Media Server (1-Scan QR Code PIN Flow):** Generates a 4-digit Plex PIN and scannable QR code (`https://app.plex.tv/auth#?clientID=...&code=...`), auto-discovers your Plex server, and streams photo libraries directly.
* **Curated Photography Presets (`curatedScenery.ts`):** Instant 1-click themed collections (*All Themes*, *National Parks & Mountains*, *Coasts & Turquoise Oceans*, *Deep Woods & Autumn Forests*, *Deep Space & NASA Cosmos*, *Classic Art & Museum Gallery*, *Urban Nights & Cityscapes*, *Cozy Cabin & Warm Living*, *Zen Minimalism & Botany* — 128 photos total) cached in `CacheStorage` (`ambiently-photo-cache-v1`), persisting explicit `curatedCategoryId` metadata so Cloud Sync and backup restores preserve the chosen collection without storing full photo arrays remotely.
* **Shared Board Library vs. Tile-Specific Isolation (`photoSourceIsolation.ts`):** Photo Frame tiles default to following the **Shared Board Library** or can opt into **This Tile Only** (`useCommonSource: false`) to run an independent album (such as a specific *Curated Scenery* pack, Google Photos link, or dedicated Plex folder). Shared-library updates, cloud/local restores, and device Plex pairing never overwrite tile-specific albums, and toggle/restore sanitization strips stale shared Plex/Web residue automatically.
* **Scheduled Automatic Library Rescan & Cooldown-Protected Manual Sync (`photoSyncService.ts`, `photoSyncPolicy.ts`):** Automatically rescans linked **Google Photos** albums, **Google Drive** folders, and **Plex** libraries on a configurable background schedule (**Daily 24h** default, **Weekly 7d**, or **Manual Only**) in **Settings -> Display & Kiosk** and **Photo Sources** so newly added photos appear without manual intervention. Manual **Rescan Now** actions bypass edge caches (`?rescan=1` / `Cache-Control: no-store`) while enforcing a **15-minute anti-spam cooldown** after successful scans (and a 30-second retry backoff on transient errors).

---

## 4. Essential Glanceable Widgets (Phase 4)

Every widget features a top-right **Tile Settings (`⚙️`)** button to customize its title and specific parameters:

* **Clock & Weather Combo (`ClockWeatherWidget.tsx`), Standalone Clock (`ClockWidget.tsx`), World Timezone Clock (`WorldClockWidget.tsx`) & Weather (`WeatherWidget.tsx`):**
  * Live clock supporting **Digital**, **Minimalist**, and **Analog Dial** faces with a universal **Display Seconds (`showSeconds`)** toggle on all clock & time tiles.
  * **City-Lookup World Timezone Clock (`WorldClockWidget.tsx`):** Search any global city (e.g., *Tokyo*, *London*, *Ho Chi Minh City*, *New York*) to automatically resolve its IANA timezone, displaying either a **Single-City Hero Timezone Clock** or a **Multi-City World Timezone Board** with day/night icons (`Sun` / `Moon`), timezone abbreviations, and relative hour offsets (`+15h ahead`, `-2h behind`).
  * Powered by **Open-Meteo API** (zero API key required) with a 1-click **City Geocoding Lookup** in Tile Settings, Fahrenheit/Celsius toggle, current temperature, "feels like", high/lows, and daily forecast strip.
* **Multi-Source Calendar (`CalendarWidget.tsx`):**
  * Toggle between **Chronological Agenda View** and **Monthly Calendar Grid**.
  * Add, toggle, color-tag, or remove multiple public/secret `.ics` and `webcal://` URLs (Google Calendar, Apple iCloud, Outlook) in Tile Settings, parsed via our Cloudflare Pages Edge proxy (`/api/ical`).
* **Ambient Stream & Web Embed Tile (`MediaEmbedWidget.tsx`):**
  * Embed live video/audio streams or web dashboards directly on any canvas with 1-click presets (*Lofi Hip Hop Radio*, *4K Cozy Fireplace*, *NASA ISS Live Earth View*, *Live Weather Radar via Windy.com*) or any custom YouTube / web embed URL, complete with quick audio mute/unmute and reload controls.
* **Daily Quotes & Custom Family Affirmations (`QuotesWidget.tsx`):**
  * Add custom family affirmations, house rules, or personal mantras in Tile Settings, choose between **Curated Only**, **Custom Only**, or **Mix Both**.
  * **Configurable Update Intervals:** Choose auto-rotation speed (`30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `Daily`, `Manual`) with smooth cross-fade opacity transitions and dynamic header badges (`Thought of the Day`, `Thought of the Hour`, `⏱ 1h`).
* **RSS News Ticker, 26 Curated Feeds & In-App Reader Mode (`RssWidget.tsx`, `curatedFeeds.ts`, `InAppWebViewerModal.tsx`):**
  * Browse **26 live-verified curated feeds** across 6 categories (*Featured*, *News*, *Tech*, *Science*, *Lifestyle*, *Sports & Finance*) with category filter pills and instant search, or paste any custom RSS 2.0 / Atom XML URL.
  * Clicking any headline opens the **In-App Kiosk Article Reader (`/api/reader`)** powered by Mozilla Readability and Linkedom, with 1-click switching to **Web Preview (`/api/web-proxy`)** so users never get trapped in an uncloseable fullscreen browser window.
* **Milestone Countdown (`CountdownWidget.tsx`):**
  * Live days/hours/minutes/seconds countdown timer to upcoming vacations, birthdays, or milestones.
* **Animated GIF, Sticker & Picture Tile (`ImageWidget.tsx`) & Custom Text Banner (`TextBoxWidget.tsx`):**
  * Pin frameless transparent stickers, GIPHY animated GIFs (via built-in media search, URL, or the blank-canvas right-click **Add Single Photo / GIF** menu), device-local image uploads (stored in `db.vault` under `vault://local-media:*` with automatic raster downscaling and JSON backup export), or framed images with full `360°` rotation and quick tilt presets (`-6°` to `+6°`). Opaque GIPHY GIFs automatically stream as hardware-accelerated muted looping MP4 videos (`mp4Url`) while transparent stickers and legacy GIPHY URLs upgrade to animated `.webp` to preserve full alpha transparency without per-frame drop-shadow compositor overhead, backed by a bounded offline media cache (`ambiently-media-cache-v1`).
  * Customize typography banners (`TextBoxWidget.tsx`) supporting **Sticker / No Outline** frameless text styling alongside compatible ambient widgets.

---

## 5. Ambiently Family Chore & Reward Engine

* **Global Household Profile & Avatar Engine (`useProfileStore.ts`, `HouseholdProfileManager.tsx`, `AvatarCropModal.tsx`, `avatarCompressor.ts`):**
  * Shared family profiles (`Parent` and `Kid` roles) with a calming low-arousal color palette, 24 preset icons, or custom keyboard emoji entry.
  * **Universal Photo Upload (including iOS 17/18 `.HEIC` / `.HEIF`):** Client-side decoding via `libheif-js` paired with an interactive circular **Avatar Cropper** (drag-to-pan, `1×`–`3×` zoom, and `90°` rotation) that exports lightweight `256×256` WebP avatars synced via IndexedDB and Supabase Realtime.
* **Polymorphic Dual-View Chore & Reward UI (`ChoreWidget.tsx`, `ChoreDashboardView.tsx`):**
  * **Compact Bento Tile (`variant="tile"`):** Filter by *Whole Household* or a specific family member, with collapsible accordions for *Today's Chores*, *Awaiting Parent Review*, and *Completed Today*, plus portal-mounted modals (`createPortal`) so dialogs always frame cleanly over the full screen.
  * **Full-Screen Chore & Reward Hub (`variant="view"`):** 3-column dashboard launched via the Chore tile header's **Maximize** button (or *Full-Screen Hub on Canvas* in Tile Settings) featuring profile point banks, daily/weekly/bounty tasks, and the visual **Reward Store**.
* **Flexible Scheduling Cadences, Parent Participation & Overdue Policies (`choreEngine.ts`, `ParentChoreDrawer.tsx`):**
  * **Cadences:** *Daily*, *Weekdays (Mon–Fri)*, *Weekends (Sat–Sun)*, *Weekly — Any Day (1× / Week)*, *Weekly (Specific Days)*, *Interval (Every N Days)*, and *One-Off Bounty*.
  * **Multi-Member Assignment, Parent Auto-Completion & Duplication:** Assign tasks to any mix of kids and parents in one click, or duplicate any existing chore via the `Copy` button. Tasks completed solely by `Parent` profiles auto-approve immediately without entering the *Awaiting Parent Review* queue.
  * **Shared Chores & Interactive Point Splitting (`PointSplitModal.tsx`):** Shared chores can be claimed by a single family member or split across multiple participants using whole-number point sliders.
  * **Same-Day Chore Skip, 24-Hour Overdue Grace Window & Vacation Mode:** Pending same-day chores expose a touch-friendly **Skip** button for days a recurring chore (like *Homework*) does not apply—moving the item into *Completed Today* with a **Skipped** badge and **0 pts** (`0` ledger entries, no manual deduction needed) and supporting same-day **Undo** until midnight. `Weekly — Any Day (1× / Week)` chores remain hidden for the rest of the calendar week once completed or skipped before respawning on `weekStartsOn`. Unfinished tasks roll over for 24 hours with configurable point policies (*Full 100%*, *Half 50%*, *Zero 0%*, or *Custom %*), include a manual **Dismiss** button, and automatically expire after 24 hours so stale tasks never pile up. Enabling **Vacation Mode** freezes midnight rollovers and penalties while away.
* **Append-Only Audit Ledger, Wishlist Store & Trophy Case (`choreStore.ts`, `ProposeRewardModal.tsx`, `ProposalsTrayModal.tsx`, `TrophyCaseModal.tsx`):**
  * **Immutable Audit Ledger:** Spendable `balance` and `lifetimePoints` are strictly computed from an append-only transaction log (`chore_completion`, `reward_redemption`, `manual_adjustment`, `reversion`).
  * **Wishlist URL Scraper (`/api/metadata`), Proposals Tray & Parent Pricing Calculator:** Kids can propose rewards or paste a product link to auto-extract title, image, and price, filter pending requests in the **Proposals Tray** (*All Pending* or per-profile), and edit or remove unpriced (`needs_pricing`) proposals prior to parent approval. Parents price proposals using the `Points per $1.00` ratio, manage or remove active store goals, and fulfill redeemed rewards into each child's permanent **Trophy Case** (with automatic prior-year image pruning on New Year's rollover).

---

## 6. Family Meal Planner, Smart Grocery Aggregator & Cooking Mode (`v0.5.0` – `v0.5.9`)

* **Flexible Calendar Scopes, Interactive Date Picker & Household Strip (`MealPlannerWidget.tsx`, `useMealStore.ts`):**
  * Add a **Family Meal Planner** widget to any canvas and switch between **Tomorrow**, **3-Day**, or **Full Week (7-Day)** views across configurable meal slots (*Breakfast*, *Lunch*, *Dinner*, *Snack*).
  * **Interactive Month Calendar Selector:** Click the date range pill in the widget header (or the date badge inside the Meal Entry modal) to jump straight to any future week or date via an interactive month grid with scheduled-meal indicator dots and a 1-tap *Today* shortcut.
  * **Household Profile Strip & Inline 1-Tap Cook Picker:** Displays your household avatars directly in the Meal Planner header with quick access to Household settings, plus an inline avatar/name cook badge on every meal card so anyone can claim or reassign cooking duties in a single tap without opening the full editor.
  * **Automatic 21-Day Past Meal Pruning:** Scheduled meal entries older than 21 days in the past are automatically pruned on load and save (recording tombstones for cloud sync) while keeping all saved recipes in your **Recipe Book** untouched.
* **Quick-Meal Autocomplete, Recipe Book & Schema.org URL Scraper (`MealEntryModal.tsx`, `functions/api/metadata.ts`):**
  * **Quick-Text Entry with Dynamic Autocomplete Chips:** Type a quick meal title (*Taco Night*, *Leftovers*) or tap one of up to 8 clickable recent/saved meal pills for instant 1-tap scheduling.
  * **Recipe URL Scraper (`/api/metadata`):** Paste any recipe blog URL to automatically extract Schema.org `Recipe` JSON-LD metadata (`recipeIngredient`, `recipeInstructions` including `HowToStep`/`HowToSection`, `recipeYield`, ISO 8601 `prepTime`/`cookTime`, and hero image).
* **Distraction-Free Kitchen Cooking Mode (`CookingModeModal.tsx`):**
  * Clicking a linked recipe card opens a high-contrast, touch-friendly **Cooking Mode** modal featuring interactive ingredient checkboxes, step-by-step instructions with active step highlighting and progress bar, and automatic **Screen Wake Lock** so the display never dims while your hands are busy in the kitchen.
* **Smart Grocery Aggregator, Google Keep Export & Shopping List Sticky Note Sync (`ingredientAggregator.ts`):**
  * Automatically parses, normalizes, and sums ingredient quantities across your active date window (converting compatible units like `tbsp`/`tsp`/`cup` and grouping by grocery aisle).
  * **1-Click Export & Canvas Sync:** Copy a clean **Google Keep** checklist to your clipboard, or click **To Sticky Note** to push unchecked ingredients directly into a dedicated **`🛒 Shopping List`** sticky note on your active canvas (updating your existing shopping list note in place or creating a new emerald one).

---

## Multi-Board Project Kanban Engine (`KanbanWidget.tsx`, `KanbanBoardView.tsx`, `useKanbanStore.ts`)

* **Zero-Friction, Non-Point Family Task Boards:** Strictly decoupled from the Chore & Reward point ledger and free of PIN gates so any household member can organize home maintenance, 3D print queues, or packing lists immediately.
* **Multi-Board Pool with Independent Per-Widget Selection (`KanbanWidgetConfig`):** Multiple **Project Kanban** Bento tiles across different tabs share the global pool of boards and cards via `useKanbanStore`, while each widget instance independently persists its own `activeBoardId`, `activeColumnId`, and presentation mode (`tile` vs. full 3-column `view`).
* **Classic 3-Column Flow & Inline Quick-Add (`KanbanInlineAdd.tsx`):** Every board uses `To Do`, `In Progress`, and `Done` columns with inline `+ Add card` inputs (`Enter` to create without opening a modal), desaturated Calm Science tag pills (`Sage`, `Slate`, `Dusty Rose`, `Soft Amber`, `Lavender-Gray`), `<ProfileAvatar size="xs"/>` multi-assignee badges, and conditional checklist progress badges (`☑ X/Y`).
* **Polymorphic Compact Tile, Adaptive 3-Column Resizing & Drag-to-Edge (`KanbanWidget.tsx`, `useKanbanPointerDnD.ts`):**
  * Compact tiles default to **`To Do`** on mount with header column-stepper controls (`← To Do (N)` / `In Progress (N) →`).
  * Supports **dual cross-column card movement**: single-tap `←`/`→` card chevrons for quick wall-kiosk triage plus unified mouse/touch drag-and-drop with ~350ms **Drag-to-Edge** hover highlights that flip the active column mid-drag so cards drop at the exact vertical index.
  * **Responsive Width Adaptation:** Resizing a **Project Kanban** tile wider automatically switches it into a side-by-side **3-column swimlane layout** right on the canvas (with per-column quick-add and horizontal/vertical drag-and-drop), while clicking **Maximize** or switching to **Full 3-Column Board** expands all 3 lanes across the full screen (`KanbanBoardView.tsx`).
* **Done Lifecycle, Auto-Archive & Per-Board Archive Drawer (`KanbanArchiveDrawer.tsx`):**
  * Entering `Done` stamps `completedAt` (and moving a card back to `To Do` or `In Progress` clears it).
  * Configurable per-board `autoArchiveDays` (`Off`, `1`, `3`, `7`, `14`, `30` days) evaluated at startup and on hourly/midnight/visibility ticks, plus one-tap **Archive All Done** and confirmation-gated permanent **Clear Done**.
  * **Archive Drawer (`Archived (X)`):** Searchable chronological archive per board with 1-tap **Restore** back to `To Do` or `Done` (preserving checklist items for reusable packing/prep templates), single-card delete, and confirmation-gated **Empty Archive**.

---

## 7. Mobile Companion Mode & Hybrid Sync (Phase 5)

* **Vertical Tile Stream (`MobileCompanion.tsx`):**
  * Automatically serves a structured single-column vertical feed of the active canvas when opened on a smartphone (`< 768px`).
  * **Live Preview Cards:** Every canvas widget (Clock & Weather, Countdown, Photos, RSS, Quotes, Media, Notes, Chores, Meal Planner, Project Kanban) renders a live mobile-responsive preview card.
  * **Persistent View Option Filter:** 3-way segmented filter pills (`All Tiles` | `Widgets` | `Notes & Tasks`) automatically persisted in `localStorage`.
  * **Independent Mobile Reordering (`▲` / `▼`):** Move buttons on each widget card modify an isolated `mobileOrder` property with zero impact on the desktop/kiosk layout.
  * **Mobile Tile Settings & Creation:** 1-tap `⚙️` button opens the full tile customizer on mobile, plus a `+ Add Tile` button to add new widgets from your phone.
  * **Hardware Momentum Touch Scrolling:** Bound to `fixed inset-0 w-full h-[100dvh]` with `touch-action: pan-y` and momentum scrolling for smooth vertical swiping.
* **Quick Note & Inline Mobile Editing:** Post new notes/checklists to the selected canvas, edit existing notes (`✏️`), or append new items (`+ Add item`) to existing checklists directly from your phone.
* **Remote Tab Switcher:** Tap any tab pill on your phone to view and manage that canvas's widgets and notes.
* **Household Email Invitations (`ShareBoardModal.tsx`):**
  * Invite a family member by email. They sign in with that address, then accept the invitation in the same screen before their device joins the board. They can decline, or leave later.
* **3-Tier Persistence & Backup:**
  1. **Tier 1 (Default - Primary Storage):** 100% local IndexedDB storage (`Dexie.js`). All widgets, notes, checklists, canvas configurations, themes, and layouts persist in browser storage. Zero network or server dependencies; the app boots in 0ms offline even if external files are unlinked.
  2. **Tier 2 (Local PC Auto-Sync & File Mirroring):**
     * **Chromium File System Access API:** Connects directly to a local JSON file (`ambiently-data.json`) on your computer's hard drive or mapped network share.
     * **Persistent Handle in IndexedDB:** Stores the `FileSystemFileHandle` across browser reloads. On reload, Ambiently automatically re-checks permissions silently via `queryPermission()`, and offers a 1-click **Reconnect Auto-Sync** button if browser security requires re-authorization—eliminating the need to re-browse folders.
     * **Reactive Event-Driven Snapshots:** Automatically writes state snapshots whenever widgets, notes, or canvases are updated (debounced and queued safely to avoid write stream collisions or unnecessary disk I/O when idle).
     * **Cloud Folder Synergy:** Saving `ambiently-data.json` inside a local **Dropbox, Google Drive, OneDrive, Nextcloud, or Synology Drive** folder automatically mirrors and versions your dashboard across all your computers without routing through third-party dashboard servers.
     * **Universal Cross-Platform Fallback:** 1-click **Download .json** and **Upload & Restore** works across all modern browsers and operating systems (macOS, Windows, Linux, iOS, Android, Safari, Firefox).
  3. **Tier 3 (Cloud Sync):** Optional email magic-link login and multi-device real-time sync powered by Supabase Auth & Postgres.

---

## 8. Docker Self-Hosting & Raspberry Pi Kiosk Edition (Phase 6)

* **Multi-Architecture Docker & Compose Stack (`Dockerfile`, `compose.yaml`, `server/index.ts`, `vite.server.config.ts`):**
  * Bundles `server/index.ts` and all 7 `/api/*` handlers into a single zero-dependency Node ESM bundle (`dist-server/index.mjs`) alongside the built PWA (`dist/`) inside a lightweight non-root `node:22-alpine` container (`linux/amd64` for PCs, Synology, Unraid, and Proxmox + `linux/arm64` for Raspberry Pi 4/5, Apple Silicon, and ARM SBCs).
  * Includes immutable `/assets/*` caching (`max-age=31536000, immutable`), an in-memory `gzip` static asset cache, strict `no-cache` headers for `sw.js`/`version.json`/`index.html`, SPA history fallback, and a built-in `/api/health` container readiness endpoint.
* **Zero-Rebuild Runtime Cloud Sync Injection (`/config.js`):**
  * Pass `SUPABASE_URL` and `SUPABASE_ANON_KEY` at container runtime via `.env` or `compose.yaml` without rebuilding the Docker image—preserving Workbox Service Worker precache integrity while caching credentials in `localStorage` for instant offline cold boots.
* **Opt-In Private Home LAN Feeds (`AMBIENTLY_ALLOW_PRIVATE_FEEDS=true`):**
  * Enables self-hosted home-lab deployments to subscribe to private RFC1918 LAN / Tailscale / `.local` `.ics` calendars and RSS feeds (e.g., Nextcloud, Radicale, Home Assistant, FreshRSS) while keeping loopback (`127.0.0.1` / `localhost`) and cloud metadata (`169.254.169.254`) strictly blocked.
* **Automated Raspberry Pi Kiosk & All-in-One Appliance Installer (`scripts/pi-kiosk-setup.sh`, [`RASPBERRY_PI.md`](./RASPBERRY_PI.md)):**
  * 1-command installer for Raspberry Pi OS (Bookworm Wayland `labwc`/`wayfire` & X11) supporting two deployment modes:
    1. **Kiosk Display Mode (`--mode kiosk`):** Auto-boots fullscreen Chromium pointing to `https://dashboard.trinhism.com` or any LAN Docker URL (`http://nas.local:8080`).
    2. **All-in-One Standalone Mode (`--mode standalone`):** Installs Docker Engine, builds & launches the ARM64 Ambiently container locally (`restart: unless-stopped`), waits for `/api/health` readiness, and launches fullscreen Chromium to `http://localhost:8080`.
  * Configures cursor auto-hiding (`unclutter`), disables HDMI DPMS blanking, clears Chromium crash recovery bubbles on unclean power loss, supports `0°` / `90°` / `180°` / `270°` portrait/landscape screen rotation (`--rotate`), and includes a clean `--uninstall` flag.
