import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CURATED_PHOTOS,
  MOUNTAIN_PHOTOS,
  ZEN_PHOTOS,
  inferCuratedCategoryId,
  resolveCuratedPhotos,
} from '../src/data/curatedScenery';
import {
  applySharedPhotoUpdateToWidgets,
  isSameCommonPhotoSource,
  isSameWidgetPhotoSource,
  normalizeTileOnlyWidgetConfig,
  sanitizeRestoredPhotoWidget,
} from '../src/utils/photoSourceIsolation';
import { keepLocalWidgetFields } from '../src/services/syncMerge';
import type { DashboardWidget } from '../src/types/dashboard';

function makePhotoWidget(id: string, config: Record<string, any> = {}): DashboardWidget {
  return {
    id,
    tabId: 'tab-corkboard',
    type: 'photo_frame',
    title: 'Memories',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    config,
    updated_at: '2026-11-13T10:00:00.000Z',
  };
}

describe('curatedScenery inference & resolution', () => {
  it('resolves explicit category IDs and legacy source labels accurately', () => {
    assert.equal(inferCuratedCategoryId('mountains'), 'mountains');
    assert.equal(inferCuratedCategoryId(undefined, 'Curated (National Parks & Mountains)'), 'mountains');
    assert.equal(inferCuratedCategoryId(undefined, 'Curated (Zen Minimalism & Botany)'), 'zen');
    assert.equal(inferCuratedCategoryId(undefined, 'Curated Ambient'), 'all');
    assert.equal(inferCuratedCategoryId(undefined, 'Curated Scenery'), 'all');
    assert.equal(inferCuratedCategoryId(undefined, 'Curated'), 'all');
    assert.equal(inferCuratedCategoryId(undefined, 'Plex (NAS - Family Photos)'), undefined);

    assert.deepEqual(resolveCuratedPhotos('mountains'), MOUNTAIN_PHOTOS);
    assert.deepEqual(resolveCuratedPhotos(undefined, 'Curated (Zen Minimalism & Botany)'), ZEN_PHOTOS);
    assert.deepEqual(resolveCuratedPhotos(undefined, 'Curated Ambient'), ALL_CURATED_PHOTOS);
    assert.deepEqual(resolveCuratedPhotos(undefined, undefined), ALL_CURATED_PHOTOS);
  });
});

