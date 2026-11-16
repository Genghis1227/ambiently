import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Home,
  Lock,
  MapPin,
  Phone,
  Shield,
  ShieldAlert,
  Wifi,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  WifiCardDisplayView,
  WifiLocalVaultCredentials,
  WifiQrWidgetConfig,
} from '../../types/phase2Widgets';
import {
  buildWifiQrPayload,
  loadWifiCredentialsFromVault,
  WIFI_VAULT_UPDATED_EVENT,
} from '../../utils/wifiQr';

interface WifiQrWidgetProps {
  widgetId: string;
  title?: string;
  config?: WifiQrWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const WifiQrWidget: React.FC<WifiQrWidgetProps> = ({
  widgetId,
  title = 'Guest Wi-Fi & House-Sitter',
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [vaultCreds, setVaultCreds] = useState<WifiLocalVaultCredentials | null>(null);
  const [isPasswordRevealed, setIsPasswordRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<'password' | 'address' | null>(null);
  const [localViewOverride, setLocalViewOverride] = useState<WifiCardDisplayView | null>(null);

  const ssid = vaultCreds?.ssid || '';
  const effectivePassword = vaultCreds?.password || '';
  const security = vaultCreds?.security || 'WPA';
  const hiddenNetwork = Boolean(vaultCreds?.hiddenNetwork);
  const autoHideSec = Math.max(5, Math.min(300, config?.autoHidePasswordSec ?? 30));

  const rawEmergencyContacts = config?.emergencyContacts;
  const contacts = useMemo(
    () => (Array.isArray(rawEmergencyContacts) ? rawEmergencyContacts : []),
    [rawEmergencyContacts]
  );
  const homeAddress = config?.homeAddress?.trim() || '';
  const sitterNotes = config?.sitterNotes?.trim() || '';
  const hasSitterContent = Boolean(homeAddress || contacts.length > 0 || sitterNotes);

  // Observe container dimensions to auto-enable crisp side-by-side split on wide tiles
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load device-local Wi-Fi credentials strictly from db.vault (never synced to cloud)
  useEffect(() => {
    let cancelled = false;
    const refreshVault = () => {
      void loadWifiCredentialsFromVault(widgetId).then((creds) => {
        if (!cancelled) setVaultCreds(creds);
      });
    };
    refreshVault();

    const handleVaultEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ widgetId?: string }>).detail;
      if (!detail?.widgetId || detail.widgetId === widgetId) {
        refreshVault();
      }
    };

    window.addEventListener(WIFI_VAULT_UPDATED_EVENT, handleVaultEvent);
    return () => {
      cancelled = true;
      window.removeEventListener(WIFI_VAULT_UPDATED_EVENT, handleVaultEvent);
    };
  }, [widgetId]);

  // Auto-hide revealed Wi-Fi password after configurable timeout
  useEffect(() => {
    if (!isPasswordRevealed) return;
    const timer = window.setTimeout(() => {
      setIsPasswordRevealed(false);
    }, autoHideSec * 1000);
    return () => window.clearTimeout(timer);
  }, [isPasswordRevealed, autoHideSec]);

  useEffect(() => {
    if (!copiedField) return;
    const timer = window.setTimeout(() => setCopiedField(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedField]);

  const canRenderQr = Boolean(ssid);

  const qrPayload = useMemo(
    () =>
      canRenderQr
        ? buildWifiQrPayload({
            ssid,
            password: effectivePassword,
            security,
            hiddenNetwork,
          })
        : '',
    [canRenderQr, ssid, effectivePassword, security, hiddenNetwork]
  );

  const requestedView: WifiCardDisplayView = localViewOverride || config?.activeView || 'wifi';
  const showSplit =
    hasSitterContent &&
    (requestedView === 'split' || (containerWidth >= 500 && requestedView !== 'sitter' && requestedView !== 'wifi'));
  const showWifiPanel = showSplit || requestedView === 'wifi' || requestedView === 'split';
  const showSitterPanel = showSplit || requestedView === 'sitter';

  const qrSize = showSplit
    ? Math.max(96, Math.min(132, Math.round(containerWidth * 0.22)))
    : Math.max(116, Math.min(168, containerWidth > 0 ? Math.round(containerWidth * 0.42) : 136));

  const handleViewSwitch = (view: WifiCardDisplayView) => {
    setLocalViewOverride(view);
    if (onUpdateConfig) {
      onUpdateConfig({ activeView: view });
    }
  };

  const handleCopy = async (text: string, field: 'password' | 'address') => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedField(field);
    } catch {
      // Ignore clipboard failures on non-HTTPS previews
    }
  };

