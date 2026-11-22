import type { ChoreWidgetConfig } from '../types/chores';
import type { DashboardWidget, FreeformPosition } from '../types/dashboard';
import type { KanbanWidgetConfig } from '../types/kanban';

export const FULL_BLEED_FULLSCREEN_WIDGET_TYPES = new Set<string>([
  'photo_frame',
  'image',
  'embed',
]);

export const SELF_DOCK_PADDED_FULLSCREEN_WIDGET_TYPES = new Set<string>([
  'chores',
  'kanban',
]);

export const SELF_CONTENT_PADDED_FULLSCREEN_WIDGET_TYPES = new Set<string>([
  'chores',
  'kanban',
  'meals',
  'chalkboard',
]);

export interface FullScreenCardLayoutClasses {
  outerClass: string;
  innerPaddingClass: string;
}

/**
 * Resolves outer card and inner wrapper padding classes when a widget fills the canvas:
 * - Full-bleed visual media (`photo_frame`, `image`, `embed`) renders edge-to-edge behind the dock.
 * - `chores` and `kanban` hub views handle both `dockPaddingClass` and internal chrome padding themselves.
 * - `meals` and `chalkboard` provide their own internal padding, so only `dockPaddingClass` is added on the outer shell.
 * - All other widgets apply `dockPaddingClass` on the outer shell (so card background stays edge-to-edge)
 *   and `p-4` on the inner content wrapper.
 */
export function resolveFullScreenCardLayoutClasses(
  widgetType: string,
  dockPaddingClass: string
): FullScreenCardLayoutClasses {
  const safeDockPadding = dockPaddingClass ? dockPaddingClass.trim() : '';

  if (FULL_BLEED_FULLSCREEN_WIDGET_TYPES.has(widgetType)) {
    return {
      outerClass: 'rounded-none border-0 p-0 overflow-hidden',
      innerPaddingClass: '',
    };
  }

  if (SELF_DOCK_PADDED_FULLSCREEN_WIDGET_TYPES.has(widgetType)) {
    return {
      outerClass: 'rounded-none border-0 p-0 overflow-hidden',
      innerPaddingClass: '',
    };
  }

  const outerWithDock = safeDockPadding
    ? `rounded-none border-0 p-0 overflow-hidden ${safeDockPadding}`
    : 'rounded-none border-0 p-0 overflow-hidden';

  if (SELF_CONTENT_PADDED_FULLSCREEN_WIDGET_TYPES.has(widgetType)) {
    return {
      outerClass: outerWithDock,
      innerPaddingClass: '',
    };
  }

  return {
    outerClass: outerWithDock,
    innerPaddingClass: 'p-4',
  };
}

export interface RestoreTileGeometry {
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
  rotation: number;
}

const DEFAULT_RESTORE_GEOMETRY: RestoreTileGeometry = {
  xRatio: 0.1,
  yRatio: 0.1,
  wRatio: 0.45,
  hRatio: 0.5,
  rotation: 0,
};

