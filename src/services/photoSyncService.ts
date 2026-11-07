import { useDashboardStore } from '../store/dashboardStore';
import {
  type PhotoItem,
  type LocalDirectoryInspection,
  scanSelectedSubfolders,
  resolveWebAndCloudPhotoUrls,
  cachePhotosLocally,
} from './photos';
import { getPlexPhotosFromSection } from './plex';

export interface PlexSyncParams {
  serverUri: string;
  serverAccessToken: string;
  sectionKey: string;
  folderOrAlbumKey?: string;
  folderOrAlbumKeys?: string | string[];
  minYear?: number;
  maxYear?: number;
  sourceLabel: string;
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

class PhotoSyncService {
  private activeAbortController: AbortController | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

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

  private scheduleStatusClear(delayMs = 3500) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      useDashboardStore.getState().setPhotoSyncState(null);
      this.clearTimer = null;
    }, delayMs);
  }

  // 1. Plex Progressive Background Ingestion
  public async startPlexBackgroundSync(params: PlexSyncParams) {
    this.cancelSync();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const store = useDashboardStore.getState();
    const targetWidgetId = params.applyToAll ? undefined : params.targetWidgetId;

    store.setPhotoSyncState({
      isActive: true,
      sourceType: 'plex',
      sourceLabel: params.sourceLabel,
      loadedCount: 0,
      statusMessage: 'Connecting to Plex and indexing initial photos...',
      targetWidgetId,
    });

    let initialBatchFired = false;

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

            if (isInitial && !initialBatchFired) {
              initialBatchFired = true;
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'plex'
              );
              cachePhotosLocally(batchPhotos);

              store.setPhotoSyncState({
                isActive: true,
                sourceType: 'plex',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Streaming first ${batchPhotos.length} photos (indexing in background)...`,
                targetWidgetId,
              });

              params.onInitialBatchReady?.(batchPhotos);
            } else if (!isDone) {
              await store.appendPhotosToTarget(
                targetWidgetId,
                batchPhotos,
                params.sourceLabel,
                undefined,
                'plex'
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
                'plex'
              );
              cachePhotosLocally(batchPhotos);

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

      if (!initialBatchFired && photos.length > 0 && !signal.aborted) {
        await store.finalizePhotosToTarget(
          targetWidgetId,
          photos,
          params.sourceLabel,
          undefined,
          'plex'
        );
        cachePhotosLocally(photos);
        params.onInitialBatchReady?.(photos);
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return;
      console.warn('Plex background sync error:', err);
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
                isActive: true,
                sourceType: 'local',
                sourceLabel: params.sourceLabel,
                loadedCount: batchPhotos.length,
                statusMessage: `Loaded first ${batchPhotos.length} photos (scanning remaining folders)...`,
                targetWidgetId,
              });

              params.onInitialBatchReady?.(batchPhotos);
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
    }
  }

  // 3. Web / Google Photos / Google Drive Progressive Ingestion
  public async startWebBackgroundSync(params: WebSyncParams) {
    this.cancelSync();

    const controller = new AbortController();
    this.activeAbortController = controller;
    const { signal } = controller;

    const store = useDashboardStore.getState();
    const targetWidgetId = params.applyToAll ? undefined : params.targetWidgetId;

    store.setPhotoSyncState({
      isActive: true,
      sourceType: 'web',
      sourceLabel: 'Google Photos & Cloud Links',
      loadedCount: 0,
      statusMessage: 'Connecting to Google Photos & resolving cloud links...',
      targetWidgetId,
    });

    let initialBatchFired = false;

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

            const hasMore = (res.totalAlbumCount || 0) > batchPhotos.length;

            store.setPhotoSyncState({
              isActive: hasMore,
              sourceType: 'web',
              sourceLabel: label,
              loadedCount: batchPhotos.length,
              totalCount: res.totalAlbumCount,
              statusMessage: hasMore
                ? `Loaded first ${batchPhotos.length} photos (retrieving remaining album in background)...`
                : `Loaded ${batchPhotos.length} photos!`,
              targetWidgetId,
            });

            params.onInitialBatchReady?.(batchPhotos, label, res.totalAlbumCount);
            if (!hasMore) {
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

      if (!initialBatchFired && res.photos.length > 0 && !signal.aborted) {
        await store.finalizePhotosToTarget(
          targetWidgetId,
          res.photos,
          res.sourceTitle || 'Web Photos',
          params.webUrlsText,
          'web'
        );
        cachePhotosLocally(res.photos);
        params.onInitialBatchReady?.(res.photos, res.sourceTitle || 'Web Photos');
      }
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return;
      console.warn('Web / Cloud background sync error:', err);
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
    }
  }
}

export const photoSyncService = new PhotoSyncService();