  const stopDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const stickerShadow =
    transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const cardBg = transparentBg
    ? isLight
      ? 'bg-white/60 border-slate-300/60'
      : 'bg-gray-950/45 border-gray-800/60'
    : isLight
      ? 'bg-slate-100/90 border-slate-200/90'
      : 'bg-gray-950/60 border-gray-800/80';

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col select-none p-1 overflow-hidden ${stickerShadow}`}
    >
      {/* Header with pr-20 clearance for Corkboard top-right buttons */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-2 pr-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {showSitterPanel && !showWifiPanel ? (
            <Home className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
          ) : (
            <Wifi className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          )}
          <span
            className={`text-xs font-bold tracking-wide truncate ${
              isLight ? 'text-slate-800' : 'text-gray-100'
            }`}
          >
            {title}
          </span>
        </div>

        <div
          data-no-drag="true"
          onPointerDown={stopDrag}
          className={`inline-flex rounded-lg p-0.5 border text-[10px] font-semibold shrink-0 ${
            isLight
              ? 'bg-slate-200/80 border-slate-300 text-slate-600'
              : 'bg-gray-900/90 border-gray-800 text-gray-400'
          }`}
        >
          <button
            type="button"
            onClick={() => handleViewSwitch('wifi')}
            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              requestedView === 'wifi'
                ? 'bg-cyan-600 text-white shadow-xs'
                : isLight
                  ? 'hover:text-slate-900'
                  : 'hover:text-white'
            }`}
          >
            Wi-Fi
          </button>
          <button
            type="button"
            onClick={() => handleViewSwitch('sitter')}
            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              requestedView === 'sitter'
                ? 'bg-amber-600 text-white shadow-xs'
                : isLight
                  ? 'hover:text-slate-900'
                  : 'hover:text-white'
            }`}
          >
            House-Sitter
          </button>
          {hasSitterContent && containerWidth >= 420 && (
            <button
              type="button"
              onClick={() => handleViewSwitch('split')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                requestedView === 'split'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : isLight
                    ? 'hover:text-slate-900'
                    : 'hover:text-white'
              }`}
            >
              Both
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${
          showSplit ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch' : 'flex flex-col'
        }`}
      >
        {/* WIFI QR PANEL */}
        {showWifiPanel && (
          <div
            className={`flex-1 flex flex-col items-center justify-center rounded-2xl border p-3 gap-2.5 ${cardBg}`}
          >
            {!ssid ? (
              <div className="text-center space-y-2 max-w-[240px]">
                <Lock className="w-7 h-7 mx-auto text-emerald-400" />
                <p
                  className={`text-xs font-bold ${
                    isLight ? 'text-slate-800' : 'text-gray-100'
                  }`}
                >
                  Guest Wi-Fi Not Set on This Device
                </p>
                <p className={`text-[11px] leading-snug ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                  Wi-Fi QR credentials stay strictly in this screen’s local vault and never sync to the cloud. Open Tile Settings (gear icon) on this device to enter your network details.
                </p>
              </div>
            ) : (
              <>
                {/* Crisp white quiet-zone mat so dark/OLED themes never break phone camera contrast */}
                <div className="bg-white p-2.5 rounded-2xl shadow-md border border-slate-200/80 shrink-0">
                  <QRCodeSVG
                    value={qrPayload}
                    size={qrSize}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#090d16"
                    title={`Wi-Fi QR code for ${ssid}`}
                  />
                </div>

                <div className="w-full max-w-[260px] space-y-1.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <span
                      className={`text-xs font-bold truncate max-w-[180px] ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {ssid}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        security === 'nopass'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isLight
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'bg-cyan-500/20 text-cyan-300'
                      }`}
                    >
                      {security === 'nopass' ? 'Open' : security}
                    </span>
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      title="Stored only in this device's local db.vault — never synced to the cloud"
                    >
                      <Shield className="w-2.5 h-2.5" />
                      Local Only
                    </span>
                  </div>

                  {security !== 'nopass' && effectivePassword && (
                    <div
                      data-no-drag="true"
                      onPointerDown={stopDrag}
                      className={`flex items-center justify-between gap-1.5 rounded-xl px-2.5 py-1.5 border text-xs ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-gray-900/90 border-gray-800 text-gray-200'
                      }`}
                    >
                      <span className="font-mono text-[11px] truncate select-text">
                        {isPasswordRevealed ? effectivePassword : '••••••••••••'}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsPasswordRevealed((v) => !v)}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            isLight
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-gray-800 text-gray-400 hover:text-white'
                          }`}
                          title={
                            isPasswordRevealed
                              ? 'Hide password'
                              : `Reveal password (auto-hides in ${autoHideSec}s)`
                          }
                        >
                          {isPasswordRevealed ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopy(effectivePassword, 'password')}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            isLight
                              ? 'hover:bg-slate-100 text-slate-600'
                              : 'hover:bg-gray-800 text-gray-400 hover:text-white'
                          }`}
                          title="Copy Wi-Fi password"
                        >
                          {copiedField === 'password' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    Point your phone camera at the QR code to join
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* HOUSE-SITTER / BABYSITTER PANEL */}
        {showSitterPanel && (
          <div className={`flex-1 flex flex-col rounded-2xl border p-3 gap-2.5 overflow-y-auto ${cardBg}`}>
            {!hasSitterContent ? (
              <div className="m-auto text-center space-y-1.5 max-w-[240px]">
                <ShieldAlert className="w-7 h-7 mx-auto text-amber-400 opacity-75" />
                <p
                  className={`text-xs font-bold ${
                    isLight ? 'text-slate-800' : 'text-gray-100'
                  }`}
                >
                  House-Sitter Info Empty
                </p>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                  Add your street address, emergency contacts, vet info, or gate/alarm notes in Tile Settings.
                </p>
              </div>
            ) : (
              <>
                {homeAddress && (
                  <div
                    data-no-drag="true"
                    onPointerDown={stopDrag}
                    className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 border ${
                      isLight
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase tracking-wider font-bold opacity-75">
                          Home Street Address
                        </div>
                        <div className="text-xs font-semibold break-words select-text">
                          {homeAddress}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopy(homeAddress, 'address')}
                      className="p-1 rounded-md opacity-75 hover:opacity-100 cursor-pointer shrink-0"
                      title="Copy address"
                    >
                      {copiedField === 'address' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {contacts.length > 0 && (
                  <div className="space-y-1.5">
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isLight ? 'text-slate-500' : 'text-gray-400'
                      }`}
                    >
                      Emergency Contacts
                    </div>
                    <div className="space-y-1">
                      {contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 border ${
                            isLight
                              ? 'bg-white border-slate-200 text-slate-800'
                              : 'bg-gray-900/80 border-gray-800 text-gray-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isLight
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-blue-500/20 text-blue-300'
                                }`}
                              >
                                {contact.roleLabel || 'Contact'}
                              </span>
                              <span className="text-xs font-semibold truncate">
                                {contact.name}
                              </span>
                            </div>
                          </div>
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                              data-no-drag="true"
                              onPointerDown={stopDrag}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400 hover:underline shrink-0"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{contact.phone}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sitterNotes && (
                  <div
                    className={`rounded-xl px-2.5 py-2 border text-xs leading-relaxed whitespace-pre-wrap select-text ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-700'
                        : 'bg-gray-900/70 border-gray-800 text-gray-200'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                        isLight ? 'text-slate-500' : 'text-gray-400'
                      }`}
                    >
                      House, Pet & Alarm Notes
                    </div>
                    {sitterNotes}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
