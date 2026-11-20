import type { DashboardWidget, WidgetType } from '../types/dashboard';

const preloadedWidgetTypes = new Set<WidgetType>();

const WIDGET_CHUNK_LOADERS: Partial<Record<WidgetType, () => Promise<unknown>>> = {
  world_clock: () => import('../components/widgets/WorldClockWidget'),
  weather: () => import('../components/widgets/WeatherWidget'),
  sticky_notes: () => import('../components/widgets/StickyNotesWidget'),
  photo_frame: () => import('../components/widgets/PhotoFrameWidget'),
  calendar: () => import('../components/widgets/CalendarWidget'),
  countdown: () => import('../components/widgets/CountdownWidget'),
  rss: () => import('../components/widgets/RssWidget'),
  quotes: () => import('../components/widgets/QuotesWidget'),
  embed: () => import('../components/widgets/MediaEmbedWidget'),
  image: () => import('../components/widgets/ImageWidget'),
  chores: () => import('../components/widgets/ChoreWidget'),
  meals: () => import('../components/widgets/MealPlannerWidget'),
  kanban: () => import('../components/widgets/KanbanWidget'),
  finance: () => import('../components/widgets/FinanceWidget'),
  timer: () => import('../components/widgets/TimerWidget'),
  air_quality: () => import('../components/widgets/AirQualityWidget'),
  sun_moon: () => import('../components/widgets/SunMoonWidget'),
  routines: () => import('../components/widgets/RoutinesWidget'),
  wifi_qr: () => import('../components/widgets/WifiQrWidget'),
  decision_maker: () => import('../components/widgets/DecisionMakerWidget'),
  sports: () => import('../components/widgets/SportsWidget'),
  daily_discovery: () => import('../components/widgets/DailyDiscoveryWidget'),
  chalkboard: () => import('../components/widgets/ChalkboardWidget'),
  soundscape: () => import('../components/widgets/SoundscapeWidget'),
  homelab: () => import('../components/widgets/HomelabWidget'),
};

/**
 * Returns the deduplicated list of lazy widget types residing on enabled non-active tabs
 * so they can be warmed at idle before carousel rotation or canvas swipe switches to them.
 */
export function getBackgroundCanvasWidgetTypes(
  widgets: Pick<DashboardWidget, 'type' | 'tabId' | 'deleted_at'>[],
  activeTabId: string,
  enabledTabIds: Set<string>
): WidgetType[] {
  const seen = new Set<WidgetType>();
  const result: WidgetType[] = [];

  for (const w of widgets) {
    if (w.deleted_at) continue;
    if (w.tabId === activeTabId) continue;
    if (!enabledTabIds.has(w.tabId)) continue;
    if (!WIDGET_CHUNK_LOADERS[w.type]) continue;
    if (seen.has(w.type)) continue;
    seen.add(w.type);
    result.push(w.type);
  }

  return result;
}

/**
 * Dynamically pre-warms lazy widget chunks once per widget type during browser idle time.
 */
export async function preloadWidgetChunksForTypes(types: Iterable<WidgetType>): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const type of types) {
    if (preloadedWidgetTypes.has(type)) continue;
    const loader = WIDGET_CHUNK_LOADERS[type];
    if (!loader) continue;
    preloadedWidgetTypes.add(type);
    pending.push(
      loader().catch(() => {
        // Allow retry if a transient network glitch aborted preload
        preloadedWidgetTypes.delete(type);
      })
    );
  }
  if (pending.length > 0) {
    await Promise.all(pending);
  }
}
