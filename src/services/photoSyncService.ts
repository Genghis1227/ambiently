import { useDashboardStore } from '../store/dashboardStore';
import { db } from './db';
import {
  type PhotoItem,
  type LocalDirectoryInspection,
  scanSelectedSubfolders,
  resolveWebAndCloudPhotoUrls,
  cachePhotosLocally,
} from './photos';
import {
  getBestPlexConnectionUri,
  getPlexPhotoLibraries,
  getPlexPhotosFromSection,
  getPlexServers,
  getPlexServerTokens,
  getPlexToken,
  loadPlexServerTokens,
  type PlexServerResource,
} from './plex';
import { plexOrigin, stripPlexToken } from './plexLinks';
import {
  type PlexPhotoSyncConfig,
  type PhotoTargetSyncMeta,
  formatCooldownRemaining,
  getManualRescanCooldownRemainingMs,
  getPhotoSyncTargetKey,
  hasPhotoCatalogChanged,
  isAutoSyncDue,
  isTargetRescannable,
  resolvePlexMinYear,
} from '../utils/photoSyncPolicy';

const PHOTO_SYNC_META_VAULT_KEY = 'photo_sync_meta';

export interface PlexSyncParams {
  serverUri: string;
  serverAccessToken: string;
  sectionKey: string;
  folderOrAlbumKey?: string;
  folderOrAlbumKeys?: string | string[];
  minYear?: number;
  maxYear?: number;
  sourceLabel: string;
  plexSyncConfig?: PlexPhotoSyncConfig;
  targetWidgetId?: string;
  applyToAll?: boolean;
  onInitialBatchReady?: (photos: PhotoItem[]) => void;
  onError?: (errMessage: string) => void;
}

export interface LocalSyncParams {
  inspection: LocalDirectoryInspection;
  selectedSubfolderNames: Set<string>;
  includeRootPhotos: boolean;
  scanLimit?: number;
  sourceLabel: string;
  targetWidgetId?: string;
  applyToAll?: boolean;
  onInitialBatchReady?: (photos: PhotoItem[]) => void;
  onError?: (errMessage: string) => void;
}

export interface WebSyncParams {
  webUrlsText: string;
  targetWidgetId?: string;
  applyToAll?: boolean;
  onInitialBatchReady?: (photos: PhotoItem[], sourceTitle: string, totalAlbumCount?: number) => void;
  onError?: (errMessage: string) => void;
}

export interface PhotoRescanResult {
  status: 'updated' | 'unchanged' | 'cooldown' | 'busy' | 'skipped' | 'error';
  addedCount?: number;
  totalCount?: number;
  remainingMs?: number;
  message: string;
}