function clampTileRatio(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeGeometrySnapshot(
  candidate: Partial<RestoreTileGeometry> | undefined,
  fallback: RestoreTileGeometry = DEFAULT_RESTORE_GEOMETRY
): RestoreTileGeometry {
  if (!candidate) return { ...fallback };
  const xRatio =
    typeof candidate.xRatio === 'number' && Number.isFinite(candidate.xRatio)
      ? candidate.xRatio
      : fallback.xRatio;
  const yRatio =
    typeof candidate.yRatio === 'number' && Number.isFinite(candidate.yRatio)
      ? candidate.yRatio
      : fallback.yRatio;
  const wRatio =
    typeof candidate.wRatio === 'number' && Number.isFinite(candidate.wRatio)
      ? clampTileRatio(candidate.wRatio, 0.05, 1)
      : fallback.wRatio;
  const hRatio =
    typeof candidate.hRatio === 'number' && Number.isFinite(candidate.hRatio)
      ? clampTileRatio(candidate.hRatio, 0.05, 1)
      : fallback.hRatio;
  const rotation =
    typeof candidate.rotation === 'number' && Number.isFinite(candidate.rotation)
      ? candidate.rotation
      : fallback.rotation;
  return { xRatio, yRatio, wRatio, hRatio, rotation };
}

function hasValidRestorePos(
  restorePos: FreeformPosition['restorePos']
): restorePos is RestoreTileGeometry {
  return Boolean(
    restorePos &&
      typeof restorePos.xRatio === 'number' &&
      Number.isFinite(restorePos.xRatio) &&
      typeof restorePos.yRatio === 'number' &&
      Number.isFinite(restorePos.yRatio) &&
      typeof restorePos.wRatio === 'number' &&
      Number.isFinite(restorePos.wRatio) &&
      typeof restorePos.hRatio === 'number' &&
      Number.isFinite(restorePos.hRatio) &&
      typeof restorePos.rotation === 'number' &&
      Number.isFinite(restorePos.rotation)
  );
}

/**
 * Transitions a freeform widget position into canvas fullscreen mode while
 * snapshotting its pre-fullscreen coordinates and rotation in `restorePos`.
 * Idempotent if the tile is already fullscreen with a valid `restorePos`.
 */
export function buildMaximizedFreeformPos(pos: FreeformPosition): FreeformPosition {
  const savedRestorePos =
    pos.isFullScreen && hasValidRestorePos(pos.restorePos)
      ? {
          xRatio: pos.restorePos.xRatio,
          yRatio: pos.restorePos.yRatio,
          wRatio: clampTileRatio(pos.restorePos.wRatio, 0.05, 1),
          hRatio: clampTileRatio(pos.restorePos.hRatio, 0.05, 1),
          rotation: pos.restorePos.rotation,
        }
      : sanitizeGeometrySnapshot(pos, DEFAULT_RESTORE_GEOMETRY);

  return {
    ...pos,
    xRatio: 0,
    yRatio: 0,
    wRatio: 1,
    hRatio: 1,
    rotation: 0,
    isFullScreen: true,
    restorePos: savedRestorePos,
  };
}

/**
 * Restores a fullscreen widget back to its saved `restorePos` (or `fallback` for legacy
 * fullscreen tiles without a snapshot) and removes `restorePos`.
 */
export function buildRestoredFreeformPos(
  pos: FreeformPosition,
  fallback: RestoreTileGeometry = DEFAULT_RESTORE_GEOMETRY
): FreeformPosition {
  const restored = hasValidRestorePos(pos.restorePos)
    ? {
        xRatio: pos.restorePos.xRatio,
        yRatio: pos.restorePos.yRatio,
        wRatio: clampTileRatio(pos.restorePos.wRatio, 0.05, 1),
        hRatio: clampTileRatio(pos.restorePos.hRatio, 0.05, 1),
        rotation: pos.restorePos.rotation,
      }
    : { ...fallback };

  const next: FreeformPosition = {
    ...pos,
    ...restored,
    isFullScreen: false,
  };
  delete next.restorePos;
  return next;
}

export interface ChoreOverlayContext {
  tabId: string | null;
  widgetId?: string;
  title?: string;
  config?: ChoreWidgetConfig;
}

export interface VisibleChoreOverlay {
  tabId: string | null;
  widgetId?: string;
  title?: string;
  config?: ChoreWidgetConfig;
}

/**
 * Resolves whether an open Chores fullscreen overlay should render on the active canvas.
 * Tab-scoped overlays hide while rotating or switching to other canvases and reappear
 * when returning to their originating canvas (unless the originating widget was removed).
 */
export function resolveVisibleChoreOverlay(params: {
  isFullScreenOpen: boolean;
  fullScreenContext: ChoreOverlayContext | null;
  activeTabId: string;
  activeTabWidgets: DashboardWidget[];
}): VisibleChoreOverlay | null {
  const { isFullScreenOpen, fullScreenContext, activeTabId, activeTabWidgets } = params;
  if (!isFullScreenOpen) return null;

  if (!fullScreenContext || fullScreenContext.tabId === null) {
    return {
      tabId: null,
      widgetId: undefined,
      title: fullScreenContext?.title,
      config: fullScreenContext?.config,
    };
  }

  if (fullScreenContext.tabId !== activeTabId) {
    return null;
  }

  if (fullScreenContext.widgetId) {
    const liveWidget = activeTabWidgets.find(
      (w) => !w.deleted_at && w.type === 'chores' && w.id === fullScreenContext.widgetId
    );
    if (!liveWidget) {
      return null;
    }
    return {
      tabId: fullScreenContext.tabId,
      widgetId: liveWidget.id,
      title: liveWidget.title,
      config: liveWidget.config as ChoreWidgetConfig | undefined,
    };
  }

  return {
    tabId: fullScreenContext.tabId,
    title: fullScreenContext.title,
    config: fullScreenContext.config,
  };
}

export interface KanbanOverlayContext {
  widgetId: string;
  tabId: string | null;
  title?: string;
  config?: Partial<KanbanWidgetConfig>;
  isLight?: boolean;
}

/**
 * Resolves whether an open Kanban fullscreen overlay should render on the active canvas.
 * Matches tab-scoped overlays to `activeTabId` and keeps live widget title/config in sync.
 */
export function resolveVisibleKanbanOverlay(params: {
  fullScreenOverlay: KanbanOverlayContext | null;
  activeTabId: string;
  activeTabWidgets: DashboardWidget[];
}): KanbanOverlayContext | null {
  const { fullScreenOverlay, activeTabId, activeTabWidgets } = params;
  if (!fullScreenOverlay) return null;

  if (fullScreenOverlay.tabId !== null && fullScreenOverlay.tabId !== activeTabId) {
    return null;
  }

  const liveWidget = activeTabWidgets.find(
    (w) => !w.deleted_at && w.type === 'kanban' && w.id === fullScreenOverlay.widgetId
  );

  if (fullScreenOverlay.tabId !== null && !liveWidget) {
    return null;
  }

  return {
    widgetId: fullScreenOverlay.widgetId,
    tabId: fullScreenOverlay.tabId,
    title: liveWidget?.title ?? fullScreenOverlay.title,
    config: (liveWidget?.config as Partial<KanbanWidgetConfig> | undefined) ?? fullScreenOverlay.config,
    isLight: fullScreenOverlay.isLight,
  };
}
