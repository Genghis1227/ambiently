import { getCuratedCategoryById, inferCuratedCategoryId } from '../data/curatedScenery';
import type { AppSettings, DashboardWidget } from '../types/dashboard';
import { isSamePlexSyncConfig, type PlexPhotoSyncConfig } from './photoSyncPolicy';

const SHARED_DUPLICATE_CONFIG_FIELDS = [
  'sourceType',
  'sourceLabel',
  'sourceUrl',
  'plexSyncConfig',
  'curatedCategoryId',
] as const;

function plexConfigsMatch(a?: PlexPhotoSyncConfig | null, b?: PlexPhotoSyncConfig | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return isSamePlexSyncConfig(a, b);
}

/**
 * Updates `photo_frame` widgets following the Shared Board Library while leaving
 * any explicit `"This Tile Only"` (`useCommonSource === false`) widgets untouched,
 * unless named by `optInWidgetId` (explicitly promoted or switched into shared mode).
 */
export function applySharedPhotoUpdateToWidgets(
  widgets: DashboardWidget[],
  optInWidgetId?: string,
  nowIso = new Date().toISOString()
): { widgets: DashboardWidget[]; changedWidgets: DashboardWidget[] } {
  const changedWidgets: DashboardWidget[] = [];

  const nextWidgets = widgets.map((w) => {
    if (w.type !== 'photo_frame' || w.deleted_at) {
      return w;
    }

    const isOptIn = Boolean(optInWidgetId && w.id === optInWidgetId);
    if (w.config?.useCommonSource === false && !isOptIn) {
      return w;
    }

    const prevConfig = w.config || {};
    const hasOwnCustomPhotos =
      Array.isArray(prevConfig.customPhotos) && prevConfig.customPhotos.length > 0;
    const shouldClearDuplicateFields = isOptIn || !hasOwnCustomPhotos;

    let hasChanges = prevConfig.useCommonSource !== true;
    const nextConfig: Record<string, any> = {
      ...prevConfig,
      useCommonSource: true,
    };

    if (shouldClearDuplicateFields) {
      for (const field of SHARED_DUPLICATE_CONFIG_FIELDS) {
        if (prevConfig[field] !== undefined) {
          nextConfig[field] = undefined;
          hasChanges = true;
        }
      }
    }

    if (isOptIn && prevConfig.customPhotos !== undefined) {
      nextConfig.customPhotos = undefined;
      hasChanges = true;
    }

    if (!hasChanges) {
      return w;
    }

    const updatedWidget: DashboardWidget = {
      ...w,
      config: nextConfig,
      updated_at: nowIso,
    };
    changedWidgets.push(updatedWidget);
    return updatedWidget;
  });

  return { widgets: nextWidgets, changedWidgets };
}

/**
 * Normalizes config updates when a `photo_frame` widget is saved in `"This Tile Only"`
 * (`useCommonSource: false`) mode so stale Shared Board Library metadata cannot leak
 * into tile-specific sync or cloud restore.
 */
export function normalizeTileOnlyWidgetConfig(prevConfig?: Record<string, any>): Record<string, any> {
  const hasCustomPhotos =
    Array.isArray(prevConfig?.customPhotos) && prevConfig.customPhotos.length > 0;

  // Switching from Shared Board Library -> This Tile Only without tile-owned photos
  // resets the tile to clean Curated Ambient instead of inheriting shared Plex/Web config.
  if (prevConfig?.useCommonSource !== false && !hasCustomPhotos) {
    return {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated Ambient',
      curatedCategoryId: 'all',
      sourceUrl: undefined,
      plexSyncConfig: undefined,
    };
  }

  const inferredCuratedId = inferCuratedCategoryId(
    prevConfig?.curatedCategoryId,
    prevConfig?.sourceLabel
  );
  const isCuratedTile =
    prevConfig?.sourceType === 'curated' ||
    (!prevConfig?.sourceType && Boolean(inferredCuratedId));

  if (isCuratedTile) {
    const catId = inferredCuratedId || 'all';
    const cat = getCuratedCategoryById(catId);
    return {
      useCommonSource: false,
      sourceType: 'curated',
      curatedCategoryId: catId,
      sourceLabel:
        prevConfig?.sourceLabel || (catId === 'all' ? 'Curated Ambient' : `Curated (${cat.name})`),
      sourceUrl: undefined,
      plexSyncConfig: undefined,
    };
  }

  return { useCommonSource: false };
}

