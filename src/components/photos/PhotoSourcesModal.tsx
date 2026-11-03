import React, { useState, useEffect } from 'react';
import {
  X,
  FolderOpen,
  Cloud,
  CheckCircle2,
  Tv,
  Globe,
  RefreshCw,
  ExternalLink,
  Sliders,
  Image as ImageIcon,
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
  cachePhotosLocally,
  parseWebPhotoUrls,
  type PhotoItem,
  type PhotoDisplayStyle,
} from '../../services/photos';

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

  // Web / Google Drive state
  const [webUrlsText, setWebUrlsText] = useState('');

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

  // Local Folder Picker
  const handlePickFolder = async () => {
    const res = await pickLocalPhotoDirectory();
    if (res.success && res.photos.length > 0) {
      onPhotosLoaded(res.photos, 'Local Folder');
      cachePhotosLocally(res.photos);
      setStatusMessage(`Loaded ${res.photos.length} photos from local folder.`);
      setTimeout(() => onClose(), 1200);
    } else if (res.error) {
      setStatusMessage(res.error);
    }
  };

  // Web / Google Drive URLs
  const handleApplyWebUrls = () => {
    const items = parseWebPhotoUrls(webUrlsText);
    if (items.length > 0) {
      onPhotosLoaded(items, 'Web & Cloud');
      cachePhotosLocally(items);
      setStatusMessage(`Added ${items.length} web/Google Drive photos!`);
      setTimeout(() => onClose(), 1200);
    } else {
      setStatusMessage('Please enter at least one valid image or Google Drive link.');
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
            { id: 'web', label: 'Google Drive & Web', icon: Globe },
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
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Local PC or Mapped Network Drive</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                  Select any folder of photos on your computer or mapped NAS drive. Images are safely cached for offline slideshow playback.
                </p>
              </div>

              <button
                onClick={handlePickFolder}
                className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Choose Photos Folder</span>
              </button>
            </div>
          )}

          {/* TAB 3: GOOGLE DRIVE & WEB LINKS */}
          {activeTab === 'web' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-white">Google Drive & Web Image URLs</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Paste public Google Drive image share links, public album URLs, or direct image links (`.jpg`, `.png`, `.webp`), one per line:
                </p>
              </div>

              <textarea
                value={webUrlsText}
                onChange={(e) => setWebUrlsText(e.target.value)}
                placeholder="https://drive.google.com/file/d/...&#10;https://images.unsplash.com/...&#10;https://yourdomain.com/photo.jpg"
                rows={5}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-blue-500 placeholder:text-gray-600"
              />

              <button
                onClick={handleApplyWebUrls}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" />
                <span>Load Web & Drive Photos</span>
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