function inferLegacyPlexDateFilter(sourceLabel?: string): PlexPhotoSyncConfig['dateFilter'] {
  if (!sourceLabel) return 'all';
  if (/\[Last 3 Years:/i.test(sourceLabel)) return 'last3Years';
  if (/\[Last 5 Years:/i.test(sourceLabel)) return 'last5Years';
  if (/\[Past Year:/i.test(sourceLabel)) return 'last1Year';
  return 'all';
}

function matchPlexServerFromList(
  servers: PlexServerResource[],
  config?: PlexPhotoSyncConfig,
  sourceLabel?: string
): PlexServerResource | undefined {
  if (servers.length === 0) return undefined;
  if (config?.serverClientIdentifier) {
    const byId = servers.find((s) => s.clientIdentifier === config.serverClientIdentifier);
    if (byId) return byId;
  }
  if (config?.serverName) {
    const byName = servers.find((s) => s.name === config.serverName);
    if (byName) return byName;
  }
  if (sourceLabel) {
    const labelMatch = sourceLabel.match(/^Plex\s*\(([^-]+?)\s*-/);
    const serverNameHint = labelMatch?.[1]?.trim();
    if (serverNameHint) {
      const byHint = servers.find((s) => s.name === serverNameHint);
      if (byHint) return byHint;
    }
  }
  return servers[0];
}

class PhotoSyncService {
  private activeAbortController: AbortController | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private metaMap: Record<string, PhotoTargetSyncMeta> = {};
  private initPromise: Promise<void> | null = null;

  public init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const entry = await db.vault.get(PHOTO_SYNC_META_VAULT_KEY);
          if (entry?.value) {
            const parsed = JSON.parse(entry.value) as Record<string, PhotoTargetSyncMeta>;
            if (parsed && typeof parsed === 'object') {
              this.metaMap = parsed;
              useDashboardStore.getState().setPhotoSyncMeta(this.metaMap);
            }
          }
        } catch (err) {
          console.warn('Could not load photo sync metadata:', err);
        }
      })();
    }
    return this.initPromise;
  }

  private async persistMetaMap() {
    useDashboardStore.getState().setPhotoSyncMeta(this.metaMap);
    try {
      await db.vault.put({
        key: PHOTO_SYNC_META_VAULT_KEY,
        value: JSON.stringify(this.metaMap),
        description: 'Photo library rescan timestamps & cooldowns',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Failed to persist photo sync metadata:', err);
    }
  }

  private async recordSyncSuccess(targetKey: string, summary: string) {
    await this.init();
    const now = Date.now();
    this.metaMap = {
      ...this.metaMap,
      [targetKey]: {
        ...(this.metaMap[targetKey] || {}),
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: undefined,
        lastResultSummary: summary,
      },
    };
    await this.persistMetaMap();
  }

  private async recordSyncFailure(targetKey: string, errorMsg: string) {
    await this.init();
    const now = Date.now();
    this.metaMap = {
      ...this.metaMap,
      [targetKey]: {
        ...(this.metaMap[targetKey] || {}),
        lastAttemptAt: now,
        lastErrorAt: now,
        lastError: errorMsg,
      },
    };
    await this.persistMetaMap();
  }

  public cancelSync() {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    useDashboardStore.getState().setPhotoSyncState(null);
  }

  private scheduleStatusClear(delayMs = 45000) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      useDashboardStore.getState().setPhotoSyncState(null);
      this.clearTimer = null;
    }, delayMs);
  }

  // 1. Plex Progressive Background Ingestion
  public async startPlexBackgroundSync(params: PlexSyncParams) {
    await this.init();
    this.cancelSync();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const store = useDashboardStore.getState();
    const targetWidgetId = params.applyToAll ? undefined : params.targetWidgetId;
    const targetKey = getPhotoSyncTargetKey(targetWidgetId);

    store.setPhotoSyncState({
      isActive: true,
      sourceType: 'plex',
      sourceLabel: params.sourceLabel,
      loadedCount: 0,
      statusMessage: 'Connecting to Plex and indexing initial photos...',
      targetWidgetId,
    });

    let initialBatchFired = false;
    let completionRecorded = false;

    try {
      const photos = await getPlexPhotosFromSection(
        params.serverUri,
        params.serverAccessToken,
        params.sectionKey,
        params.folderOrAlbumKeys || params.folderOrAlbumKey,
        {
          signal,
          minYear: params.minYear,
          maxYear: params.maxYear,
          onBatch: async (batchPhotos, isInitial, isDone) => {
            if (signal.aborted) return;

            if (isInitial && !initialBatchFired && batchPhotos.length > 0) {
              initialBatchFired = true;
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'plex',
                params.plexSyncConfig
              );
              cachePhotosLocally(batchPhotos);

              store.setPhotoSyncState({
                isActive: !isDone,
                sourceType: 'plex',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: isDone
                  ? `Plex sync complete (${batchPhotos.length.toLocaleString()} photos loaded)!`
                  : `Streaming first ${batchPhotos.length} photos (indexing in background)...`,
                targetWidgetId,
              });

              params.onInitialBatchReady?.(batchPhotos);

              if (isDone) {
                completionRecorded = true;
                await this.recordSyncSuccess(
                  targetKey,
                  `Synced ${batchPhotos.length.toLocaleString()} photos`
                );
                this.scheduleStatusClear(4000);
              }
            } else if (!isDone) {
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'plex',
                params.plexSyncConfig
              );
              store.setPhotoSyncState({
                isActive: true,
                sourceType: 'plex',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Indexing Plex library (${batchPhotos.length.toLocaleString()} photos)...`,
                targetWidgetId,
              });
            } else if (isDone) {
              await store.finalizePhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'plex',
                params.plexSyncConfig
              );
              cachePhotosLocally(batchPhotos);

              completionRecorded = true;
              await this.recordSyncSuccess(
                targetKey,
                `Synced ${batchPhotos.length.toLocaleString()} photos`
              );

              store.setPhotoSyncState({
                isActive: false,
                sourceType: 'plex',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Plex sync complete (${batchPhotos.length.toLocaleString()} photos loaded)!`,
                targetWidgetId,
              });

              this.scheduleStatusClear(4000);
            }
          },
        }
      );

      if (!signal.aborted && photos.length === 0) {
        const msg = 'No photos found in the selected Plex library scope.';
        await this.recordSyncFailure(targetKey, msg);
        store.setPhotoSyncState({
          isActive: false,
          sourceType: 'plex',
          sourceLabel: params.sourceLabel,
          loadedCount: 0,
          statusMessage: msg,
          targetWidgetId,
        });
        params.onError?.(msg);
        this.scheduleStatusClear(5000);
      } else if (!completionRecorded && photos.length > 0 && !signal.aborted) {
        await store.finalizePhotosToTarget(
          targetWidgetId,
          photos,
          params.sourceLabel,
          undefined,
          'plex',
          params.plexSyncConfig
        );
        cachePhotosLocally(photos);
        await this.recordSyncSuccess(targetKey, `Synced ${photos.length.toLocaleString()} photos`);
        if (!initialBatchFired) {
          params.onInitialBatchReady?.(photos);
        }
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return;
      console.warn('Plex background sync error:', err);
      await this.recordSyncFailure(targetKey, err.message);
      store.setPhotoSyncState({
        isActive: false,
        sourceType: 'plex',
        sourceLabel: params.sourceLabel,
        loadedCount: 0,
        statusMessage: `Plex sync error: ${err.message}`,
        targetWidgetId,
      });
      params.onError?.(err.message);
      this.scheduleStatusClear(5000);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  // 2. Local / NAS Subfolder Progressive Ingestion
  public async startLocalBackgroundSync(params: LocalSyncParams) {
    this.cancelSync();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const store = useDashboardStore.getState();
    const targetWidgetId = params.applyToAll ? undefined : params.targetWidgetId;

    store.setPhotoSyncState({
      isActive: true,
      sourceType: 'local',
      sourceLabel: params.sourceLabel,
      loadedCount: 0,
      statusMessage: 'Scanning selected local/NAS folders...',
      targetWidgetId,
    });

    let initialBatchFired = false;

    try {
      const res = await scanSelectedSubfolders(
        params.inspection,
        params.selectedSubfolderNames,
        params.includeRootPhotos,
        {
          maxPhotos: params.scanLimit || Infinity,
          signal,
          onBatch: async (batchPhotos, isInitial, isDone) => {
            if (signal.aborted) return;

            if (isInitial && !initialBatchFired) {
              initialBatchFired = true;
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'local'
              );
              cachePhotosLocally(batchPhotos);

              store.setPhotoSyncState({
                isActive: !isDone,
                sourceType: 'local',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: isDone
                  ? `Folder scan complete (${batchPhotos.length.toLocaleString()} photos imported)!`
                  : `Loaded first ${batchPhotos.length} photos (scanning remaining folders)...`,
                targetWidgetId,
              });

              params.onInitialBatchReady?.(batchPhotos);
              if (isDone) this.scheduleStatusClear(4000);
            } else if (!isDone) {
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'local'
              );
              store.setPhotoSyncState({
                isActive: true,
                sourceType: 'local',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Scanning folders (${batchPhotos.length.toLocaleString()} photos found)...`,
                targetWidgetId,
              });
            } else if (isDone) {
              await store.finalizePhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'local'
              );
              cachePhotosLocally(batchPhotos);

              store.setPhotoSyncState({
                isActive: false,
                sourceType: 'local',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Folder scan complete (${batchPhotos.length.toLocaleString()} photos imported)!`,
                targetWidgetId,
              });

              this.scheduleStatusClear(4000);
            }
          },
        }
      );

      if (!initialBatchFired && res.totalPhotos.length > 0 && !signal.aborted) {
        await store.finalizePhotosToTarget(
          targetWidgetId,
          res.totalPhotos,
          params.sourceLabel,
          undefined,
          'local'
        );
        cachePhotosLocally(res.totalPhotos);
        params.onInitialBatchReady?.(res.totalPhotos);
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return;
      console.warn('Local background scan error:', err);
      store.setPhotoSyncState({
        isActive: false,
        sourceType: 'local',
        sourceLabel: params.sourceLabel,
        loadedCount: 0,
        statusMessage: `Local scan error: ${err.message}`,
        targetWidgetId,
      });
      params.onError?.(err.message);
      this.scheduleStatusClear(5000);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  // 3. Web / Google Photos / Google Drive Progressive Ingestion
  public async startWebBackgroundSync(params: WebSyncParams) {
    await this.init();
    this.cancelSync();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const store = useDashboardStore.getState();
    const targetWidgetId = params.applyToAll ? undefined : params.targetWidgetId;
    const targetKey = getPhotoSyncTargetKey(targetWidgetId);

    store.setPhotoSyncState({
      isActive: true,
      sourceType: 'web',
      sourceLabel: 'Google Photos & Cloud Links',
      loadedCount: 0,
      statusMessage: 'Connecting to Google Photos & resolving cloud links...',
      targetWidgetId,
    });

    let initialBatchFired = false;
    let completionRecorded = false;

    try {
      const res = await resolveWebAndCloudPhotoUrls(params.webUrlsText, {
        maxPhotos: 10000,
        signal,
        onBatch: async (batchPhotos, sourceTitle, isInitial, isDone) => {
          if (signal.aborted) return;

          const label = sourceTitle || 'Google Photos & Web';

          if (isInitial && !initialBatchFired) {
            initialBatchFired = true;
            await store.appendPhotosToTarget(
              targetWidgetId,
              batchPhotos,
              label,
              params.webUrlsText,
              'web'
            );
            cachePhotosLocally(batchPhotos);

            const hasMore = (res?.totalAlbumCount || 0) > batchPhotos.length;

            store.setPhotoSyncState({
              isActive: hasMore && !isDone,
              sourceType: 'web',
              sourceLabel: label,
              loadedCount: batchPhotos.length,
              totalCount: res?.totalAlbumCount,
              statusMessage:
                hasMore && !isDone
                  ? `Loaded first ${batchPhotos.length} photos (retrieving remaining album in background)...`
                  : `Loaded ${batchPhotos.length} photos!`,
              targetWidgetId,
            });

            params.onInitialBatchReady?.(batchPhotos, label, res?.totalAlbumCount);
            if (!hasMore || isDone) {
              completionRecorded = true;
              await this.recordSyncSuccess(
                targetKey,
                `Synced ${batchPhotos.length.toLocaleString()} photos`
              );
              this.scheduleStatusClear(3500);
            }
          } else if (isDone) {
            await store.finalizePhotosToTarget(
              targetWidgetId,
              batchPhotos,
              label,
              params.webUrlsText,
              'web'
            );
            cachePhotosLocally(batchPhotos);

            completionRecorded = true;
            await this.recordSyncSuccess(
              targetKey,
              `Synced ${batchPhotos.length.toLocaleString()} photos`
            );

            store.setPhotoSyncState({
              isActive: false,
              sourceType: 'web',
              sourceLabel: label,
              loadedCount: batchPhotos.length,
              totalCount: batchPhotos.length,
              statusMessage: `Album sync complete (${batchPhotos.length.toLocaleString()} photos loaded)!`,
              targetWidgetId,
            });

            this.scheduleStatusClear(4000);
          }
        },
      });

      if (!signal.aborted && res.photos.length === 0) {
        const msg = res.error || 'No valid photos found. Please check your links.';
        await this.recordSyncFailure(targetKey, msg);
        store.setPhotoSyncState({
          isActive: false,
          sourceType: 'web',
          sourceLabel: 'Cloud Photos',
          loadedCount: 0,
          statusMessage: msg,
          targetWidgetId,
        });
        params.onError?.(msg);
        this.scheduleStatusClear(5000);
      } else if (!completionRecorded && res.photos.length > 0 && !signal.aborted) {
        await store.finalizePhotosToTarget(
          targetWidgetId,
          res.photos,
          res.sourceTitle || 'Web Photos',
          params.webUrlsText,
          'web'
        );
        cachePhotosLocally(res.photos);
        await this.recordSyncSuccess(
          targetKey,
          `Synced ${res.photos.length.toLocaleString()} photos`
        );
        if (!initialBatchFired) {
          params.onInitialBatchReady?.(res.photos, res.sourceTitle || 'Web Photos');
        }
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return;
      console.warn('Web / Cloud background sync error:', err);
      await this.recordSyncFailure(targetKey, err.message);
      store.setPhotoSyncState({
        isActive: false,
        sourceType: 'web',
        sourceLabel: 'Cloud Photos',
        loadedCount: 0,
        statusMessage: `Cloud photo error: ${err.message}`,
        targetWidgetId,
      });
      params.onError?.(err.message);
      this.scheduleStatusClear(5000);
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  // 4. Silent Diff-Only Rescan (Scheduled Daily/Weekly & Manual Cooldown-Protected)
  public async rescanTarget(opts?: {
    targetWidgetId?: string;
    reason?: 'manual' | 'auto';
  }): Promise<PhotoRescanResult> {
    await this.init();
    const reason = opts?.reason ?? 'manual';
    const targetWidgetId = opts?.targetWidgetId;
    const targetKey = getPhotoSyncTargetKey(targetWidgetId);

    const store = useDashboardStore.getState();
    if (this.activeAbortController || store.photoSyncState?.isActive) {
      return {
        status: 'busy',
        message: 'A photo scan is already in progress.',
      };
    }

    const targetWidget = targetWidgetId
      ? store.widgets.find((w) => w.id === targetWidgetId && !w.deleted_at)
      : undefined;

    if (targetWidgetId && !targetWidget) {
      return { status: 'skipped', message: 'Target widget no longer exists.' };
    }

    const sourceType = targetWidget
      ? targetWidget.config?.sourceType
      : store.settings.commonPhotoSourceType;
    const sourceUrl = targetWidget
      ? targetWidget.config?.sourceUrl
      : store.settings.commonPhotoSourceUrl;
    const sourceLabel = targetWidget
      ? targetWidget.config?.sourceLabel
      : store.settings.commonPhotoSourceLabel;
    const plexConfig = targetWidget
      ? (targetWidget.config?.plexSyncConfig as PlexPhotoSyncConfig | undefined)
      : store.settings.commonPhotoPlexConfig;
    const prevPhotos: PhotoItem[] = targetWidget
      ? ((targetWidget.config?.customPhotos as PhotoItem[]) || [])
      : store.settings.commonPhotos || [];

    if (!isTargetRescannable(sourceType, sourceUrl, plexConfig, sourceLabel)) {
      return {
        status: 'skipped',
        message: 'This photo source does not support cloud or server rescanning.',
      };
    }

    if (reason !== 'auto') {
      const remainingMs = getManualRescanCooldownRemainingMs(this.metaMap[targetKey]);
      if (remainingMs > 0) {
        return {
          status: 'cooldown',
          remainingMs,
          message: `Synced recently. Available again in ${formatCooldownRemaining(remainingMs)}.`,
        };
      }
    }

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    store.setPhotoSyncState({
      isActive: true,
      isSilent: reason === 'auto',
      sourceType,
      sourceLabel: sourceLabel || 'Photo Library',
      loadedCount: prevPhotos.length,
      statusMessage: 'Checking for new photos...',
      targetWidgetId,
    });

    try {
      let nextPhotos: PhotoItem[] = [];
      let nextLabel = sourceLabel;
      let resolvedPlexConfig: PlexPhotoSyncConfig | undefined = plexConfig
        ? { ...plexConfig, serverUri: stripPlexToken(plexConfig.serverUri) }
        : undefined;

      if (sourceType === 'web') {
        const res = await resolveWebAndCloudPhotoUrls(sourceUrl!, {
          maxPhotos: 10000,
          signal,
        });
        if (signal.aborted) {
          return { status: 'skipped', message: 'Scan cancelled.' };
        }
        if (res.error || res.photos.length === 0) {
          throw new Error(res.error || 'No photos returned from cloud album.');
        }
        nextPhotos = res.photos;
        nextLabel = res.sourceTitle || sourceLabel || 'Google Photos & Web';
      } else if (sourceType === 'plex') {
        await loadPlexServerTokens();
        if (signal.aborted) {
          return { status: 'skipped', message: 'Scan cancelled.' };
        }

        const tokenMap = getPlexServerTokens();
        const origin = resolvedPlexConfig ? plexOrigin(resolvedPlexConfig.serverUri) : null;
        let serverToken = origin ? tokenMap[origin] : undefined;

        if (!serverToken || !resolvedPlexConfig) {
          const accountToken = await getPlexToken();
          if (!accountToken && !serverToken) {
            if (reason === 'auto') {
              store.setPhotoSyncState(null);
              return { status: 'skipped', message: 'Plex is not signed in on this device.' };
            }
            throw new Error('Sign in to Plex on this device first to rescan.');
          }

          if (accountToken) {
            const servers = await getPlexServers(accountToken);
            if (signal.aborted) {
              return { status: 'skipped', message: 'Scan cancelled.' };
            }
            const matchedServer = matchPlexServerFromList(servers, resolvedPlexConfig, sourceLabel);
            if (matchedServer) {
              const bestUri = getBestPlexConnectionUri(matchedServer);
              serverToken = matchedServer.accessToken || accountToken;
              if (resolvedPlexConfig) {
                resolvedPlexConfig = {
                  ...resolvedPlexConfig,
                  serverClientIdentifier: matchedServer.clientIdentifier || resolvedPlexConfig.serverClientIdentifier,
                  serverName: matchedServer.name || resolvedPlexConfig.serverName,
                  serverUri: stripPlexToken(bestUri || resolvedPlexConfig.serverUri),
                };
              } else {
                if (sourceLabel && /\[\d+\s+Folders\]|\s-\s[^-]+\s-\s/.test(sourceLabel) && /Folders\]/i.test(sourceLabel)) {
                  throw new Error(
                    'Open Configure Photos once to save your Plex folder selection for 1-click rescans.'
                  );
                }
                if (!bestUri) {
                  throw new Error('No reachable connection URI for Plex server.');
                }
                const sections = await getPlexPhotoLibraries(bestUri, serverToken, true);
                const sectionMatch = sections.find(
                  (sec) => sourceLabel && sourceLabel.includes(sec.title)
                ) || sections.find((sec) => sec.isPhoto) || sections[0];
                if (!sectionMatch) {
                  throw new Error('No Plex photo library section found to rescan.');
                }
                resolvedPlexConfig = {
                  serverClientIdentifier: matchedServer.clientIdentifier,
                  serverName: matchedServer.name,
                  serverUri: stripPlexToken(bestUri),
                  sectionKey: sectionMatch.key,
                  scopeMode: 'timeline',
                  dateFilter: inferLegacyPlexDateFilter(sourceLabel),
                };
              }
            }
          }
        }

        if (!resolvedPlexConfig || !serverToken) {
          throw new Error('Plex library selection is missing. Open Configure Photos once to save it.');
        }

        const minYear =
          resolvedPlexConfig.scopeMode === 'timeline'
            ? resolvePlexMinYear(resolvedPlexConfig.dateFilter)
            : undefined;

        nextPhotos = await getPlexPhotosFromSection(
          resolvedPlexConfig.serverUri,
          serverToken,
          resolvedPlexConfig.sectionKey,
          resolvedPlexConfig.scopeMode === 'folders' ? resolvedPlexConfig.folderKeys : undefined,
          {
            minYear,
            signal,
            onProgress: (cnt) => {
              if (!signal.aborted) {
                store.setPhotoSyncState({
                  isActive: true,
                  isSilent: reason === 'auto',
                  sourceType: 'plex',
                  sourceLabel: sourceLabel || 'Plex Photos',
                  loadedCount: cnt,
                  statusMessage: `Checking Plex library (${cnt.toLocaleString()} photos)...`,
                  targetWidgetId,
                });
              }
            },
          }
        );

        if (signal.aborted) {
          return { status: 'skipped', message: 'Scan cancelled.' };
        }
        if (nextPhotos.length === 0) {
          throw new Error('No photos returned from Plex library.');
        }
      }

      const changed = hasPhotoCatalogChanged(prevPhotos, nextPhotos);
      const prevIds = new Set(prevPhotos.map((p) => p.id));
      const addedCount = nextPhotos.filter((p) => !prevIds.has(p.id)).length;
      const summary = changed
        ? addedCount > 0
          ? `+${addedCount.toLocaleString()} new photo${addedCount === 1 ? '' : 's'} (${nextPhotos.length.toLocaleString()} total)`
          : `Updated (${nextPhotos.length.toLocaleString()} photos)`
        : `Up to date (${nextPhotos.length.toLocaleString()} photos)`;

      const shouldPersistBackfillConfig =
        sourceType === 'plex' && !plexConfig && Boolean(resolvedPlexConfig);

      if (changed || shouldPersistBackfillConfig) {
        const latestStore = useDashboardStore.getState();
        const photosToCommit = changed ? nextPhotos : prevPhotos;
        if (!targetWidgetId) {
          await latestStore.setCommonPhotos(
            photosToCommit,
            nextLabel,
            sourceType === 'web' ? sourceUrl : undefined,
            sourceType,
            resolvedPlexConfig
          );
        } else {
          await latestStore.finalizePhotosToTarget(
            targetWidgetId,
            photosToCommit,
            nextLabel,
            sourceType === 'web' ? sourceUrl : undefined,
            sourceType,
            resolvedPlexConfig
          );
        }
        if (changed) {
          cachePhotosLocally(nextPhotos);
        }
      }

      await this.recordSyncSuccess(targetKey, summary);

      if (reason === 'auto') {
        store.setPhotoSyncState(null);
      } else {
        store.setPhotoSyncState({
          isActive: false,
          isSilent: false,
          sourceType,
          sourceLabel: nextLabel || 'Photo Library',
          loadedCount: nextPhotos.length,
          statusMessage: summary,
          targetWidgetId,
        });
        this.scheduleStatusClear(4000);
      }

      return {
        status: changed ? 'updated' : 'unchanged',
        addedCount,
        totalCount: nextPhotos.length,
        message: summary,
      };
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        store.setPhotoSyncState(null);
        return { status: 'skipped', message: 'Scan cancelled.' };
      }
      const errMsg = err?.message || 'Photo library rescan failed.';
      console.warn('Photo library rescan error:', err);
      await this.recordSyncFailure(targetKey, errMsg);

      if (reason === 'auto') {
        store.setPhotoSyncState(null);
      } else {
        store.setPhotoSyncState({
          isActive: false,
          isSilent: false,
          sourceType,
          sourceLabel: sourceLabel || 'Photo Library',
          loadedCount: prevPhotos.length,
          statusMessage: `Rescan failed: ${errMsg}`,
          targetWidgetId,
        });
        this.scheduleStatusClear(5000);
      }

      return { status: 'error', message: errMsg };
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  public async runDueAutoSyncs(): Promise<void> {
    await this.init();
    const state = useDashboardStore.getState();
    const interval = state.settings.photoAutoSyncInterval ?? 'daily';

    if (interval === 'manual') return;
    if (state.settings.nightModeEnabled) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (this.activeAbortController || state.photoSyncState?.isActive) return;

    const hasCommonWidget = state.widgets.some(
      (w) => !w.deleted_at && w.type === 'photo_frame' && w.config?.useCommonSource !== false
    );

    if (
      isTargetRescannable(
        state.settings.commonPhotoSourceType,
        state.settings.commonPhotoSourceUrl,
        state.settings.commonPhotoPlexConfig,
        state.settings.commonPhotoSourceLabel
      ) &&
      ((state.settings.commonPhotos?.length || 0) > 0 || hasCommonWidget) &&
      isAutoSyncDue(this.metaMap['common'], interval)
    ) {
      await this.rescanTarget({ reason: 'auto' });
    }

    const customPhotoWidgets = state.widgets.filter(
      (w) => !w.deleted_at && w.type === 'photo_frame' && w.config?.useCommonSource === false
    );

    for (const widget of customPhotoWidgets) {
      const current = useDashboardStore.getState();
      if ((current.settings.photoAutoSyncInterval ?? 'daily') === 'manual') break;
      if (current.settings.nightModeEnabled) break;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') break;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

      if (
        isTargetRescannable(
          widget.config?.sourceType,
          widget.config?.sourceUrl,
          widget.config?.plexSyncConfig as PlexPhotoSyncConfig | undefined,
          widget.config?.sourceLabel
        ) &&
        isAutoSyncDue(this.metaMap[getPhotoSyncTargetKey(widget.id)], interval)
      ) {
        await this.rescanTarget({ targetWidgetId: widget.id, reason: 'auto' });
      }
    }
  }
}

export const photoSyncService = new PhotoSyncService();
