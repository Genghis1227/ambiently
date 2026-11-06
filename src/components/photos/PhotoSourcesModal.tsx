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
  getPlexPhotosFromSection,
  getBestPlexConnectionUri,
  type PlexPinResponse,
  type PlexServerResource,
  type PlexLibrarySection,
} from '../../services/plex';
import {
  CURATED_CATEGORIES,
  getCuratedCategoryById,
  pickLocalPhotoDirectory,
  parseFileListToPhotos,
  cachePhotosLocally,
  resolveWebAndCloudPhotoUrls,
  getOptimizedPhotoUrl,
  isGooglePhotosUrl,
  isGoogleDriveFolderUrl,
  parseGoogleDriveLink,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';

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
    applyToAll?: boolean
  ) => void;
  initialWebUrls?: string;
  currentSourceLabel?: string;
  currentSourceType?: 'plex' | 'local' | 'web' | 'curated';
  currentPhotoCount?: number;
  isCommonSource?: boolean;
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
  initialWebUrls = '',
  currentSourceLabel,
  currentSourceType,
  currentPhotoCount,
  isCommonSource,
}) => {
  const [activeTab, setActiveTab] = useState<'plex' | 'local' | 'web' | 'curated'>('plex');
  const [applyToAll, setApplyToAll] = useState<boolean>(isCommonSource ?? false);

  useEffect(() => {
    if (isCommonSource !== undefined) {
      setApplyToAll(isCommonSource);
    }
  }, [isCommonSource]);

  // Plex auth & server states
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const [pinData, setPinData] = useState<PlexPinResponse | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [servers, setServers] = useState<PlexServerResource[]>([]);
  const [selectedServer, setSelectedServer] = useState<PlexServerResource | null>(null);
  const [photoSections, setPhotoSections] = useState<PlexLibrarySection[]>([]);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('');
  const [plexLoading, setPlexLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Local NAS / PC multi-folder state
  const [selectedFolders, setSelectedFolders] = useState<SelectedFolderInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLimit, setScanLimit] = useState<number>(5000);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadPhotoSections = async (server: PlexServerResource, token: string) => {
    const uri = getBestPlexConnectionUri(server);
    if (!uri) {
      setStatusMessage("No reachable URI for this server.");
      return;
    }
    setPlexLoading(true);
    try {
      const sections = await getPlexPhotoLibraries(uri, server.accessToken || token);
      setPhotoSections(sections);
      if (sections.length > 0) {
        setSelectedSectionKey(sections[0].key);
      } else {
        setStatusMessage("No Photo libraries found on this Plex server.");
      }
    } catch (err: any) {
      setStatusMessage(`Error fetching photo sections: ${err.message}`);
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
        setSelectedServer(sList[0]);
        loadPhotoSections(sList[0], token);
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
    setStatusMessage('Plex disconnected.');
  };



  const handleLoadPlexPhotos = async () => {
    if (!selectedServer || !selectedSectionKey || !plexToken) return;
    const uri = getBestPlexConnectionUri(selectedServer);
    setPlexLoading(true);
    try {
      const photos = await getPlexPhotosFromSection(
        uri,
        selectedServer.accessToken || plexToken,
        selectedSectionKey
      );
      if (photos.length > 0) {
        onPhotosLoaded(photos, `Plex (${selectedServer.name})`, undefined, 'plex', applyToAll);
        cachePhotosLocally(photos);
        setStatusMessage(`Successfully loaded ${photos.length} photos from Plex!`);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMessage('No photos found in this library section.');
      }
    } catch (err: any) {
      setStatusMessage(`Error streaming photos: ${err.message}`);
    } finally {
      setPlexLoading(false);
    }
  };

  // Local Multi-Folder Pickers & Handlers
  const handlePickFolder = async () => {
    setIsScanning(true);
    setStatusMessage(`Scanning folder and subfolders (up to ${scanLimit.toLocaleString()} photos)...`);
    try {
      const res = await pickLocalPhotoDirectory(scanLimit, (count, dirName) => {
        setStatusMessage(`Scanning "${dirName}": ${count} photos found...`);
      });
      if (res.success && res.photos.length > 0) {
        const folderName = res.folderName || 'Selected Folder';
        setSelectedFolders((prev) => [
          ...prev,
          {
            id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: folderName,
            photos: res.photos,
          },
        ]);
        setStatusMessage(`Added "${folderName}" with ${res.photos.length} photos.`);
      } else if (res.error) {
        setStatusMessage(res.error);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsScanning(true);
    setStatusMessage('Reading folder files...');
    try {
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
        setStatusMessage(`No photos (.jpg, .png, .webp, .heic) found in "${folderName}".`);
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
    setStatusMessage('Resolving Google Photos album & web links (retrieving full library)...');
    try {
      const res = await resolveWebAndCloudPhotoUrls(webUrlsText);
      if (res.photos.length > 0) {
        onPhotosLoaded(res.photos, res.sourceTitle || 'Google Photos & Web', webUrlsText, 'web', applyToAll);
        cachePhotosLocally(res.photos);
        const countText =
          res.totalAlbumCount && res.totalAlbumCount > res.photos.length
            ? `Loaded ${res.photos.length} of ${res.totalAlbumCount} photos`
            : `Loaded ${res.photos.length} photos`;
        setStatusMessage(`${countText} from ${res.sourceTitle}!`);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMessage(res.error || 'Please enter at least one valid Google Photos, Google Drive, or image link.');
      }
    } finally {
      setIsWebLoading(false);
    }
  };

  // Curated Preset
  const handleApplyCuratedCategory = (catId?: string) => {
    const targetId = catId || selectedCuratedCategoryId;
    const cat = getCuratedCategoryById(targetId);
    setSelectedCuratedCategoryId(targetId);
    const label = targetId === 'all' ? 'Curated Ambient' : `Curated (${cat.name})`;
    onPhotosLoaded(cat.photos, label, undefined, 'curated', applyToAll);
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
  }, [isOpen, initialWebUrls, currentSourceType]);

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
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {isCommonSource ? 'Common Photo Library' : 'Photo Frame & Media Sources'}
                </h2>
                {isCommonSource && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Shared Board Library
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

        {/* Source Navigation Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-950/40 px-2 pt-2 gap-1 overflow-x-auto">
          {[
            { id: 'plex', label: 'Plex Server', icon: Tv },
            { id: 'local', label: 'Local Folder', icon: FolderOpen },
            { id: 'web', label: 'Google Photos & Web', icon: Globe },
            { id: 'curated', label: 'Curated Scenery', icon: Cloud },
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
                className={`flex items-center gap-2 py-2 px-3 text-xs font-semibold rounded-t-lg transition-all ${
                  isActive
                    ? 'bg-gray-900 text-blue-400 border-t-2 border-blue-500 shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
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
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-300">Photo Library</label>
                      <select
                        value={selectedSectionKey}
                        onChange={(e) => setSelectedSectionKey(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {photoSections.map((sec) => (
                          <option key={sec.key} value={sec.key}>
                            📷 {sec.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic p-2 bg-gray-950 rounded-lg">
                      {plexLoading
                        ? 'Scanning for photo libraries...'
                        : 'No Photo libraries detected on this server.'}
                    </div>
                  )}

                  <button
                    onClick={handleLoadPlexPhotos}
                    disabled={plexLoading || photoSections.length === 0}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {plexLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Fetching Photos...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>Stream from Selected Library</span>
                      </>
                    )}
                  </button>
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

              {/* Scan Limit / Capacity Selector */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-950/80 border border-gray-800 text-xs">
                <div>
                  <span className="font-semibold text-gray-200 block">Photo Scan Capacity</span>
                  <span className="text-[10px] text-gray-500">Max photos to scan across folders and subdirectories</span>
                </div>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {([1000, 2500, 5000, 10000] as const).map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setScanLimit(limit)}
                      className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition-all cursor-pointer ${
                        scanLimit === limit
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {limit >= 1000 ? `${limit / 1000}k` : limit}
                    </button>
                  ))}
                </div>
              </div>

              {selectedFolders.length === 0 ? (
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
                              src={getOptimizedPhotoUrl(photo.url, 120)}
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

              <button
                type="button"
                onClick={handleApplyWebUrls}
                disabled={isWebLoading || detectedSources.length === 0}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
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
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>
                      {detectedSources.length > 1
                        ? initialWebUrls && initialWebUrls.trim() === webUrlsText.trim()
                          ? `Reload & Sync All ${detectedSources.length} Sources`
                          : `Load & Merge All ${detectedSources.length} Sources`
                        : initialWebUrls && initialWebUrls.trim() === webUrlsText.trim()
                        ? `Reload & Sync ${detectedSources[0]?.label || 'Album'}`
                        : `Load ${detectedSources[0]?.label || 'Google Photos & Web'}`}
                    </span>
                  </>
                )}
              </button>
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
          {isCommonSource ? (
            <div className="flex items-center gap-2 text-blue-400">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Updating Shared Board Library (applies to all shared photo frames)</span>
            </div>
          ) : (
            <label className="flex items-center gap-2.5 cursor-pointer select-none text-gray-300 hover:text-white">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-medium">
                Set as Common Library (apply this album to all photo widgets on your boards)
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
};