/**
 * Repairs legacy or restored `photo_frame` widgets:
 * - Clears shared Plex/Web residue left on `"This Tile Only"` widgets that lack `customPhotos`.
 * - Backfills explicit `curatedCategoryId` on curated tile-only widgets for pure-config sync.
 */
export function sanitizeRestoredPhotoWidget(
  widget: DashboardWidget
): { widget: DashboardWidget; repaired: boolean } {
  if (widget.type !== 'photo_frame' || !widget.config || widget.deleted_at) {
    return { widget, repaired: false };
  }

  const config = widget.config;
  if (config.useCommonSource !== false) {
    return { widget, repaired: false };
  }

  // Case A: Curated Scenery tile-only widget missing explicit `curatedCategoryId` or carrying stale fields.
  // Check this before generic residue cleanup so explicit curated metadata/category names are preserved.
  const inferredCuratedId = inferCuratedCategoryId(config.curatedCategoryId, config.sourceLabel);
  const isCuratedTile =
    config.sourceType === 'curated' || (!config.sourceType && Boolean(inferredCuratedId));
  if (isCuratedTile) {
    const catId = inferredCuratedId || 'all';
    if (
      config.curatedCategoryId !== catId ||
      config.sourceType !== 'curated' ||
      config.plexSyncConfig !== undefined ||
      config.sourceUrl !== undefined
    ) {
      return {
        widget: {
          ...widget,
          config: {
            ...config,
            sourceType: 'curated',
            curatedCategoryId: catId,
            plexSyncConfig: undefined,
            sourceUrl: undefined,
          },
        },
        repaired: true,
      };
    }
    return { widget, repaired: false };
  }

  // Case B: Legacy residue from old applyCommonPhotosToAllWidgets before switching to This Tile Only.
  // Genuine tile-specific Plex/Web widgets always set `customPhotos` to an array (preserved as `[]`
  // after Cloud Pull stripping), whereas shared-mode residue left `customPhotos === undefined`.
  const hasResidueType = Boolean(config.sourceType && config.sourceType !== 'curated');
  const hasResidueConfig = Boolean(config.plexSyncConfig || config.sourceUrl);
  if (config.customPhotos === undefined && (hasResidueType || hasResidueConfig)) {
    return {
      widget: {
        ...widget,
        config: {
          ...config,
          sourceType: 'curated',
          sourceLabel: 'Curated Ambient',
          curatedCategoryId: 'all',
          sourceUrl: undefined,
          plexSyncConfig: undefined,
        },
      },
      repaired: true,
    };
  }

  return { widget, repaired: false };
}

/**
 * Checks whether an incoming cloud widget config points to the exact same photo album source as
 * the local widget config before reusing cached local `customPhotos`.
 */
export function isSameWidgetPhotoSource(
  incomingConfig?: Record<string, any>,
  localConfig?: Record<string, any>
): boolean {
  if (!incomingConfig || !localConfig) return false;
  if ((incomingConfig.useCommonSource !== false) !== (localConfig.useCommonSource !== false)) {
    return false;
  }
  if (incomingConfig.sourceType === 'curated') {
    return false;
  }
  return (
    (incomingConfig.sourceType || '') === (localConfig.sourceType || '') &&
    (incomingConfig.sourceUrl || '') === (localConfig.sourceUrl || '') &&
    (incomingConfig.sourceLabel || '') === (localConfig.sourceLabel || '') &&
    plexConfigsMatch(incomingConfig.plexSyncConfig, localConfig.plexSyncConfig)
  );
}

/**
 * Checks whether incoming cloud settings point to the exact same shared library source as
 * the local settings before reusing cached local `commonPhotos`.
 */
export function isSameCommonPhotoSource(
  incomingSettings?: Partial<AppSettings>,
  localSettings?: Partial<AppSettings>
): boolean {
  if (!incomingSettings || !localSettings) return false;
  if (incomingSettings.commonPhotoSourceType === 'curated') {
    return false;
  }
  return (
    (incomingSettings.commonPhotoSourceType || '') === (localSettings.commonPhotoSourceType || '') &&
    (incomingSettings.commonPhotoSourceUrl || '') === (localSettings.commonPhotoSourceUrl || '') &&
    (incomingSettings.commonPhotoSourceLabel || '') === (localSettings.commonPhotoSourceLabel || '') &&
    plexConfigsMatch(incomingSettings.commonPhotoPlexConfig, localSettings.commonPhotoPlexConfig)
  );
}
