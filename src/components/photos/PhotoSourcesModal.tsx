import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  FolderOpen,
  FolderPlus,
  Trash2,
  Check,
  Cloud,
  CheckCircle2,
  Tv,
  Globe,
  RefreshCw,
  ExternalLink,
  ImageIcon,
  Loader2,
  Sparkles,
  Mountain,
  Waves,
  Trees,
  Telescope,
  Palette,
  Building2,
  Coffee,
  Leaf,
  QrCode,
  Copy,
  Calendar,
  CheckSquare,
  Square,
  Search,
  ArrowLeft,
  Info,
  Clock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  requestPlexPin,
  pollPlexPin,
  getPlexToken,
  savePlexToken,
  clearPlexToken,
  getPlexServers,
  getPlexPhotoLibraries,
  getPlexSectionFolders,
  getPlexSectionYears,
  getPlexSectionTotalPhotos,
  getBestPlexConnectionUri,
  type PlexPinResponse,
  type PlexServerResource,
  type PlexLibrarySection,
  type PlexFolderItem,
} from '../../services/plex';
import {
  CURATED_CATEGORIES,
  getCuratedCategoryById,
  inferCuratedCategoryId,
  promptLocalDirectoryHandle,
  inspectLocalDirectory,
  inspectLocalFileList,
  scanDirectoryHandle,
  type LocalDirectoryInspection,
  parseFileListToPhotos,
  cachePhotosLocally,
  getOptimizedPhotoUrl,
  isGooglePhotosUrl,
  isGoogleDriveFolderUrl,
  parseGoogleDriveLink,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';
import { photoSyncService } from '../../services/photoSyncService';
import { addPlexToken, stripPlexToken } from '../../services/plexLinks';
import { usePlexServerTokens } from '../../hooks/usePlexServerTokens';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  type PlexPhotoSyncConfig,
  formatCooldownRemaining,
  getManualRescanCooldownRemainingMs,
  getPhotoSyncTargetKey,
  isSamePlexSyncConfig,
} from '../../utils/photoSyncPolicy';

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Mountain,
  Waves,
  Trees,
  Telescope,
  Palette,
  Building2,
  Coffee,
  Leaf,
};

interface SelectedFolderInfo {
  id: string;
  name: string;
  photos: PhotoItem[];
}

interface PhotoSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotosLoaded: (
    photos: PhotoItem[],
    sourceName: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated',
    applyToAll?: boolean,
    plexSyncConfig?: PlexPhotoSyncConfig,
    curatedCategoryId?: string
  ) => void;
  targetWidgetId?: string;
  initialWebUrls?: string;
  currentSourceLabel?: string;
  currentSourceType?: 'plex' | 'local' | 'web' | 'curated';
  currentCuratedCategoryId?: string;
  currentPhotoCount?: number;
  isCommonSource?: boolean;
  initialTab?: 'plex' | 'local' | 'web' | 'curated';
  // Backward compatibility optional props (styled in Tile Settings)
  currentStyle?: PhotoDisplayStyle;
  onStyleChange?: (style: PhotoDisplayStyle) => void;
  rotationIntervalSec?: number;
  onRotationIntervalChange?: (sec: number) => void;
  polaroidCount?: number;
  onPolaroidCountChange?: (count: number) => void;
  polaroidSizeMode?: 'mixed' | 'uniform' | 'small' | 'large';
  onPolaroidSizeModeChange?: (mode: 'mixed' | 'uniform' | 'small' | 'large') => void;
}

