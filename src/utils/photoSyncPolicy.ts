export type PhotoAutoSyncInterval = 'manual' | 'daily' | 'weekly';

export interface PlexPhotoSyncConfig {
  serverClientIdentifier?: string;
  serverName?: string;
  /** Clean base URI without any X-Plex-Token query param */
  serverUri: string;
  sectionKey: string;
  scopeMode: 'timeline' | 'folders';
  folderKeys?: string[];
  dateFilter?: 'all' | 'last1Year' | 'last3Years' | 'last5Years';
}

export interface PhotoTargetSyncMeta {
  lastSuccessAt?: number;
  lastAttemptAt?: number;
  lastErrorAt?: number;
  lastError?: string;
  lastResultSummary?: string;
}

export const MANUAL_RESCAN_COOLDOWN_MS = 15 * 60 * 1000;
export const ERROR_RETRY_COOLDOWN_MS = 30 * 1000;
export const AUTO_ERROR_BACKOFF_MS = 30 * 60 * 1000;
export const DAILY_AUTO_SYNC_MS = 24 * 60 * 60 * 1000;
export const WEEKLY_AUTO_SYNC_MS = 7 * 24 * 60 * 60 * 1000;

export function getPhotoSyncTargetKey(targetWidgetId?: string): string {
  return targetWidgetId ? `widget:${targetWidgetId}` : 'common';
}

export function isTargetRescannable(
  sourceType?: string,
  sourceUrl?: string,
  plexConfig?: PlexPhotoSyncConfig,
  sourceLabel?: string
): boolean {
  if (sourceType === 'web') {
    return Boolean(sourceUrl && sourceUrl.trim().length > 0);
  }
  if (sourceType === 'plex') {
    return Boolean(plexConfig?.sectionKey || (sourceLabel && sourceLabel.trim().length > 0));
  }
  return false;
}

export function getManualRescanCooldownRemainingMs(
  meta?: PhotoTargetSyncMeta,
  now = Date.now()
): number {
  if (!meta) return 0;
  if (meta.lastErrorAt && (!meta.lastSuccessAt || meta.lastErrorAt > meta.lastSuccessAt)) {
    return Math.max(0, meta.lastErrorAt + ERROR_RETRY_COOLDOWN_MS - now);
  }
  if (meta.lastSuccessAt) {
    return Math.max(0, meta.lastSuccessAt + MANUAL_RESCAN_COOLDOWN_MS - now);
  }
  return 0;
}

export function isAutoSyncDue(
  meta: PhotoTargetSyncMeta | undefined,
  interval: PhotoAutoSyncInterval | undefined,
  now = Date.now()
): boolean {
  const effective: PhotoAutoSyncInterval = interval ?? 'daily';
  if (effective === 'manual') return false;

  if (
    meta?.lastErrorAt &&
    (!meta.lastSuccessAt || meta.lastErrorAt > meta.lastSuccessAt) &&
    now - meta.lastErrorAt < AUTO_ERROR_BACKOFF_MS
  ) {
    return false;
  }

  if (!meta?.lastSuccessAt) return true;

  const periodMs = effective === 'weekly' ? WEEKLY_AUTO_SYNC_MS : DAILY_AUTO_SYNC_MS;
  return now - meta.lastSuccessAt >= periodMs;
}

export function hasPhotoCatalogChanged(
  prevPhotos: ReadonlyArray<{ id: string; url: string }> = [],
  nextPhotos: ReadonlyArray<{ id: string; url: string }> = []
): boolean {
  if (prevPhotos.length !== nextPhotos.length) return true;
  for (let i = 0; i < prevPhotos.length; i++) {
    if (prevPhotos[i].id !== nextPhotos[i].id || prevPhotos[i].url !== nextPhotos[i].url) {
      return true;
    }
  }
  return false;
}

export function isSamePlexSyncConfig(
  a?: PlexPhotoSyncConfig | null,
  b?: PlexPhotoSyncConfig | null
): boolean {
  if (!a || !b) return false;
  const serverMatch =
    a.serverClientIdentifier && b.serverClientIdentifier
      ? a.serverClientIdentifier === b.serverClientIdentifier
      : a.serverUri === b.serverUri;
  if (!serverMatch) return false;
  if (a.sectionKey !== b.sectionKey) return false;
  if (a.scopeMode !== b.scopeMode) return false;

  if (a.scopeMode === 'timeline') {
    return (a.dateFilter || 'all') === (b.dateFilter || 'all');
  }

  const keysA = Array.from(new Set(a.folderKeys || [])).sort();
  const keysB = Array.from(new Set(b.folderKeys || [])).sort();
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k, idx) => k === keysB[idx]);
}

export function resolvePlexMinYear(
  dateFilter?: PlexPhotoSyncConfig['dateFilter'],
  currentYear = new Date().getFullYear()
): number | undefined {
  if (dateFilter === 'last1Year') return currentYear - 1;
  if (dateFilter === 'last3Years') return currentYear - 2;
  if (dateFilter === 'last5Years') return currentYear - 4;
  return undefined;
}

export function makeStableWebPhotoId(idx: number, url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `web-${idx}-${Math.abs(hash).toString(36)}`;
}

export function formatRelativeSyncTime(timestampMs?: number, now = Date.now()): string {
  if (!timestampMs) return 'Never';
  const diffSec = Math.max(0, Math.floor((now - timestampMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function formatCooldownRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return '0s';
  if (remainingMs < 60_000) return `${Math.ceil(remainingMs / 1000)}s`;
  return `${Math.ceil(remainingMs / 60_000)}m`;
}
