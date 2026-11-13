import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_ERROR_BACKOFF_MS,
  DAILY_AUTO_SYNC_MS,
  ERROR_RETRY_COOLDOWN_MS,
  MANUAL_RESCAN_COOLDOWN_MS,
  WEEKLY_AUTO_SYNC_MS,
  formatCooldownRemaining,
  formatRelativeSyncTime,
  getManualRescanCooldownRemainingMs,
  getPhotoSyncTargetKey,
  hasPhotoCatalogChanged,
  isAutoSyncDue,
  isSamePlexSyncConfig,
  isTargetRescannable,
  makeStableWebPhotoId,
  resolvePlexMinYear,
  type PlexPhotoSyncConfig,
} from '../src/utils/photoSyncPolicy';

describe('photoSyncPolicy scheduling, anti-spam cooldowns & diff helpers', () => {
  it('identifies rescannable cloud and Plex targets while skipping local/curated sources', () => {
    assert.equal(isTargetRescannable('web', 'https://photos.app.goo.gl/abc123'), true);
    assert.equal(isTargetRescannable('web', '   '), false);
    assert.equal(
      isTargetRescannable('plex', undefined, {
        serverUri: 'https://1-2-3.plex.direct:32400',
        sectionKey: '4',
        scopeMode: 'timeline',
      }),
      true
    );
    assert.equal(isTargetRescannable('plex', undefined, undefined, 'Plex (NAS - Photos)'), true);
    assert.equal(isTargetRescannable('local', undefined, undefined, 'Local (Vacation)'), false);
    assert.equal(isTargetRescannable('curated', undefined, undefined, 'Curated Ambient'), false);
    assert.equal(getPhotoSyncTargetKey(undefined), 'common');
    assert.equal(getPhotoSyncTargetKey('widget-42'), 'widget:widget-42');
  });

  it('enforces 15-minute cooldown after success and 30-second short retry backoff after errors', () => {
    const t0 = 1_700_000_000_000;
    assert.equal(getManualRescanCooldownRemainingMs(undefined, t0), 0);

    // 15-minute lock after successful sync
    const successMeta = { lastSuccessAt: t0 };
    assert.equal(
      getManualRescanCooldownRemainingMs(successMeta, t0 + 5 * 60 * 1000),
      10 * 60 * 1000
    );
    assert.equal(
      getManualRescanCooldownRemainingMs(successMeta, t0 + MANUAL_RESCAN_COOLDOWN_MS),
      0
    );

    // Recent error newer than last success uses 30-second backoff rather than 15m lock
    const errorMeta = { lastSuccessAt: t0, lastErrorAt: t0 + 20 * 60 * 1000 };
    assert.equal(
      getManualRescanCooldownRemainingMs(errorMeta, t0 + 20 * 60 * 1000 + 10_000),
      ERROR_RETRY_COOLDOWN_MS - 10_000
    );
    assert.equal(
      getManualRescanCooldownRemainingMs(errorMeta, t0 + 20 * 60 * 1000 + ERROR_RETRY_COOLDOWN_MS),
      0
    );
  });

  it('evaluates daily, weekly, and manual auto-rescan schedules with error backoff', () => {
    const t0 = 1_700_000_000_000;

    // Never synced: daily & default (undefined) & weekly are due; manual is never due
    assert.equal(isAutoSyncDue(undefined, undefined, t0), true);
    assert.equal(isAutoSyncDue(undefined, 'daily', t0), true);
    assert.equal(isAutoSyncDue(undefined, 'weekly', t0), true);
    assert.equal(isAutoSyncDue(undefined, 'manual', t0), false);

    // Daily (24h)
    const meta = { lastSuccessAt: t0 };
    assert.equal(isAutoSyncDue(meta, 'daily', t0 + DAILY_AUTO_SYNC_MS - 1000), false);
    assert.equal(isAutoSyncDue(meta, 'daily', t0 + DAILY_AUTO_SYNC_MS), true);

    // Weekly (7d)
    assert.equal(isAutoSyncDue(meta, 'weekly', t0 + DAILY_AUTO_SYNC_MS), false);
    assert.equal(isAutoSyncDue(meta, 'weekly', t0 + WEEKLY_AUTO_SYNC_MS), true);

    // Transient error suppresses immediate auto retry for AUTO_ERROR_BACKOFF_MS (30m)
    const errMeta = { lastSuccessAt: t0, lastErrorAt: t0 + DAILY_AUTO_SYNC_MS + 1000 };
    assert.equal(
      isAutoSyncDue(errMeta, 'daily', t0 + DAILY_AUTO_SYNC_MS + 5 * 60 * 1000),
      false
    );
    assert.equal(
      isAutoSyncDue(errMeta, 'daily', t0 + DAILY_AUTO_SYNC_MS + 1000 + AUTO_ERROR_BACKOFF_MS),
      true
    );
  });

  it('detects real photo catalog changes without false positives and produces deterministic web IDs', () => {
    const a = makeStableWebPhotoId(0, 'https://example.com/photo-1.jpg');
    const b = makeStableWebPhotoId(0, 'https://example.com/photo-1.jpg');
    const c = makeStableWebPhotoId(1, 'https://example.com/photo-1.jpg');
    assert.equal(a, b);
    assert.notEqual(a, c);

    const list1 = [
      { id: a, url: 'https://example.com/photo-1.jpg' },
      { id: 'p2', url: 'https://example.com/photo-2.jpg' },
    ];
    const listSame = [
      { id: a, url: 'https://example.com/photo-1.jpg' },
      { id: 'p2', url: 'https://example.com/photo-2.jpg' },
    ];
    const listAdded = [
      ...listSame,
      { id: 'p3', url: 'https://example.com/photo-3.jpg' },
    ];
    const listUrlRotated = [
      { id: a, url: 'https://example.com/photo-1.jpg' },
      { id: 'p2', url: 'https://example.com/photo-2-new.jpg' },
    ];

    assert.equal(hasPhotoCatalogChanged(list1, listSame), false);
    assert.equal(hasPhotoCatalogChanged(list1, listAdded), true);
    assert.equal(hasPhotoCatalogChanged(list1, listUrlRotated), true);
  });

  it('compares Plex sync scopes accurately and resolves timeline year cutoffs', () => {
    assert.equal(resolvePlexMinYear('all', 2026), undefined);
    assert.equal(resolvePlexMinYear('last1Year', 2026), 2025);
    assert.equal(resolvePlexMinYear('last3Years', 2026), 2024);
    assert.equal(resolvePlexMinYear('last5Years', 2026), 2022);

    const foldersA: PlexPhotoSyncConfig = {
      serverClientIdentifier: 'srv-1',
      serverUri: 'https://nas.plex.direct:32400',
      sectionKey: '2',
      scopeMode: 'folders',
      folderKeys: ['/library/sections/2/folder?parent=20', '/library/sections/2/folder?parent=10'],
    };
    const foldersB: PlexPhotoSyncConfig = {
      serverClientIdentifier: 'srv-1',
      serverUri: 'https://nas.plex.direct:32400',
      sectionKey: '2',
      scopeMode: 'folders',
      folderKeys: ['/library/sections/2/folder?parent=10', '/library/sections/2/folder?parent=20'],
    };
    const foldersC: PlexPhotoSyncConfig = {
      ...foldersA,
      folderKeys: ['/library/sections/2/folder?parent=10'],
    };

    assert.equal(isSamePlexSyncConfig(foldersA, foldersB), true);
    assert.equal(isSamePlexSyncConfig(foldersA, foldersC), false);

    assert.equal(formatCooldownRemaining(14 * 60 * 1000 + 5000), '15m');
    assert.equal(formatCooldownRemaining(12_000), '12s');
    assert.equal(formatRelativeSyncTime(undefined), 'Never');
    assert.equal(formatRelativeSyncTime(1000, 10_000), 'Just now');
    assert.equal(formatRelativeSyncTime(1000, 1000 + 3600_000), '1h ago');
  });
});