describe('photoSourceIsolation shared vs tile-specific scoping', () => {
  it('preserves tile-specific (useCommonSource: false) widgets when updating Shared Board Library', () => {
    const sharedWidget = makePhotoWidget('w-shared', {
      useCommonSource: true,
      displayStyle: 'ken_burns',
    });
    const curatedTileWidget = makePhotoWidget('w-curated', {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated (National Parks & Mountains)',
      curatedCategoryId: 'mountains',
      customPhotos: MOUNTAIN_PHOTOS,
    });
    const webTileWidget = makePhotoWidget('w-web', {
      useCommonSource: false,
      sourceType: 'web',
      sourceLabel: 'Hawaii Vacation',
      sourceUrl: 'https://photos.app.goo.gl/xyz',
      customPhotos: [{ id: 'web-1', url: 'https://example.com/1.jpg', source: 'web' }],
    });
    const clockWidget: DashboardWidget = {
      id: 'w-clock',
      tabId: 'tab-corkboard',
      type: 'clock',
      title: 'Clock',
      gridPos: { x: 0, y: 0, w: 4, h: 4 },
      config: {},
      updated_at: '2026-11-13T10:00:00.000Z',
    };

    const { widgets, changedWidgets } = applySharedPhotoUpdateToWidgets(
      [sharedWidget, curatedTileWidget, webTileWidget, clockWidget],
      undefined,
      '2026-11-14T00:00:00.000Z'
    );

    // Tile-specific widgets must stay completely untouched
    assert.strictEqual(widgets[1], curatedTileWidget);
    assert.strictEqual(widgets[2], webTileWidget);
    assert.strictEqual(widgets[3], clockWidget);
    assert.equal(curatedTileWidget.config.useCommonSource, false);
    assert.equal(curatedTileWidget.config.sourceType, 'curated');
    assert.equal(curatedTileWidget.config.curatedCategoryId, 'mountains');

    // Already clean shared widget needs zero DB writes
    assert.equal(changedWidgets.length, 0);
    assert.strictEqual(widgets[0], sharedWidget);
  });

  it('opts in only optInWidgetId and strips duplicate shared fields on shared widgets', () => {
    const pollutedShared = makePhotoWidget('w-shared-legacy', {
      sourceType: 'plex',
      sourceLabel: 'Plex (Old)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '1', scopeMode: 'timeline' },
    });
    const promotedTile = makePhotoWidget('w-promote', {
      useCommonSource: false,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Photos)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
      customPhotos: [{ id: 'p-1', url: 'https://plex.example/1.jpg', source: 'plex' }],
    });
    const otherTile = makePhotoWidget('w-other-curated', {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated (Zen Minimalism & Botany)',
      curatedCategoryId: 'zen',
    });

    const { widgets, changedWidgets } = applySharedPhotoUpdateToWidgets(
      [pollutedShared, promotedTile, otherTile],
      'w-promote',
      '2026-11-14T00:00:00.000Z'
    );

    assert.equal(changedWidgets.length, 2);
    assert.equal(widgets[0].config.useCommonSource, true);
    assert.equal(widgets[0].config.sourceType, undefined);
    assert.equal(widgets[0].config.plexSyncConfig, undefined);

    assert.equal(widgets[1].config.useCommonSource, true);
    assert.equal(widgets[1].config.sourceType, undefined);
    assert.equal(widgets[1].config.customPhotos, undefined);

    // Other tile-only widget remains untouched
    assert.strictEqual(widgets[2], otherTile);
    assert.equal(widgets[2].config.useCommonSource, false);
    assert.equal(widgets[2].config.curatedCategoryId, 'zen');
  });

  it('cleans stale Plex/Web residue when toggling to This Tile Only and on restore sanitization', () => {
    const legacySharedConfig = {
      useCommonSource: true,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Family)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
    };

    const normalized = normalizeTileOnlyWidgetConfig(legacySharedConfig);
    assert.deepEqual(normalized, {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated Ambient',
      curatedCategoryId: 'all',
      sourceUrl: undefined,
      plexSyncConfig: undefined,
    });

    // Broken pre-fix restored widget (useCommonSource: false, leftover plexSyncConfig, customPhotos undefined)
    const brokenRestored = makePhotoWidget('w-broken', {
      useCommonSource: false,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Family)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
    });
    const repairedA = sanitizeRestoredPhotoWidget(brokenRestored);
    assert.equal(repairedA.repaired, true);
    assert.equal(repairedA.widget.config.sourceType, 'curated');
    assert.equal(repairedA.widget.config.curatedCategoryId, 'all');
    assert.equal(repairedA.widget.config.plexSyncConfig, undefined);

    // Genuine tile-specific Plex widget restored from Cloud Sync (`customPhotos: []`) must NOT be reset
    const genuineCloudRestoredPlex = makePhotoWidget('w-real-plex', {
      useCommonSource: false,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Vacation)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '9', scopeMode: 'folders', folderKeys: ['12'] },
      customPhotos: [],
    });
    const preservedPlex = sanitizeRestoredPhotoWidget(genuineCloudRestoredPlex);
    assert.equal(preservedPlex.repaired, false);
    assert.strictEqual(preservedPlex.widget, genuineCloudRestoredPlex);

    // Legacy curated tile-only widget backfills explicit curatedCategoryId and clears stale fields
    const legacyCurated = makePhotoWidget('w-legacy-curated', {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated (National Parks & Mountains)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '1', scopeMode: 'timeline' },
    });
    const repairedB = sanitizeRestoredPhotoWidget(legacyCurated);
    assert.equal(repairedB.repaired, true);
    assert.equal(repairedB.widget.config.curatedCategoryId, 'mountains');
    assert.equal(repairedB.widget.config.plexSyncConfig, undefined);
  });

  it('guards local photo cache carry-over when cloud sync source or scope changes', () => {
    const plexPhotos = [{ id: 'plex-1', url: 'https://plex.example/1.jpg', source: 'plex' as const }];
    const localPlexWidget = makePhotoWidget('w-1', {
      useCommonSource: false,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Family)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
      customPhotos: plexPhotos,
    });

    // Same Plex album from cloud keeps cached customPhotos
    const sameCloudPlex = makePhotoWidget('w-1', {
      useCommonSource: false,
      sourceType: 'plex',
      sourceLabel: 'Plex (NAS - Family)',
      plexSyncConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
    });
    const mergedSame = keepLocalWidgetFields(sameCloudPlex, localPlexWidget);
    assert.deepEqual(mergedSame.config.customPhotos, plexPhotos);

    // Cloud switched tile to Curated Scenery -> must NOT carry over stale local Plex photos
    const cloudCurated = makePhotoWidget('w-1', {
      useCommonSource: false,
      sourceType: 'curated',
      sourceLabel: 'Curated (National Parks & Mountains)',
      curatedCategoryId: 'mountains',
    });
    const mergedCurated = keepLocalWidgetFields(cloudCurated, localPlexWidget);
    assert.equal(mergedCurated.config.customPhotos, undefined);

    // Cloud switched tile back to Shared Board Library -> must NOT carry over stale customPhotos
    const cloudShared = makePhotoWidget('w-1', { useCommonSource: true });
    assert.equal(isSameWidgetPhotoSource(cloudShared.config, localPlexWidget.config), false);

    // Common source comparison matches identical Plex config and rejects curated / changed URLs
    assert.equal(
      isSameCommonPhotoSource(
        {
          commonPhotoSourceType: 'plex',
          commonPhotoSourceLabel: 'Plex (NAS)',
          commonPhotoPlexConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
        },
        {
          commonPhotoSourceType: 'plex',
          commonPhotoSourceLabel: 'Plex (NAS)',
          commonPhotoPlexConfig: { serverUri: 'https://plex.example', sectionKey: '4', scopeMode: 'timeline' },
        }
      ),
      true
    );
    assert.equal(
      isSameCommonPhotoSource(
        { commonPhotoSourceType: 'curated', commonPhotoCuratedCategory: 'zen' },
        { commonPhotoSourceType: 'plex', commonPhotoSourceLabel: 'Plex (NAS)' }
      ),
      false
    );
  });
});
