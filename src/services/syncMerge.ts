import type { DashboardTab, DashboardWidget, StickyNoteItem } from '../types/dashboard';

// Some fields never reach the cloud tables:
// - a photo frame's photo list (customPhotos) and a widget's order on the phone view (mobileOrder) stay
//   on each device
// - a canvas's look (theme, wallpaper, dimming, hidden notes, home canvas) syncs inside the board
//   settings (canvasThemes), not in the tabs table
// - a note closed from the canvas, and a note's text color and pictures, have no column
// A row from the cloud doesn't carry them, so these copy them over from this device's copy rather
// than erase them.

const TAB_FIELDS_KEPT_ELSEWHERE = [
  'backgroundTheme',
  'customWallpaperUrl',
  'backgroundDimLevel',
  'hideNotes',
  'isHome',
  'enabled',
] as const;

const NOTE_FIELDS_NOT_IN_CLOUD = ['isPinnedToCanvas', 'textColor', 'imageUrl', 'giphyUrl'] as const;

export function keepLocalWidgetFields(incoming: DashboardWidget, local?: DashboardWidget): DashboardWidget {
  if (!local) return incoming;
  const merged: DashboardWidget = { ...incoming };
  if (incoming.mobileOrder === undefined && local.mobileOrder !== undefined) {
    merged.mobileOrder = local.mobileOrder;
  }
  const localPhotos = local.config?.customPhotos;
  if (Array.isArray(localPhotos) && localPhotos.length > 0 && !incoming.config?.customPhotos?.length) {
    merged.config = { ...(incoming.config || {}), customPhotos: localPhotos };
  }
  return merged;
}

export function keepLocalTabFields(incoming: DashboardTab, local?: DashboardTab): DashboardTab {
  if (!local) return incoming;
  const merged: DashboardTab = { ...incoming };
  for (const field of TAB_FIELDS_KEPT_ELSEWHERE) {
    if (merged[field] === undefined && local[field] !== undefined) {
      (merged as unknown as Record<string, unknown>)[field] = local[field];
    }
  }
  return merged;
}

export function keepLocalNoteFields(incoming: StickyNoteItem, local?: StickyNoteItem): StickyNoteItem {
  if (!local) return incoming;
  const merged: StickyNoteItem = { ...incoming };
  for (const field of NOTE_FIELDS_NOT_IN_CLOUD) {
    if (merged[field] === undefined && local[field] !== undefined) {
      (merged as unknown as Record<string, unknown>)[field] = local[field];
    }
  }
  return merged;
}

/** The canvas look fields of a tab, which sync inside the board settings (canvasThemes). */
export const CANVAS_LOOK_FIELDS = ['backgroundTheme', 'customWallpaperUrl', 'backgroundDimLevel', 'hideNotes', 'isHome'] as const;