export const PhotoSourcesModal: React.FC<PhotoSourcesModalProps> = ({
  isOpen,
  onClose,
  onPhotosLoaded,
  targetWidgetId,
  initialWebUrls = '',
  currentSourceLabel,
  currentSourceType,
  currentCuratedCategoryId,
  currentPhotoCount,
  isCommonSource,
  initialTab,
}) => {
  const photoSyncState = useDashboardStore((s) => s.photoSyncState);
  const [activeTab, setActiveTab] = useState<'plex' | 'local' | 'web' | 'curated'>(initialTab || 'plex');
  const [applyToAll, setApplyToAll] = useState<boolean>(isCommonSource ?? false);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isCommonSource !== undefined) {
      setApplyToAll(isCommonSource);
    }
  }, [isCommonSource]);

  // Plex auth & server states
  const { tokens: plexServerTokens } = usePlexServerTokens();
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const [pinData, setPinData] = useState<PlexPinResponse | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [servers, setServers] = useState<PlexServerResource[]>([]);
  const [selectedServer, setSelectedServer] = useState<PlexServerResource | null>(null);
  const [photoSections, setPhotoSections] = useState<PlexLibrarySection[]>([]);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('');
  const [sectionFolders, setSectionFolders] = useState<PlexFolderItem[]>([]);
  const [plexScopeMode, setPlexScopeMode] = useState<'timeline' | 'folders'>('timeline');
  const [selectedPlexFolderKeys, setSelectedPlexFolderKeys] = useState<Set<string>>(new Set());
  const [plexDateFilter, setPlexDateFilter] = useState<'all' | 'last3Years' | 'last5Years' | 'last1Year'>('all');
  const [plexAvailableYears, setPlexAvailableYears] = useState<number[]>([]);
  const [plexFolderSearchQuery, setPlexFolderSearchQuery] = useState<string>('');
  const [isFoldersLoading, setIsFoldersLoading] = useState(false);
  const [plexLoading, setPlexLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sectionTotalPhotos, setSectionTotalPhotos] = useState<number | null>(null);

  // Compute live effective photo count from store and props
  const storeCommonPhotos = useDashboardStore((s) => s.settings.commonPhotos);
  const storeCommonLabel = useDashboardStore((s) => s.settings.commonPhotoSourceLabel);
  const storeCommonType = useDashboardStore((s) => s.settings.commonPhotoSourceType);
  const storeCommonPlexConfig = useDashboardStore((s) => s.settings.commonPhotoPlexConfig);
  const storeWidgetPlexConfig = useDashboardStore((s) =>
    targetWidgetId
      ? (s.widgets.find((w) => w.id === targetWidgetId)?.config?.plexSyncConfig as PlexPhotoSyncConfig | undefined)
      : undefined
  );
  const photoSyncMeta = useDashboardStore((s) => s.photoSyncMeta);
  const savedPlexConfig = isCommonSource ? storeCommonPlexConfig : storeWidgetPlexConfig;
  const targetSyncKey = getPhotoSyncTargetKey(applyToAll ? undefined : targetWidgetId);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setNowTick(Date.now());
    void photoSyncService.init();
    const timer = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !savedPlexConfig) return;
    setPlexScopeMode(savedPlexConfig.scopeMode || 'timeline');
    setPlexDateFilter(savedPlexConfig.dateFilter || 'all');
    setSelectedPlexFolderKeys(new Set(savedPlexConfig.folderKeys || []));
  }, [isOpen, savedPlexConfig]);

  const manualCooldownRemainingMs = getManualRescanCooldownRemainingMs(
    photoSyncMeta[targetSyncKey],
    nowTick
  );

  const effectivePhotoCount = currentPhotoCount ?? (isCommonSource ? storeCommonPhotos?.length : undefined) ?? 0;
  const effectiveSourceLabel = currentSourceLabel || (isCommonSource ? storeCommonLabel : undefined);
  const effectiveSourceType = currentSourceType || (isCommonSource ? storeCommonType : undefined);
  const displayCount = Math.max(effectivePhotoCount, photoSyncState?.loadedCount || 0);

  const handleTogglePlexFolder = (key: string) => {
    setSelectedPlexFolderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredPlexFolders = useMemo(() => {
    const query = plexFolderSearchQuery.trim().toLowerCase();
    if (!query) return sectionFolders;
    return sectionFolders.filter(
      (f) =>
        f.title.toLowerCase().includes(query) ||
        (f.parentTitle && f.parentTitle.toLowerCase().includes(query))
    );
  }, [sectionFolders, plexFolderSearchQuery]);

  const isAllPlexFoldersSelected = useMemo(() => {
    if (filteredPlexFolders.length === 0) return false;
    return filteredPlexFolders.every((f) => selectedPlexFolderKeys.has(f.key));
  }, [filteredPlexFolders, selectedPlexFolderKeys]);

  const handleToggleSelectAllPlexFolders = () => {
    if (isAllPlexFoldersSelected) {
      setSelectedPlexFolderKeys((prev) => {
        const next = new Set(prev);
        filteredPlexFolders.forEach((f) => next.delete(f.key));
        return next;
      });
    } else {
      setSelectedPlexFolderKeys((prev) => {
        const next = new Set(prev);
        filteredPlexFolders.forEach((f) => next.add(f.key));
        return next;
      });
    }
  };

  const handleDeselectAllPlexFolders = () => {
    setSelectedPlexFolderKeys(new Set());
  };

  // Local NAS / PC multi-folder state
  const [selectedFolders, setSelectedFolders] = useState<SelectedFolderInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLimit, setScanLimit] = useState<number>(Infinity);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local Subfolder Multi-Select State
  const [subfolderInspection, setSubfolderInspection] = useState<LocalDirectoryInspection | null>(null);
  const [selectedSubfolderNames, setSelectedSubfolderNames] = useState<Set<string>>(new Set());
  const [includeRootPhotos, setIncludeRootPhotos] = useState<boolean>(true);
  const [subfolderSearchQuery, setSubfolderSearchQuery] = useState<string>('');

  // Web / Google Drive state
  const [webUrlsText, setWebUrlsText] = useState(initialWebUrls || '');
  const [selectedCuratedCategoryId, setSelectedCuratedCategoryId] = useState<string>('all');

  const detectedSources = useMemo(() => {
    const lines = webUrlsText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    return lines.map((line, idx) => {
      if (isGooglePhotosUrl(line)) {
        return {
          id: `src-${idx}`,
          type: 'gphotos' as const,
          label: 'Google Photos Album',
          url: line,
        };
      }
      if (isGoogleDriveFolderUrl(line)) {
        return {
          id: `src-${idx}`,
          type: 'gdrive_folder' as const,
          label: 'Google Drive Folder',
          url: line,
        };
      }
      if (parseGoogleDriveLink(line)) {
        return {
          id: `src-${idx}`,
          type: 'gdrive_file' as const,
          label: 'Google Drive File',
          url: line,
        };
      }
      return {
        id: `src-${idx}`,
        type: 'web' as const,
        label: 'Direct Web Image',
        url: line,
      };
    });
  }, [webUrlsText]);

  const handleRemoveSourceLine = (indexToRemove: number) => {
    const lines = webUrlsText
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);
    const updated = lines.filter((_, idx) => idx !== indexToRemove).join('\n');
    setWebUrlsText(updated);
  };
  const [isWebLoading, setIsWebLoading] = useState(false);

  const loadSectionFolders = async (server: PlexServerResource, token: string, secKey: string) => {
    const uri = getBestPlexConnectionUri(server);
    if (!uri || !secKey) return;
    setIsFoldersLoading(true);
    setSelectedPlexFolderKeys(new Set());
    setSectionTotalPhotos(null);
    try {
      const [folders, years, totalCnt] = await Promise.all([
        getPlexSectionFolders(uri, server.accessToken || token, secKey),
        getPlexSectionYears(uri, server.accessToken || token, secKey).catch(() => []),
        getPlexSectionTotalPhotos(uri, server.accessToken || token, secKey).catch(() => null),
      ]);
      setSectionFolders(folders);
      if (years && years.length > 0) {
        setPlexAvailableYears(years);
      }
      if (typeof totalCnt === 'number') {
        setSectionTotalPhotos(totalCnt);
      }
    } catch (err: any) {
      console.warn('Could not load section folders:', err);
      setSectionFolders([]);
    } finally {
      setIsFoldersLoading(false);
    }
  };

  const loadPhotoSections = async (server: PlexServerResource, token: string) => {
    const uri = getBestPlexConnectionUri(server);
    if (!uri) {
      setStatusMessage("No reachable URI for this server.");
      return;
    }
    setPlexLoading(true);
    try {
      const sections = await getPlexPhotoLibraries(uri, server.accessToken || token, true);
      setPhotoSections(sections);
      if (sections.length > 0) {
        const preferredSection =
          (savedPlexConfig?.sectionKey &&
            sections.find((s) => s.key === savedPlexConfig.sectionKey)) ||
          sections.find((s) => s.isPhoto) ||
          sections[0];
        setSelectedSectionKey(preferredSection.key);
        loadSectionFolders(server, token, preferredSection.key);
      } else {
        setStatusMessage("No libraries found on this Plex server.");
      }
    } catch (err: any) {
      setStatusMessage(`Error fetching library sections: ${err.message}`);
    } finally {
      setPlexLoading(false);
    }
  };

  const fetchServers = async (token: string) => {
    setPlexLoading(true);
    try {
      const sList = await getPlexServers(token);
      setServers(sList);
      if (sList.length > 0) {
        const preferredServer =
          (savedPlexConfig?.serverClientIdentifier &&
            sList.find((s) => s.clientIdentifier === savedPlexConfig.serverClientIdentifier)) ||
          (savedPlexConfig?.serverName &&
            sList.find((s) => s.name === savedPlexConfig.serverName)) ||
          sList[0];
        setSelectedServer(preferredServer);
        loadPhotoSections(preferredServer, token);
      } else {
        setStatusMessage("No Plex Media Servers found for this account.");
      }
    } catch (err: any) {
      setStatusMessage(`Error loading Plex servers: ${err.message}`);
    } finally {
      setPlexLoading(false);
    }
  };

  // Load existing Plex token if present
  useEffect(() => {
    if (isOpen) {
      getPlexToken().then((token) => {
        setPlexToken(token);
        if (token) {
          fetchServers(token);
        }
      });
    }
  }, [isOpen]);

  // Poll for Plex PIN approval when pinData is active
  useEffect(() => {
    if (!pinData || plexToken) return;

    const interval = setInterval(async () => {
      try {
        const token = await pollPlexPin(pinData.id);
        if (token) {
          clearInterval(interval);
          setPlexToken(token);
          await savePlexToken(token);
          setPinData(null);
          setStatusMessage('Plex successfully paired! Loading servers...');
          fetchServers(token);
        }
      } catch (err) {
        console.warn('Error polling Plex PIN:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pinData, plexToken]);

  // Request new Plex PIN
  const handleStartPlexAuth = async () => {
    setIsPinLoading(true);
    setStatusMessage('');
    try {
      const pin = await requestPlexPin();
      setPinData(pin);
    } catch (err: any) {
      setStatusMessage(`Plex PIN request failed: ${err.message}`);
    } finally {
      setIsPinLoading(false);
    }
  };

  const handleDisconnectPlex = async () => {
    await clearPlexToken();
    setPlexToken(null);
    setPinData(null);
    setServers([]);
    setSelectedServer(null);
    setPhotoSections([]);
    setSectionFolders([]);
    setSelectedSectionKey('');
    setSelectedPlexFolderKeys(new Set());
    setPlexScopeMode('timeline');
    setPlexDateFilter('all');
    setPlexAvailableYears([]);
    setSectionTotalPhotos(null);
    setStatusMessage('Plex disconnected.');
  };

  const handleLoadPlexPhotos = async () => {
    if (!selectedServer || !selectedSectionKey || !plexToken) return;
    const uri = getBestPlexConnectionUri(selectedServer);
    if (!uri) {
      setStatusMessage('No reachable connection URI for this server.');
      return;
    }

    const currentSection = photoSections.find((s) => s.key === selectedSectionKey);
    const sectionTitle = currentSection?.title || 'Photos';

    let targetFolderKeys: string[] | undefined = undefined;
    let folderLabelSuffix = '';
    let minYear: number | undefined = undefined;
    let timeLabelSuffix = '';

    if (plexScopeMode === 'folders') {
      if (selectedPlexFolderKeys.size === 0) {
        setStatusMessage('Please select at least one folder or album from your Plex library.');
        return;
      }
      targetFolderKeys = Array.from(selectedPlexFolderKeys);
      if (targetFolderKeys.length === 1) {
        const singleFolder = sectionFolders.find((f) => f.key === targetFolderKeys![0]);
        folderLabelSuffix = ` - ${singleFolder?.title || 'Folder'}`;
      } else {
        folderLabelSuffix = ` [${targetFolderKeys.length} Folders]`;
      }
    } else {
      // Timeline / Date Scope
      const currentYear = new Date().getFullYear();
      if (plexDateFilter === 'last3Years') {
        minYear = currentYear - 2;
        timeLabelSuffix = ` [Last 3 Years: ${minYear}–${currentYear}]`;
      } else if (plexDateFilter === 'last5Years') {
        minYear = currentYear - 4;
        timeLabelSuffix = ` [Last 5 Years: ${minYear}–${currentYear}]`;
      } else if (plexDateFilter === 'last1Year') {
        minYear = currentYear - 1;
        timeLabelSuffix = ` [Past Year: ${minYear}–${currentYear}]`;
      }
    }

    const sourceLabel = `Plex (${selectedServer.name} - ${sectionTitle}${folderLabelSuffix}${timeLabelSuffix})`;
    const plexSyncConfig: PlexPhotoSyncConfig = {
      serverClientIdentifier: selectedServer.clientIdentifier,
      serverName: selectedServer.name,
      serverUri: stripPlexToken(uri),
      sectionKey: selectedSectionKey,
      scopeMode: plexScopeMode,
      folderKeys: plexScopeMode === 'folders' ? targetFolderKeys : undefined,
      dateFilter: plexScopeMode === 'timeline' ? plexDateFilter : undefined,
    };

    setPlexLoading(true);
    setStatusMessage(
      minYear
        ? `Connecting to Plex and filtering photos taken since ${minYear}...`
        : 'Connecting to Plex and indexing library in background...'
    );

    photoSyncService.startPlexBackgroundSync({
      serverUri: uri,
      serverAccessToken: selectedServer.accessToken || plexToken,
      sectionKey: selectedSectionKey,
      folderOrAlbumKeys: targetFolderKeys,
      minYear,
      sourceLabel,
      plexSyncConfig,
      targetWidgetId: isCommonSource ? undefined : targetWidgetId,
      applyToAll,
      onInitialBatchReady: (initialBatch) => {
        onPhotosLoaded(initialBatch, sourceLabel, undefined, 'plex', applyToAll, plexSyncConfig);
        setStatusMessage(`Streaming ${initialBatch.length} photos! Continuing library indexing in background...`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('plex_auth_changed', { detail: { hasToken: true } }));
        }
        setTimeout(() => onClose(), 1500);
      },
      onError: (errMsg) => {
        setStatusMessage(`Error streaming photos: ${errMsg}`);
        setPlexLoading(false);
      },
    });
  };

  // Local Multi-Folder Pickers & Handlers
  const handleSelectAllSubfolders = () => {
    if (!subfolderInspection) return;
    const all = new Set<string>(subfolderInspection.subfolders.map((s) => s.name));
    setSelectedSubfolderNames(all);
    setIncludeRootPhotos(true);
  };

  const handleDeselectAllSubfolders = () => {
    setSelectedSubfolderNames(new Set());
    setIncludeRootPhotos(false);
  };

  const handleSelectRecentYears = (yearCount: number) => {
    if (!subfolderInspection) return;
    const yearSubfolders = subfolderInspection.subfolders.filter((s) => s.isYear);
    const targetPool = yearSubfolders.length > 0 ? yearSubfolders : subfolderInspection.subfolders;
    const selected = new Set<string>(targetPool.slice(0, yearCount).map((s) => s.name));
    setSelectedSubfolderNames(selected);
  };

  const handleToggleSubfolder = (name: string) => {
    setSelectedSubfolderNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const filteredSubfolders = useMemo(() => {
    if (!subfolderInspection) return [];
    const query = subfolderSearchQuery.trim().toLowerCase();
    if (!query) return subfolderInspection.subfolders;
    return subfolderInspection.subfolders.filter((s) => s.name.toLowerCase().includes(query));
  }, [subfolderInspection, subfolderSearchQuery]);

  const handleConfirmSubfolderSelection = async () => {
    if (!subfolderInspection) return;
    if (selectedSubfolderNames.size === 0 && (!includeRootPhotos || !subfolderInspection.hasDirectPhotos)) {
      setStatusMessage('Please select at least one subfolder to import.');
      return;
    }

    setIsScanning(true);
    setStatusMessage(
      `Importing ${selectedSubfolderNames.size} subfolder(s) from "${subfolderInspection.rootName}" in background...`
    );

    const sourceLabel = `Local (${subfolderInspection.rootName})`;

    photoSyncService.startLocalBackgroundSync({
      inspection: subfolderInspection,
      selectedSubfolderNames,
      includeRootPhotos,
      scanLimit,
      sourceLabel,
      targetWidgetId: isCommonSource ? undefined : targetWidgetId,
      applyToAll,
      onInitialBatchReady: (initialBatch) => {
        onPhotosLoaded(initialBatch, sourceLabel, undefined, 'local', applyToAll);
        setStatusMessage(`Streaming ${initialBatch.length} photos! Scanning remaining folders in background...`);
        setSubfolderInspection(null);
        setTimeout(() => onClose(), 1500);
      },
      onError: (errMsg) => {
        setStatusMessage(`Error scanning subfolders: ${errMsg}`);
        setIsScanning(false);
      },
    });
  };

  const handlePickFolder = async () => {
    setIsScanning(true);
    setStatusMessage('Opening directory picker...');
    try {
      const promptRes = await promptLocalDirectoryHandle();
      if (!promptRes.success) {
        if (!promptRes.cancelled && promptRes.error) {
          setStatusMessage(promptRes.error);
        }
        return;
      }

      const dirHandle = promptRes.dirHandle;
      setStatusMessage(`Inspecting "${dirHandle.name}" for subfolders...`);
      const inspection = await inspectLocalDirectory(dirHandle);

      if (inspection.subfolders.length === 0) {
        // Flat folder without subdirectories: scan directly
        setStatusMessage(
          isFinite(scanLimit)
            ? `Scanning folder (up to ${scanLimit.toLocaleString()} photos)...`
            : 'Scanning folder (unlimited photos)...'
        );
        const localPhotos: PhotoItem[] = [];
        await scanDirectoryHandle(dirHandle, localPhotos, scanLimit, 0, 12, (count, dirName) => {
          setStatusMessage(`Scanning "${dirName}": ${count} photos found...`);
        });

        if (localPhotos.length > 0) {
          const folderName = dirHandle.name || 'Selected Folder';
          setSelectedFolders((prev) => [
            ...prev,
            {
              id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: folderName,
              photos: localPhotos,
            },
          ]);
          setStatusMessage(`Added "${folderName}" with ${localPhotos.length} photos.`);
        } else {
          setStatusMessage(`No photos (.jpg, .png, .webp, .heic) found in "${dirHandle.name}".`);
        }
      } else {
        // Subfolders detected! Prompt subfolder multi-selection
        setSubfolderInspection(inspection);
        const initialSelected = new Set<string>();
        const yearSubfolders = inspection.subfolders.filter((s) => s.isYear);
        if (yearSubfolders.length >= 5) {
          yearSubfolders.slice(0, 5).forEach((s) => initialSelected.add(s.name));
        } else {
          inspection.subfolders.forEach((s) => initialSelected.add(s.name));
        }
        setSelectedSubfolderNames(initialSelected);
        setIncludeRootPhotos(inspection.hasDirectPhotos);
        setSubfolderSearchQuery('');
        setStatusMessage(
          `Found ${inspection.subfolders.length} subfolders in "${inspection.rootName}". Select the ones you want to import.`
        );
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsScanning(true);
    setStatusMessage('Inspecting selected folder...');
    try {
      const inspection = inspectLocalFileList(e.target.files);
      if (inspection.subfolders.length === 0) {
        const { folderName, photos } = parseFileListToPhotos(e.target.files, scanLimit);
        if (photos.length > 0) {
          setSelectedFolders((prev) => [
            ...prev,
            {
              id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: folderName,
              photos,
            },
          ]);
          setStatusMessage(`Added "${folderName}" with ${photos.length} photos.`);
        } else {
          setStatusMessage(`No photos found in "${folderName}".`);
        }
      } else {
        setSubfolderInspection(inspection);
        const initialSelected = new Set<string>();
        const yearSubfolders = inspection.subfolders.filter((s) => s.isYear);
        if (yearSubfolders.length >= 5) {
          yearSubfolders.slice(0, 5).forEach((s) => initialSelected.add(s.name));
        } else {
          inspection.subfolders.forEach((s) => initialSelected.add(s.name));
        }
        setSelectedSubfolderNames(initialSelected);
        setIncludeRootPhotos(inspection.hasDirectPhotos);
        setSubfolderSearchQuery('');
        setStatusMessage(
          `Found ${inspection.subfolders.length} subfolders in "${inspection.rootName}". Select the ones you want to import.`
        );
      }
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFolder = (folderId: string) => {
    setSelectedFolders((prev) => prev.filter((f) => f.id !== folderId));
    setStatusMessage('Folder removed from selection.');
  };

  const totalSelectedPhotos = useMemo(() => {
    return selectedFolders.reduce((sum, f) => sum + f.photos.length, 0);
  }, [selectedFolders]);

  const handleApplySelectedFolders = () => {
    const allPhotos = selectedFolders.flatMap((f) => f.photos);
    if (allPhotos.length === 0) {
      setStatusMessage('Please select at least one folder with photos.');
      return;
    }
    const sourceLabel =
      selectedFolders.length === 1
        ? `Local (${selectedFolders[0].name})`
        : `Local (${selectedFolders.length} Folders)`;

    onPhotosLoaded(allPhotos, sourceLabel, undefined, 'local', applyToAll);
    cachePhotosLocally(allPhotos);
    setStatusMessage(`Applied ${allPhotos.length} photos from ${selectedFolders.length} folder(s)!`);
    setTimeout(() => onClose(), 1000);
  };

  // Web / Google Photos & Drive URLs
  const handleApplyWebUrls = async () => {
    setIsWebLoading(true);
    setStatusMessage('Connecting to Google Photos / web links in background...');

    photoSyncService.startWebBackgroundSync({
      webUrlsText,
      targetWidgetId: isCommonSource ? undefined : targetWidgetId,
      applyToAll,
      onInitialBatchReady: (initialBatch, sourceTitle, totalAlbumCount) => {
        onPhotosLoaded(initialBatch, sourceTitle, webUrlsText, 'web', applyToAll);
        const countText =
          totalAlbumCount && totalAlbumCount > initialBatch.length
            ? `Streaming ${initialBatch.length} of ${totalAlbumCount.toLocaleString()} photos! Full sync continuing in background...`
            : `Loaded ${initialBatch.length} photos!`;
        setStatusMessage(countText);
        setTimeout(() => onClose(), 1500);
      },
      onError: (errMsg) => {
        setStatusMessage(errMsg);
        setIsWebLoading(false);
      },
    });
  };

  // Curated Preset
  const handleApplyCuratedCategory = (catId?: string) => {
    const targetId = catId || selectedCuratedCategoryId;
    const cat = getCuratedCategoryById(targetId);
    setSelectedCuratedCategoryId(targetId);
    const label = targetId === 'all' ? 'Curated Ambient' : `Curated (${cat.name})`;
    onPhotosLoaded(cat.photos, label, undefined, 'curated', applyToAll, undefined, targetId);
    cachePhotosLocally(cat.photos);
    setStatusMessage(`Loaded ${cat.photos.length} photos from "${cat.name}"!`);
    setTimeout(() => onClose(), 1000);
  };

  const handleApplyCurated = () => {
    handleApplyCuratedCategory('all');
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialWebUrls) {
      setWebUrlsText(initialWebUrls);
    }
    if (currentSourceType) {
      setActiveTab(currentSourceType);
    } else if (initialWebUrls) {
      setActiveTab('web');
    }
    const inferredCuratedId = inferCuratedCategoryId(currentCuratedCategoryId, currentSourceLabel);
    if (inferredCuratedId) {
      setSelectedCuratedCategoryId(inferredCuratedId);
    }
  }, [isOpen, initialWebUrls, currentSourceType, currentCuratedCategoryId, currentSourceLabel]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white">
                  {isCommonSource ? 'Common Photo Library' : 'Photo Frame & Media Sources'}
                </h2>
                {isCommonSource && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Shared Board Library
                  </span>
                )}
                {displayCount > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                    <ImageIcon className="w-3 h-3 text-emerald-400" />
                    <span>{displayCount.toLocaleString()} photos</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">
                {isCommonSource
                  ? 'Manage the shared photo library used across all your photo frames'
                  : 'Select photo sources, cloud albums, or curated ambient photography'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Navigation Tabs - All 4 sources visible at a glance on mobile & desktop */}
        <div className="grid grid-cols-4 sm:flex border-b border-gray-800 bg-gray-950/60 px-2 pt-2 pb-1.5 sm:pb-0 gap-1 shrink-0">
          {[
            { id: 'plex', label: 'Plex Server', shortLabel: 'Plex', icon: Tv },
            { id: 'local', label: 'Local Folder', shortLabel: 'Local', icon: FolderOpen },
            { id: 'web', label: 'Google Photos & Web', shortLabel: 'Web / Cloud', icon: Globe },
            { id: 'curated', label: 'Curated Scenery', shortLabel: 'Scenery', icon: Cloud },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setStatusMessage('');
                }}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-1 sm:px-3 text-[10px] sm:text-xs font-semibold rounded-xl sm:rounded-b-none sm:rounded-t-lg transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600/20 sm:bg-gray-900 text-blue-400 border border-blue-500/40 sm:border-0 sm:border-t-2 sm:border-blue-500 shadow'
                    : 'border border-transparent sm:border-0 text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="sm:hidden tracking-tight">{tab.shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {photoSyncState && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-sm transition-all ${
                photoSyncState.isActive
                  ? 'bg-blue-500/10 border-blue-500/25 text-blue-200 animate-pulse'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {photoSyncState.isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div className="truncate">
                  <span className="font-semibold text-white">
                    {photoSyncState.isActive ? 'Background Sync In Progress: ' : 'Scan Complete: '}
                  </span>
                  <span>{photoSyncState.statusMessage}</span>
                </div>
              </div>
              {photoSyncState.isActive ? (
                <button
                  type="button"
                  onClick={() => photoSyncService.cancelSync()}
                  className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium cursor-pointer transition-colors shrink-0"
                >
                  Cancel
                </button>
              ) : (
                <span className="text-[11px] font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 shrink-0">
                  {photoSyncState.loadedCount.toLocaleString()} photos
                </span>
              )}
            </div>
          )}

          {statusMessage && (
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs text-center font-medium">
              {statusMessage}
            </div>
          )}

          {/* TAB 1: PLEX MEDIA SERVER */}
          {activeTab === 'plex' && (
            <div className="space-y-4">
              {!plexToken ? (
                <div className="text-center py-4 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
                    <Tv className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Connect Plex Media Server</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                      Stream your personal photos directly from your home NAS or Plex server.
                    </p>
                  </div>

                  {/* Device-Local Pairing Security Notice */}
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 text-left flex items-start gap-2.5 max-w-md mx-auto">
                    <Tv className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300 block mb-0.5">
                        Device-Local Plex Pairing
                      </span>
                      <span className="text-[11px] text-gray-300 leading-relaxed block">
                        For your security, Plex credentials stay strictly on this device and are never stored in the cloud. Link this screen to stream your personal photo libraries.
                      </span>
                    </div>
                  </div>

                  {!pinData ? (
                    <button
                      onClick={handleStartPlexAuth}
                      disabled={isPinLoading}
                      className="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      {isPinLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Generating Code...</span>
                        </>
                      ) : (
                        <>
                          <Tv className="w-4 h-4" />
                          <span>Sign In with Plex</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="bg-gray-950 p-5 rounded-2xl border border-gray-800 space-y-4 max-w-md w-full mx-auto shadow-2xl overflow-hidden">
                      <div className="text-xs text-gray-300 text-center">
                        Scan the QR code with your phone camera or enter code at{' '}
                        <a
                          href={pinData.directLinkUrl || `https://plex.tv/link?pin=${pinData.code}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 font-bold underline font-mono hover:text-amber-300"
                        >
                          plex.tv/link
                        </a>
                      </div>

                      {/* QR Code and 4-Character PIN Code */}
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-1">
                        {/* QR Code Container */}
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          <div className="p-2.5 bg-white rounded-2xl shadow-lg ring-1 ring-black/10">
                            <QRCodeSVG
                              value={pinData.directLinkUrl || `https://plex.tv/link?pin=${pinData.code}`}
                              size={120}
                              bgColor="#ffffff"
                              fgColor="#000000"
                              level="M"
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                            <QrCode className="w-3 h-3 text-amber-400" />
                            Scan with camera
                          </span>
                        </div>

                        {/* 4-Character PIN Code Tiles & Action Buttons */}
                        <div className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-2">
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                            4-Character PIN Code
                          </span>

                          {/* 4 Distinct Character Tiles */}
                          <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                            {pinData.code.split('').map((char, idx) => (
                              <div
                                key={idx}
                                className="w-10 h-12 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-400 font-mono font-black text-2xl flex items-center justify-center shadow-inner select-all"
                              >
                                {char}
                              </div>
                            ))}
                          </div>

                          {/* Direct Action Buttons */}
                          <div className="flex items-center gap-2 pt-1 justify-center sm:justify-start">
                            <a
                              href={pinData.directLinkUrl || `https://plex.tv/link?pin=${pinData.code}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all hover:scale-105"
                            >
                              <span>Open plex.tv/link</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(pinData.code);
                                setCopiedPin(true);
                                setTimeout(() => setCopiedPin(false), 2000);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors cursor-pointer"
                              title="Copy PIN Code"
                            >
                              {copiedPin ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 text-[11px]">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span className="text-[11px]">Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Footer: Waiting status & refresh button */}
                      <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>Waiting for authorization on Plex...</span>
                        </div>
                        <button
                          onClick={handleStartPlexAuth}
                          disabled={isPinLoading}
                          className="text-[11px] text-gray-400 hover:text-amber-300 underline cursor-pointer"
                        >
                          New Code
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span className="font-semibold">Connected to Plex Account</span>
                    </div>
                    <button
                      onClick={handleDisconnectPlex}
                      className="text-gray-400 hover:text-red-400 text-xs underline cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* Active Configured Plex Library Banner */}
                  {displayCount > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <span className="text-gray-400">Current Library: </span>
                          <span className="text-white font-semibold">
                            {effectiveSourceLabel || 'Plex Photo Library'}
                          </span>
                          <span className="text-blue-300 ml-1.5 font-mono font-bold">
                            ({displayCount.toLocaleString()} photos loaded)
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 shrink-0">
                        Active
                      </span>
                    </div>
                  )}

                  {/* Server Picker */}
                  {servers.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-300">Plex Media Server</label>
                      <select
                        value={selectedServer?.clientIdentifier || ''}
                        onChange={(e) => {
                          const s = servers.find((item) => item.clientIdentifier === e.target.value);
                          if (s && plexToken) {
                            setSelectedServer(s);
                            loadPhotoSections(s, plexToken);
                          }
                        }}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {servers.map((s) => (
                          <option key={s.clientIdentifier} value={s.clientIdentifier}>
                            {s.name} ({s.product} {s.productVersion})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Photo Library Picker */}
                  {photoSections.length > 0 ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-gray-300">Photo Library</label>
                          <div className="flex items-center gap-2">
                            {sectionTotalPhotos !== null && sectionTotalPhotos > 0 && (
                              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                                {sectionTotalPhotos.toLocaleString()} photos on server
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">
                              {photoSections.length} {photoSections.length === 1 ? 'library' : 'libraries'} found
                            </span>
                            {selectedServer && plexToken && (
                              <button
                                type="button"
                                onClick={() => {
                                  loadPhotoSections(selectedServer, plexToken);
                                  if (selectedSectionKey) {
                                    const uri = getBestPlexConnectionUri(selectedServer);
                                    if (uri) {
                                      getPlexSectionTotalPhotos(uri, selectedServer.accessToken || plexToken, selectedSectionKey)
                                        .then((c) => setSectionTotalPhotos(c))
                                        .catch(() => {});
                                    }
                                  }
                                }}
                                disabled={plexLoading}
                                className="p-0.5 text-gray-400 hover:text-white transition-colors cursor-pointer"
                                title="Refresh library list"
                              >
                                <RefreshCw className={`w-3 h-3 ${plexLoading ? 'animate-spin text-blue-400' : ''}`} />
                              </button>
                            )}
                          </div>
                        </div>
                        <select
                          value={selectedSectionKey}
                          onChange={(e) => {
                            setSelectedSectionKey(e.target.value);
                            if (selectedServer && plexToken) {
                              loadSectionFolders(selectedServer, plexToken, e.target.value);
                            }
                          }}
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {photoSections.some((s) => s.isPhoto) && (
                            <optgroup label="Photo & Personal Media Libraries">
                              {photoSections
                                .filter((s) => s.isPhoto)
                                .map((sec) => (
                                  <option key={sec.key} value={sec.key}>
                                    📷 {sec.title}
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          {photoSections.some((s) => !s.isPhoto) && (
                            <optgroup label="Other Server Libraries">
                              {photoSections
                                .filter((s) => !s.isPhoto)
                                .map((sec) => (
                                  <option key={sec.key} value={sec.key}>
                                    📁 {sec.title} ({sec.type || 'media'})
                                  </option>
                                ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {/* Stream Scope: Timeline (By Date) vs Specific Folders & Albums */}
                      <div className="space-y-3 pt-2 border-t border-gray-800/80">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-gray-300">Choose Stream Scope</label>
                          {plexScopeMode === 'timeline' ? (
                            <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                              <span>⚡ Fast Server-Side Query</span>
                            </span>
                          ) : isFoldersLoading ? (
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                              <span>Scanning folders...</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">
                              {sectionFolders.length} {sectionFolders.length === 1 ? 'folder' : 'folders'} found
                            </span>
                          )}
                        </div>

                        {/* Top-Level Scope Switcher Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPlexScopeMode('timeline')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              plexScopeMode === 'timeline'
                                ? 'bg-blue-500/15 border-blue-500/50 text-white shadow-sm ring-1 ring-blue-500/30'
                                : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-semibold text-xs">
                              <div
                                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  plexScopeMode === 'timeline' ? 'border-blue-400 bg-blue-500' : 'border-gray-600'
                                }`}
                              >
                                {plexScopeMode === 'timeline' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <Calendar className={`w-4 h-4 ${plexScopeMode === 'timeline' ? 'text-blue-400' : 'text-gray-500'}`} />
                              <span>Capture Date &amp; Timeline</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 pl-5.5 leading-relaxed">
                              Stream entire library by when photos were actually taken (e.g. recent memories or all time)
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPlexScopeMode('folders')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              plexScopeMode === 'folders'
                                ? 'bg-blue-500/15 border-blue-500/50 text-white shadow-sm ring-1 ring-blue-500/30'
                                : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 font-semibold text-xs">
                              <div
                                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                  plexScopeMode === 'folders' ? 'border-blue-400 bg-blue-500' : 'border-gray-600'
                                }`}
                              >
                                {plexScopeMode === 'folders' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <FolderOpen className={`w-4 h-4 ${plexScopeMode === 'folders' ? 'text-blue-400' : 'text-gray-500'}`} />
                              <span>Specific Folders &amp; Albums</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 pl-5.5 leading-relaxed">
                              Pick specific disk folders or personal albums (e.g. Vacations, Favorites, Wallpapers)
                            </p>
                          </button>
                        </div>

                        {/* Mode 1: Timeline Presets */}
                        {plexScopeMode === 'timeline' && (
                          <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2.5 animate-fadeIn">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[10px] text-gray-400">
                              <span>Queries Plex EXIF capture dates directly without scanning folders:</span>
                              {plexAvailableYears.length > 0 && (
                                <span className="shrink-0 text-blue-300 font-mono bg-blue-950/40 border border-blue-900/40 px-1.5 py-0.5 rounded text-[9px] self-start sm:self-auto">
                                  Available Range: {plexAvailableYears[plexAvailableYears.length - 1]}–{plexAvailableYears[0]}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPlexDateFilter('all')}
                                className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                                  plexDateFilter === 'all'
                                    ? 'bg-blue-500/20 border-blue-500/50 text-white font-semibold shadow-sm'
                                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                              >
                                <span>🌟 All Time</span>
                                <span className="text-[9px] text-gray-500 mt-0.5">Entire library</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPlexDateFilter('last3Years')}
                                className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                                  plexDateFilter === 'last3Years'
                                    ? 'bg-blue-500/20 border-blue-500/50 text-white font-semibold shadow-sm'
                                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                              >
                                <span>📅 Last 3 Years</span>
                                <span className="text-[9px] text-gray-500 mt-0.5">
                                  {new Date().getFullYear() - 2}–{new Date().getFullYear()}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPlexDateFilter('last5Years')}
                                className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                                  plexDateFilter === 'last5Years'
                                    ? 'bg-blue-500/20 border-blue-500/50 text-white font-semibold shadow-sm'
                                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                              >
                                <span>📅 Last 5 Years</span>
                                <span className="text-[9px] text-gray-500 mt-0.5">
                                  {new Date().getFullYear() - 4}–{new Date().getFullYear()}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPlexDateFilter('last1Year')}
                                className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer flex flex-col items-center justify-center text-center ${
                                  plexDateFilter === 'last1Year'
                                    ? 'bg-blue-500/20 border-blue-500/50 text-white font-semibold shadow-sm'
                                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:border-gray-700'
                                }`}
                              >
                                <span>📅 Past Year</span>
                                <span className="text-[9px] text-gray-500 mt-0.5">
                                  {new Date().getFullYear() - 1}–{new Date().getFullYear()}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Mode 2: Multi-Folder Checklist */}
                        {plexScopeMode === 'folders' && (
                          <div className="p-3 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2.5 animate-fadeIn">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-gray-300">Choose Folders &amp; Albums</span>
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {selectedPlexFolderKeys.size} Selected
                              </span>
                            </div>

                            {/* Filter & Presets */}
                            <div className="space-y-2">
                              <div className="relative">
                                <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input
                                  type="text"
                                  value={plexFolderSearchQuery}
                                  onChange={(e) => setPlexFolderSearchQuery(e.target.value)}
                                  placeholder="Filter Plex folders or albums (e.g. 2024)..."
                                  className="w-full pl-8 pr-7 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                                {plexFolderSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setPlexFolderSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs cursor-pointer"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={handleToggleSelectAllPlexFolders}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                                    isAllPlexFoldersSelected
                                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                                      : 'bg-gray-900 hover:bg-gray-800 border-gray-800 text-gray-300'
                                  }`}
                                >
                                  {isAllPlexFoldersSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-gray-400" />
                                  )}
                                  <span>
                                    {isAllPlexFoldersSelected
                                      ? 'Deselect All'
                                      : `Select All (${filteredPlexFolders.length})`}
                                  </span>
                                </button>

                                {selectedPlexFolderKeys.size > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleDeselectAllPlexFolders}
                                    className="px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-red-400 text-[11px] font-medium transition-all cursor-pointer"
                                  >
                                    Clear Selection ({selectedPlexFolderKeys.size})
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Scrollable Folder Checklist */}
                            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                              {filteredPlexFolders.map((f) => {
                                const isSelected = selectedPlexFolderKeys.has(f.key);
                                const isYear = /^(19|20)\d{2}$/.test(f.title.trim());
                                return (
                                  <div
                                    key={f.key}
                                    onClick={() => handleTogglePlexFolder(f.key)}
                                    style={{ paddingLeft: `${Math.min(32, 8 + (f.depth || 0) * 14)}px` }}
                                    className={`py-1.5 pr-2.5 rounded-lg border text-xs flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                                      isSelected
                                        ? 'bg-blue-500/10 border-blue-500/30 text-white'
                                        : 'bg-gray-900/60 border-gray-800/80 text-gray-400 hover:border-gray-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {isSelected ? (
                                        <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                      ) : (
                                        <Square className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                      )}
                                      <FolderOpen
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          isSelected ? 'text-blue-400' : 'text-gray-500'
                                        }`}
                                      />
                                      <span className="font-semibold truncate">
                                        {f.parentTitle ? `${f.parentTitle} / ` : ''}
                                        {f.title}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {isYear && (
                                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                          Year
                                        </span>
                                      )}
                                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                        {f.type === 'photoalbum' ? 'Album' : 'Folder'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}

                              {filteredPlexFolders.length === 0 && (
                                <div className="text-center py-6 text-gray-500 text-xs">
                                  {isFoldersLoading
                                    ? 'Discovering folders & albums...'
                                    : `No folders matching "${plexFolderSearchQuery}"`}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic p-2 bg-gray-950 rounded-lg flex items-center justify-between">
                      <span>
                        {plexLoading
                          ? 'Scanning for libraries...'
                          : 'No libraries detected on this server.'}
                      </span>
                      {selectedServer && plexToken && !plexLoading && (
                        <button
                          type="button"
                          onClick={() => loadPhotoSections(selectedServer, plexToken)}
                          className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                        >
                          Retry Scan
                        </button>
                      )}
                    </div>
                  )}

                  {(() => {
                    const currentUri = selectedServer ? getBestPlexConnectionUri(selectedServer) : '';
                    const draftPlexConfig: PlexPhotoSyncConfig = {
                      serverClientIdentifier: selectedServer?.clientIdentifier,
                      serverName: selectedServer?.name,
                      serverUri: stripPlexToken(currentUri),
                      sectionKey: selectedSectionKey,
                      scopeMode: plexScopeMode,
                      folderKeys:
                        plexScopeMode === 'folders' ? Array.from(selectedPlexFolderKeys) : undefined,
                      dateFilter: plexScopeMode === 'timeline' ? plexDateFilter : undefined,
                    };
                    const isPlexCooldownBlocked =
                      Boolean(savedPlexConfig) &&
                      isSamePlexSyncConfig(draftPlexConfig, savedPlexConfig) &&
                      manualCooldownRemainingMs > 0;

                    return (
                      <button
                        onClick={handleLoadPlexPhotos}
                        disabled={
                          plexLoading ||
                          photoSections.length === 0 ||
                          (plexScopeMode === 'folders' && selectedPlexFolderKeys.size === 0) ||
                          isPlexCooldownBlocked
                        }
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {plexLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Fetching Photos...</span>
                          </>
                        ) : isPlexCooldownBlocked ? (
                          <>
                            <Clock className="w-4 h-4" />
                            <span>
                              Synced recently • Rescan available in{' '}
                              {formatCooldownRemaining(manualCooldownRemainingMs)}
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-4 h-4" />
                            <span>
                              {plexScopeMode === 'folders'
                                ? `Stream from ${selectedPlexFolderKeys.size} Selected Folder${
                                    selectedPlexFolderKeys.size !== 1 ? 's' : ''
                                  }`
                                : plexDateFilter === 'last3Years'
                                ? 'Stream Memories (Last 3 Years)'
                                : plexDateFilter === 'last5Years'
                                ? 'Stream Memories (Last 5 Years)'
                                : plexDateFilter === 'last1Year'
                                ? 'Stream Memories (Past Year)'
                                : sectionTotalPhotos && sectionTotalPhotos > 0
                                ? `Stream Entire Library (${sectionTotalPhotos.toLocaleString()} Photos)`
                                : 'Stream Entire Library (All Time)'}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOCAL PC / NAS FOLDER */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
                className="hidden"
              />

              {/* Active Configured Local Banner */}
              {effectiveSourceType === 'local' && displayCount > 0 && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="truncate">
                      <span className="text-gray-400">Current Library: </span>
                      <span className="text-white font-semibold">
                        {effectiveSourceLabel || 'Local Folders'}
                      </span>
                      <span className="text-blue-300 ml-1.5 font-mono font-bold">
                        ({displayCount.toLocaleString()} photos loaded)
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 shrink-0">
                    Active
                  </span>
                </div>
              )}

              {/* Scan Limit / Capacity Selector */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950/80 border border-gray-800 text-xs">
                <div>
                  <span className="font-semibold text-gray-200 block">Photo Scan Capacity</span>
                  <span className="text-[10px] text-gray-500">Max photos to scan across folders and subdirectories</span>
                </div>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {([1000, 5000, 10000, Infinity] as const).map((limit) => (
                    <button
                      key={String(limit)}
                      type="button"
                      onClick={() => setScanLimit(limit)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                        scanLimit === limit
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {isFinite(limit) ? (limit >= 1000 ? `${limit / 1000}k` : limit) : '∞ All'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-Display Local Storage Notice */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-amber-200/90 leading-relaxed">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <span>Local Device Storage Notice</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">This Screen Only</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80">
                    Folders from your PC or mapped NAS are stored in this browser&apos;s local storage. Due to browser security sandboxing, secondary wall displays, tablets, or phones syncing this dashboard cannot access this device&apos;s local files.
                  </p>
                  <p className="text-[11px] text-amber-300 font-medium pt-0.5">
                    💡 <button type="button" className="underline cursor-pointer hover:text-white inline font-bold" onClick={() => setActiveTab('plex')}>Connect Plex Media Server</button> (first tab) or Google Photos to seamlessly stream your NAS photos across all household screens.
                  </p>
                </div>
              </div>

              {subfolderInspection ? (
                <div className="space-y-3.5">
                  {/* Subfolder Picker Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSubfolderInspection(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                        title="Back to folders"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                          <span>Subfolders in &quot;{subfolderInspection.rootName}&quot;</span>
                        </h4>
                        <p className="text-[10px] text-gray-400">
                          {subfolderInspection.subfolders.length} subfolders detected. Choose which years/folders to include.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {selectedSubfolderNames.size} Selected
                    </span>
                  </div>

                  {/* Search & Quick Filter Presets */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={subfolderSearchQuery}
                        onChange={(e) => setSubfolderSearchQuery(e.target.value)}
                        placeholder="Filter subfolders (e.g. 2020)..."
                        className="w-full pl-8 pr-7 py-1.5 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      {subfolderSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setSubfolderSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs cursor-pointer"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Preset Action Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectRecentYears(5)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-[11px] font-semibold transition-all cursor-pointer"
                      >
                        <Calendar className="w-3 h-3 text-blue-400" />
                        <span>Last 5 Years</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectRecentYears(3)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 text-[11px] font-medium transition-all cursor-pointer"
                      >
                        <span>Last 3 Years</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSelectAllSubfolders}
                        className="px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 text-[11px] font-medium transition-all cursor-pointer"
                      >
                        Select All ({subfolderInspection.subfolders.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleDeselectAllSubfolders}
                        className="px-2 py-1 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-red-400 text-[11px] font-medium transition-all cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Scrollable Subfolder Checklist */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {subfolderInspection.hasDirectPhotos && (
                      <div
                        onClick={() => setIncludeRootPhotos(!includeRootPhotos)}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                          includeRootPhotos
                            ? 'bg-blue-500/10 border-blue-500/30 text-white'
                            : 'bg-gray-950/60 border-gray-800/80 text-gray-400 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {includeRootPhotos ? (
                            <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-600 shrink-0" />
                          )}
                          <span className="font-semibold">Direct Photos in &quot;{subfolderInspection.rootName}&quot;</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {subfolderInspection.directPhotosCount} photos
                        </span>
                      </div>
                    )}

                    {filteredSubfolders.map((sub) => {
                      const isSelected = selectedSubfolderNames.has(sub.name);
                      return (
                        <div
                          key={sub.name}
                          onClick={() => handleToggleSubfolder(sub.name)}
                          className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-blue-500/10 border-blue-500/30 text-white'
                              : 'bg-gray-950/60 border-gray-800/80 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-600 shrink-0" />
                            )}
                            <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-gray-500'}`} />
                            <span className="font-semibold truncate">{sub.name}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {sub.isYear && (
                              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                Year
                              </span>
                            )}
                            {sub.files && (
                              <span className="text-[10px] text-gray-500 font-mono">
                                {sub.files.length} items
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filteredSubfolders.length === 0 && (
                      <div className="text-center py-6 text-gray-500 text-xs">
                        No subfolders matching &quot;{subfolderSearchQuery}&quot;
                      </div>
                    )}
                  </div>

                  {/* Subfolder Picker Action Footer */}
                  <div className="pt-2 border-t border-gray-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSubfolderInspection(null)}
                      disabled={isScanning}
                      className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmSubfolderSelection}
                        disabled={isScanning || (selectedSubfolderNames.size === 0 && (!includeRootPhotos || !subfolderInspection.hasDirectPhotos))}
                        className="flex items-center gap-1.5 py-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Scanning Subfolders...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Import Selected ({selectedSubfolderNames.size})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedFolders.length === 0 ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Local PC or Mapped Network Drive (NAS)</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 leading-relaxed">
                      Select one or more folders from your computer or network share. Subfolders will be automatically scanned for photos.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      disabled={isScanning}
                      className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scanning Folder & Subfolders...</span>
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4" />
                          <span>Choose Photos Folder</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] text-gray-400 hover:text-blue-400 underline transition-colors cursor-pointer"
                    >
                      Browse via file browser fallback
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-gray-800">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">
                        Selected Folders ({selectedFolders.length})
                      </h4>
                      <p className="text-[11px] text-gray-400">
                        Total {totalSelectedPhotos.toLocaleString()} photos ready to display
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePickFolder}
                        disabled={isScanning}
                        className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Add Folder</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedFolders([])}
                        className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 transition-colors cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Folders List */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {selectedFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="p-2.5 rounded-xl bg-gray-950/80 border border-gray-800 flex items-center justify-between gap-3 group hover:border-gray-700 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                            <FolderOpen className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {folder.name}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {folder.photos.length.toLocaleString()} photos found
                            </div>
                          </div>
                        </div>

                        {/* Thumbnails preview row */}
                        <div className="flex items-center gap-1 shrink-0">
                          {folder.photos.slice(0, 3).map((photo) => (
                            <img
                              key={photo.id}
                              src={
                                photo.source === 'plex'
                                  ? addPlexToken(getOptimizedPhotoUrl(photo.url, 120), plexServerTokens)
                                  : getOptimizedPhotoUrl(photo.url, 120)
                              }
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded object-cover border border-white/10 bg-gray-800"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ))}
                          {folder.photos.length > 3 && (
                            <span className="text-[10px] font-mono text-gray-400 bg-gray-800 px-1 py-0.5 rounded">
                              +{folder.photos.length - 3}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFolder(folder.id)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                          title="Remove folder"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Additional Folder Bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      disabled={isScanning}
                      className="flex-1 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span>Scanning...</span>
                        </>
                      ) : (
                        <>
                          <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
                          <span>+ Add Another Folder</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 text-xs transition-all cursor-pointer"
                      title="Add folder via browser fallback"
                    >
                      📁 Fallback Browse
                    </button>
                  </div>

                  {/* Apply / Confirm Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleApplySelectedFolders}
                      disabled={totalSelectedPhotos === 0}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        Apply {selectedFolders.length} Folder{selectedFolders.length > 1 ? 's' : ''} ({totalSelectedPhotos.toLocaleString()} Photos)
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GOOGLE PHOTOS, DRIVE & WEB LINKS */}
          {activeTab === 'web' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">Google Photos Albums, Drive Folders & Web Images</h3>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Paste public <strong>Google Photos shared album links</strong> (<code className="text-blue-400">https://photos.app.goo.gl/...</code>), <strong>Google Drive shared folders</strong> (<code className="text-purple-400">drive.google.com/drive/folders/...</code>), direct Drive files, or web images (<code className="text-gray-300">.jpg, .png, .webp</code>), one per line:
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-300 bg-blue-950/40 border border-blue-800/40 px-2.5 py-1 rounded-lg">
                  <span className="shrink-0">⚡</span>
                  <span>Deep pagination active: large shared Google Photos albums and Google Drive folders are automatically resolved in full.</span>
                </div>
              </div>

              {/* Active Configured Album Banner */}
              {currentSourceLabel && (
                <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="text-gray-400">Currently Active: </span>
                        <span className="text-white font-semibold">{currentSourceLabel}</span>
                        {currentPhotoCount != null && currentPhotoCount > 0 && (
                          <span className="text-blue-300 ml-1.5 font-mono">
                            ({currentPhotoCount.toLocaleString()} photos)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyCurated}
                      className="text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg border border-red-500/30 transition-all cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                      title="Remove this source and reset back to default Curated Scenery"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove Source</span>
                    </button>
                  </div>
                  {initialWebUrls && (
                    <div className="bg-black/40 px-2 py-1.5 rounded text-[11px] font-mono text-blue-300 flex flex-col gap-1">
                      {initialWebUrls
                        .split(/[\r\n]+/)
                        .map((u) => u.trim())
                        .filter(Boolean)
                        .map((u, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <span className="truncate max-w-[420px]">🔗 {u}</span>
                            {i === 0 && webUrlsText.trim() !== initialWebUrls.trim() && (
                              <button
                                type="button"
                                onClick={() => setWebUrlsText(initialWebUrls)}
                                className="text-xs text-blue-400 hover:text-blue-200 underline shrink-0 ml-2 cursor-pointer"
                              >
                                Restore Link
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={webUrlsText}
                onChange={(e) => setWebUrlsText(e.target.value)}
                placeholder="https://photos.app.goo.gl/your-shared-album-link&#10;https://drive.google.com/drive/folders/your-folder-id&#10;https://drive.google.com/file/d/your-file-id&#10;https://images.unsplash.com/..."
                rows={5}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
              />

              {/* Live Detected Sources Feedback */}
              {detectedSources.length > 0 && (
                <div className="space-y-1.5 p-2.5 rounded-xl bg-gray-950/80 border border-gray-800">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Detected Sources ({detectedSources.length})
                    </span>
                    {detectedSources.length > 1 && (
                      <span className="text-[10px] text-emerald-300 font-medium bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        ✓ Will merge all {detectedSources.length} sources into 1 album
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {detectedSources.map((source, idx) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-800/80 text-xs text-gray-300 group hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 font-mono shadow-sm border ${
                              source.type === 'gphotos'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : source.type === 'gdrive_folder'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : source.type === 'gdrive_file'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            }`}
                          >
                            {source.type === 'gphotos'
                              ? 'Google Photos'
                              : source.type === 'gdrive_folder'
                              ? 'Google Drive'
                              : source.type === 'gdrive_file'
                              ? 'Drive File'
                              : 'Web Image'}
                          </span>
                          <span className="font-mono text-[11px] text-gray-400 truncate max-w-[340px]">
                            {source.url}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSourceLine(idx)}
                          className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                          title="Remove this link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const isWebUnchangedReload = Boolean(
                  initialWebUrls && initialWebUrls.trim() === webUrlsText.trim()
                );
                const isWebCooldownBlocked = isWebUnchangedReload && manualCooldownRemainingMs > 0;

                return (
                  <button
                    type="button"
                    onClick={handleApplyWebUrls}
                    disabled={isWebLoading || detectedSources.length === 0 || isWebCooldownBlocked}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isWebLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {detectedSources.length > 1
                            ? `Resolving & Merging ${detectedSources.length} Cloud Sources...`
                            : 'Resolving Google Photos Album & Images...'}
                        </span>
                      </>
                    ) : isWebCooldownBlocked ? (
                      <>
                        <Clock className="w-4 h-4" />
                        <span>
                          Synced recently • Reload available in{' '}
                          {formatCooldownRemaining(manualCooldownRemainingMs)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4" />
                        <span>
                          {detectedSources.length > 1
                            ? isWebUnchangedReload
                              ? `Reload & Sync All ${detectedSources.length} Sources`
                              : `Load & Merge All ${detectedSources.length} Sources`
                            : isWebUnchangedReload
                            ? `Reload & Sync ${detectedSources[0]?.label || 'Album'}`
                            : `Load ${detectedSources[0]?.label || 'Google Photos & Web'}`}
                        </span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          )}

          {/* TAB 4: CURATED PRESETS & THEMED CATEGORIES */}
          {activeTab === 'curated' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>Curated Ambient Scenery Packs</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Select a themed collection or shuffle all categories. No setup or accounts needed.
                  </p>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {CURATED_CATEGORIES.length} Categories
                </span>
              </div>

              {/* Category Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[46vh] overflow-y-auto pr-1">
                {CURATED_CATEGORIES.map((cat) => {
                  const Icon = CATEGORY_ICON_MAP[cat.icon] || Sparkles;
                  const isSelected = selectedCuratedCategoryId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCuratedCategoryId(cat.id)}
                      onDoubleClick={() => handleApplyCuratedCategory(cat.id)}
                      className={`relative rounded-xl overflow-hidden border p-3 flex flex-col justify-between transition-all cursor-pointer group text-left min-h-[105px] select-none ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/50 ring-1 ring-cyan-400/60 shadow-lg'
                          : 'border-gray-800 bg-gray-950/90 hover:border-gray-700 hover:bg-gray-900'
                      }`}
                    >
                      {/* Background Thumbnail with dark gradient overlay */}
                      <div
                        className="absolute inset-0 bg-cover bg-center opacity-30 group-hover:opacity-45 transition-opacity"
                        style={{ backgroundImage: `url(${cat.previewUrl})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/75 to-gray-950/40" />

                      {/* Card Header Content */}
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-1.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm ${
                              isSelected
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : 'bg-gray-900/80 text-gray-300 border-gray-700/60'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </div>

                        <div className="font-bold text-xs text-white leading-tight line-clamp-1">
                          {cat.name}
                        </div>
                        <div className="text-[10px] text-gray-400 line-clamp-2 mt-0.5 leading-tight">
                          {cat.description}
                        </div>
                      </div>

                      {/* Footer Badge / Count */}
                      <div className="relative z-10 mt-2 flex items-center justify-between text-[10px]">
                        <span className="font-mono text-cyan-300/90 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/20">
                          {cat.photos.length} photos
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyCuratedCategory(cat.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-white bg-cyan-600 hover:bg-cyan-500 px-2 py-0.5 rounded shadow cursor-pointer"
                        >
                          Use Now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Apply Selected Theme Button */}
              {(() => {
                const activeCat = getCuratedCategoryById(selectedCuratedCategoryId);
                return (
                  <button
                    type="button"
                    onClick={() => handleApplyCuratedCategory(selectedCuratedCategoryId)}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Apply {activeCat.name} ({activeCat.photos.length} Photos)
                    </span>
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        {/* Modal Footer with Common Library Toggle */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-950/70 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2.5 cursor-pointer select-none text-gray-300 hover:text-white">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="font-medium">
              {applyToAll
                ? 'Apply to all photo frames (Shared Board Library)'
                : 'Apply to this widget only (Tile-Specific Album)'}
            </span>
          </label>
          <span className="text-[10px] text-gray-500">
            {applyToAll ? 'Syncs across all frames' : 'Independent album'}
          </span>
        </div>
      </div>
    </div>
  );
};
