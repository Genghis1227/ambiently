export const TOP_EDGE_CLEARANCE_RATIO = 0.055;
export const BOTTOM_EDGE_CLEARANCE_RATIO = 0.945;

export type WidgetToolbarPlacement = 'outside-top' | 'outside-bottom' | 'compact-pill';

export interface WidgetToolbarPlacementInput {
  isFullScreen: boolean;
  yRatio: number;
  hRatio: number;
}

/**
 * Resolves where a widget tile's floating action bar renders so it never covers widget headers or
 * top-right controls inside the tile:
 * - `'outside-top'` above the card when there is top clearance
 * - `'outside-bottom'` below the card when the card sits near the top edge (e.g. Bento Grid top rows)
 * - `'compact-pill'` when fullscreen or spanning both top and bottom edges
 */
export function resolveWidgetToolbarPlacement({
  isFullScreen,
  yRatio,
  hRatio,
}: WidgetToolbarPlacementInput): WidgetToolbarPlacement {
  if (isFullScreen) return 'compact-pill';

  const y = Number.isFinite(yRatio) ? yRatio : 0.1;
  const h = Number.isFinite(hRatio) ? hRatio : 0.45;

  if (y < TOP_EDGE_CLEARANCE_RATIO) {
    return y + h <= BOTTOM_EDGE_CLEARANCE_RATIO ? 'outside-bottom' : 'compact-pill';
  }

  return 'outside-top';
}

export const WIDGET_TYPES_WITH_INTERNAL_EXPAND = new Set<string>(['chores', 'kanban']);

/**
 * Returns whether a widget tile's floating canvas toolbar should render its
 * Maximize / Minimize button. Widgets with a dedicated internal header expand
 * button (`chores`, `kanban`) omit the duplicate Maximize icon in tile mode
 * (persistent full-screen canvas modes remain available in Tile Settings), while
 * keeping Minimize available whenever the tile is already fullscreen on the canvas.
 */
export function shouldShowWidgetToolbarFullscreenButton(
  widgetType: string,
  isFullScreen: boolean
): boolean {
  if (isFullScreen) return true;
  return !WIDGET_TYPES_WITH_INTERNAL_EXPAND.has(widgetType);
}
