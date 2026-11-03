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
  Sliders,
  Image as ImageIcon,
  Loader2,
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
  CURATED_AMBIENT_PHOTOS,
  pickLocalPhotoDirectory,
  parseFileListToPhotos,
  cachePhotosLocally,
  resolveWebAndCloudPhotoUrls,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';

interface SelectedFolderInfo {
  id: string;
  name: string;
  photos: PhotoItem[];
}

interface PhotoSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStyle: PhotoDisplayStyle;
  onStyleChange: (style: PhotoDisplayStyle) => void;
  rotationIntervalSec: number;
  onRotationIntervalChange: (sec: number) => void;
  onPhotosLoaded: (photos: PhotoItem[], sourceName: string) => void;
  polaroidCount?: number;
  onPolaroidCountChange?: (count: number) => void;
  polaroidSizeMode?: 'mixed' | 'uniform' | 'small' | 'large';
  onPolaroidSizeModeChange?: (mode: 'mixed' | 'uniform' | 'small' | 'large') => void;
}

export const PhotoSourcesModal: React.FC<PhotoSourcesModalProps> = ({
  isOpen,
  onClose,
  currentStyle,
  onStyleChange,
  rotationIntervalSec,
  onRotationIntervalChange,
  onPhotosLoaded,
  polaroidCount = 12,
  onPolaroidCountChange,
  polaroidSizeMode = 'mixed',
  onPolaroidSizeModeChange,
}) => {
  const [activeTab, setActiveTab] = useState<'plex' | 'local' | 'web' | 'curated'>('plex');

  // Plex auth & server states
  const [plexToken, setPlexToken] = useState<string | null>(null);
  const [pinData, setPinData] = useState<PlexPinResponse | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);
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
  const [webUrlsText, setWebUrlsText] = useState('');
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
        onPhotosLoaded(photos, `Plex (${selectedServer.name})`);
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

    onPhotosLoaded(allPhotos, sourceLabel);
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
        onPhotosLoaded(res.photos, res.sourceTitle || 'Google Photos & Web');
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
  const handleApplyCurated = () => {
    onPhotosLoaded(CURATED_AMBIENT_PHOTOS, 'Curated Ambient');
    cachePhotosLocally(CURATED_AMBIENT_PHOTOS);
    setStatusMessage('Curated ambient scenery loaded.');
    setTimeout(() => onClose(), 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Photo Frame & Media Sources</h2>
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
                    <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-4 max-w-md mx-auto">
                      <div className="text-xs text-gray-300">
                        Scan the QR code or enter code at{' '}
                        <a
                          href="https://plex.tv/link"
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-400 underline font-mono"
                        >
                          plex.tv/link
                        </a>
                      </div>

                      {/* QR Code and 4-Letter Code */}
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-2">
                        <div className="p-2 bg-white rounded-xl shadow-md">
                          <QRCodeSVG
                            value="https://plex.tv/link"
                            size={110}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="M"
                          />
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-gray-500 uppercase font-semibold">
                            4-Character PIN Code
                          </div>
                          <div className="text-3xl font-mono font-black text-amber-400 tracking-widest my-1 bg-amber-500/10 px-4 py-1.5 rounded-lg border border-amber-500/30">
                            {pinData.code}
                          </div>
                          <a
                            href={pinData.authUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline mt-1"
                          >
                            <span>Open Plex Login</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                        <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                        <span>Waiting for authorization on plex.tv...</span>
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
                              src={photo.url}
                              alt=""
                              className="w-7 h-7 rounded object-cover border border-white/10 bg-gray-800"
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

              <textarea
                value={webUrlsText}
                onChange={(e) => setWebUrlsText(e.target.value)}
                placeholder="https://photos.app.goo.gl/your-shared-album-link&#10;https://drive.google.com/drive/folders/your-folder-id&#10;https://drive.google.com/file/d/your-file-id&#10;https://images.unsplash.com/..."
                rows={5}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
              />

              <button
                type="button"
                onClick={handleApplyWebUrls}
                disabled={isWebLoading || !webUrlsText.trim()}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isWebLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resolving Google Photos Album & Images...</span>
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    <span>Load Google Photos & Web Images</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 4: CURATED PRESETS */}
          {activeTab === 'curated' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Curated Ambient Photography</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                  High-definition curated landscapes, mountain vistas, star fields, and ambient nature photos by verified photographers.
                </p>
              </div>

              <button
                onClick={handleApplyCurated}
                className="py-2.5 px-6 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Use Curated Scenery</span>
              </button>
            </div>
          )}

          {/* Slideshow Display Style & Speed Controls */}
          <div className="pt-4 border-t border-gray-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>Display Style & Rotation Speed</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Presentation Style</label>
                <div className="grid grid-cols-2 gap-1 bg-gray-950 p-1 rounded-lg border border-gray-800">
                  {(['ken_burns', 'mosaic', 'polaroid', 'filmstrip'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => onStyleChange(s)}
                      className={`py-1 text-[10px] font-semibold rounded uppercase tracking-wider transition-all ${
                        currentStyle === s
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {s === 'ken_burns' ? 'Ken Burns' : s === 'polaroid' ? 'Polaroids' : s}
                    </button>
                  ))}
                </div>
              </div>

            {currentStyle === 'polaroid' && onPolaroidCountChange && (
              <div className="col-span-2 pt-2 border-t border-gray-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400">Polaroid Count / Density</label>
                  <div className="flex items-center gap-1">
                    {([6, 12, 18, 24, 32] as const).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => onPolaroidCountChange(cnt)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          polaroidCount === cnt
                            ? 'bg-blue-600 text-white shadow'
                            : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {cnt === 32 ? 'Fill' : cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {onPolaroidSizeModeChange && (
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-gray-400">Card Sizes</label>
                    <div className="flex items-center gap-1">
                      {[
                        { id: 'mixed', label: 'Random / Mixed Sizes' },
                        { id: 'uniform', label: 'Uniform Size' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onPolaroidSizeModeChange(m.id as any)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                            polaroidSizeMode === m.id
                              ? 'bg-purple-600/30 border border-purple-500 text-purple-200'
                              : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Photo Rotation Speed</label>
                <select
                  value={rotationIntervalSec}
                  onChange={(e) => onRotationIntervalChange(Number(e.target.value))}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={5}>Every 5 seconds</option>
                  <option value={10}>Every 10 seconds</option>
                  <option value={15}>Every 15 seconds (Default)</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 1 minute</option>
                  <option value={300}>Every 5 minutes</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
