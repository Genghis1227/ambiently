import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Lock,
  Shield,
  FolderSync,
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
  Repeat,
  Compass,
  AlertTriangle,
  Trash2,
  Download,
  Upload,
  ChevronUp,
  ChevronDown,
  Edit2,
  Plus,
  Moon,
  Sun,
  QrCode,
  Eye,
  EyeOff,
  SunDim,
  Home,
  Grid,
  ImageIcon,
  FolderOpen,
  Sliders,
  Settings,
  MousePointer,
  KeyRound,
  Mail,
  ArrowLeft,
  Check,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { useUpdateChecker } from '../../services/updateChecker';
import { db } from '../../services/db';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  openLocalFileBinding,
  reconnectStoredFile,
  disconnectLocalFile,
  downloadBackupFile,
  parseAndValidateBackup,
  restoreBackupToDatabase,
  useFileSync,
} from '../../services/fileSync';
import {
  getCurrentUser,
  onAuthStateChange,
  sendMagicLink,
  verifyOtpCode,
  signOutSupabase,
  pushToCloud,
  pullFromCloud,
} from '../../services/supabase';
import { APP_VERSION } from '../../data/changelog';
import { CANVAS_ICONS } from '../../data/canvasIcons';
import { CANVAS_THEMES } from '../../data/canvasThemes';
import { MAX_CANVASES } from '../../types/dashboard';
import {
  CURATED_WALLPAPER_PRESETS,
  processUploadedWallpaper,
} from '../../utils/imageUpload';
import type { CanvasBackgroundTheme } from '../../types/dashboard';
import { CreateCanvasModal } from '../dock/CreateCanvasModal';
import { ChangelogModal } from '../changelog/ChangelogModal';
import { SupportPanel } from './SupportPanel';
import { ShareBoardModal } from './ShareBoardModal';

const PhotoSourcesModal = React.lazy(() =>
  import('../photos/PhotoSourcesModal').then((m) => ({ default: m.PhotoSourcesModal }))
);

import type { User } from '@supabase/supabase-js';

export type SettingsTabId = 'boards' | 'display' | 'photos' | 'sync' | 'system';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = 'boards' }) => {
  const {
    settings,
    tabs,
    widgets,
    notes,
    setDockPosition,
    setDockHidden,
    setSnapToGrid,
    setCarouselEnabled,
    setCarouselDuration,
    applyCommonPhotosToAllWidgets,
    updateSettings,
    setPinLock,
    saveLocalBackupImmediate,
    addTab,
    updateTab,
    setHomeTab,
    deleteTab,
    reorderTabs,
  } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const fileSync = useFileSync();

  const [pinInput, setPinInput] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinDisabledMessage, setPinDisabledMessage] = useState('');
  const [resetPinOnRestore, setResetPinOnRestore] = useState(true);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isCommonPhotoModalOpen, setIsCommonPhotoModalOpen] = useState(false);
  const { isUpdateAvailable, latestVersion, isChecking, lastChecked, checkForUpdates, applyUpdate } = useUpdateChecker();
  const [checkFeedback, setCheckFeedback] = useState<string>('');

  // Supabase cloud state
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [authStep, setAuthStep] = useState<'email' | 'otp'>('email');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const wallpaperUploadRef = useRef<HTMLInputElement>(null);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);

  const [isCreateCanvasOpen, setIsCreateCanvasOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTabName, setEditTabName] = useState('');
  const [editTabIcon, setEditTabIcon] = useState('Pin');
  const [editTabTheme, setEditTabTheme] = useState<CanvasBackgroundTheme>('midnight_dots');
  const [editTabWallpaperUrl, setEditTabWallpaperUrl] = useState('');
  const [editTabDimLevel, setEditTabDimLevel] = useState<number>(45);
  const [editTabHideNotes, setEditTabHideNotes] = useState<boolean>(false);

  const handleMoveTab = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tabs.length) return;
    const newTabs = [...tabs];
    const [moved] = newTabs.splice(index, 1);
    newTabs.splice(targetIndex, 0, moved);
    await reorderTabs(newTabs.map((t) => t.id));
  };

  const handleEditWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingWallpaper(true);
    try {
      const dataUrl = await processUploadedWallpaper(file);
      setEditTabWallpaperUrl(dataUrl);
      setEditTabTheme('custom');
    } catch (err) {
      console.error('Failed to process wallpaper:', err);
    } finally {
      setIsUploadingWallpaper(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      getCurrentUser().then(setUser);
    }
    const unsubscribe = onAuthStateChange((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthMessage('');
      }
    });
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFactoryReset = async () => {
    setIsResetting(true);
    try {
      await db.delete();
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = window.location.origin + window.location.pathname;
    } catch (err) {
      console.error('Factory reset error:', err);
      window.location.reload();
    }
  };

  const handleExportBackup = () => {
    // If PIN protection is not active, guarantee no lingering hash or locks in export
    const sanitizedSettings = {
      ...settings,
      pinHash: settings.pinLockEnabled ? settings.pinHash : null,
      lockCanvasEditing: settings.pinLockEnabled ? settings.lockCanvasEditing : false,
      lockFullscreenKiosk: settings.pinLockEnabled ? settings.lockFullscreenKiosk : false,
      lockSettingsAccess: settings.pinLockEnabled ? settings.lockSettingsAccess : false,
    };
    downloadBackupFile(sanitizedSettings, tabs, widgets, notes);
    setBackupStatus('Backup file downloaded.');
    setTimeout(() => setBackupStatus(''), 3000);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupStatus('Validating backup...');
    const validation = await parseAndValidateBackup(file);
    if (!validation.success || !validation.data) {
      setBackupStatus(validation.error || 'Invalid backup file.');
      return;
    }
    const res = await restoreBackupToDatabase(validation.data, { clearPinLock: resetPinOnRestore });
    if (res.success) {
      setBackupStatus('Restored! Reloading...');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      setBackupStatus(res.error || 'Failed to restore.');
    }
  };

  const handleSavePin = async () => {
    if (pinInput.length === 4) {
      await setPinLock(pinInput);
      setPinSuccess(true);
      setPinDisabledMessage('');
      setTimeout(() => setPinSuccess(false), 2000);
      setPinInput('');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  };

  const handleDisablePin = async () => {
    await setPinLock(null);
    setPinDisabledMessage('Parent PIN and all kiosk restrictions disabled.');
    setTimeout(() => setPinDisabledMessage(''), 3500);
  };

  const handleBindLocalFile = async () => {
    if (fileSync.status === 'needs_permission') {
      const res = await reconnectStoredFile();
      if (res.success) {
        await saveLocalBackupImmediate();
      }
    } else {
      const res = await openLocalFileBinding();
      if (res.success) {
        await saveLocalBackupImmediate();
      }
    }
  };

  const handleSendMagicLink = async () => {
    if (!emailInput.trim()) return;
    setIsSendingCode(true);
    setAuthMessage('Sending login code and link...');
    const res = await sendMagicLink(emailInput.trim());
    setIsSendingCode(false);
    if (res.success) {
      setAuthStep('otp');
      setOtpInput('');
      setAuthMessage('Login code sent! Enter the verification code (6 to 8 digits) from your email below, or click the email link.');
    } else {
      setAuthMessage(res.error || 'Failed to send login code');
    }
  };

  const handleVerifyOtp = async () => {
    const cleanToken = otpInput.replace(/\D/g, '').trim();
    if (!cleanToken || cleanToken.length < 6 || cleanToken.length > 10) {
      setAuthMessage('Please enter the complete verification code from your email (6 to 8 digits).');
      return;
    }
    setIsVerifyingOtp(true);
    setAuthMessage('Verifying code...');
    const res = await verifyOtpCode(emailInput.trim(), cleanToken);
    setIsVerifyingOtp(false);
    if (res.success) {
      const u = await getCurrentUser();
      setUser(u);
      setAuthStep('email');
      setOtpInput('');
      setAuthMessage('Successfully signed in! Your dashboard is now connected to Cloud Sync.');
    } else {
      setAuthMessage(res.error || 'Invalid or expired code. Please check your email or request a new code.');
    }
  };

  const handleSignOut = async () => {
    await signOutSupabase();
    setUser(null);
    setAuthStep('email');
    setOtpInput('');
    setAuthMessage('Signed out');
  };

  const handlePushCloud = async () => {
    setSyncLoading(true);
    const res = await pushToCloud(settings, tabs, widgets, notes);
    setSyncLoading(false);
    if (res.success) {
      setAuthMessage('Dashboard successfully backed up to the cloud!');
    } else {
      setAuthMessage(res.error || 'Cloud sync failed');
    }
  };

  const handlePullCloud = async () => {
    setSyncLoading(true);
    const res = await pullFromCloud();
    setSyncLoading(false);
    if (res.success) {
      setAuthMessage('Dashboard successfully restored from the cloud!');
      window.location.reload();
    } else {
      setAuthMessage(res.error || 'Cloud pull failed');
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default"
        >
          {/* Pinned Header with Title, Clickable Version Badge, and Close Button */}
          <div className="flex items-center justify-between border-b border-gray-800 p-5 bg-gray-950/80 shrink-0">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Ambiently Logo" width={32} height={32} loading="lazy" className="w-8 h-8 rounded-lg shadow-sm" />
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  Ambiently Command Center
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px] text-gray-400">dashboard.trinhism.com</p>
                  <button
                    onClick={() => setIsChangelogOpen(true)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all cursor-pointer flex items-center gap-1"
                    title="View release notes & changelog"
                  >
                    <span>v{APP_VERSION}</span>
                  </button>
                  {isUpdateAvailable && (
                    <button
                      onClick={applyUpdate}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 hover:bg-cyan-500/30 flex items-center gap-1 transition-all cursor-pointer animate-pulse"
                      title="New version available! Click to refresh and apply update"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-300" />
                      <span>Update v{latestVersion} Ready • Refresh</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs Header */}
          <div className="flex items-center gap-1 px-4 pt-2 border-b border-gray-800 bg-gray-950/60 overflow-x-auto no-scrollbar shrink-0">
            {[
              { id: 'boards' as const, label: 'Canvases', icon: <Grid className="w-3.5 h-3.5" />, badge: tabs.length },
              { id: 'display' as const, label: 'Display & Kiosk', icon: <Sliders className="w-3.5 h-3.5" /> },
              { id: 'photos' as const, label: 'Shared Photos', icon: <ImageIcon className="w-3.5 h-3.5" /> },
              { id: 'sync' as const, label: 'Sync & Backup', icon: <FolderSync className="w-3.5 h-3.5" /> },
              { id: 'system' as const, label: 'Security & System', icon: <Shield className="w-3.5 h-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400 bg-gray-900/90 shadow-sm'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-800 text-gray-300 font-mono">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* TAB 1: Canvases & Boards Manager */}
            {activeTab === 'boards' && (
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-semibold text-white block">
                    Canvases & Boards
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Reorder, rename, background pictures & dim levels, or hide sticky notes per board.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateCanvasOpen(true)}
                  disabled={tabs.length >= MAX_CANVASES}
                  title={
                    tabs.length >= MAX_CANVASES
                      ? `Maximum of ${MAX_CANVASES} canvases reached`
                      : 'Create New Canvas'
                  }
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    tabs.length >= MAX_CANVASES
                      ? 'bg-gray-800 text-gray-500 border border-gray-700 opacity-50 cursor-not-allowed'
                      : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 cursor-pointer'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tabs.length >= MAX_CANVASES ? `Limit Reached (${MAX_CANVASES})` : 'New Canvas'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {tabs.map((tab, idx) => {
                  const isEditingThis = editingTabId === tab.id;
                  const isFirst = idx === 0;
                  const isLast = idx === tabs.length - 1;
                  const hasExplicitHome = tabs.some((t) => t.isHome);
                  const isHome = tab.isHome || (!hasExplicitHome && idx === 0);

                  const matchedIconItem = CANVAS_ICONS.find((i) => i.id === tab.icon) || CANVAS_ICONS[0];
                  const IconComp = matchedIconItem.icon;
                  const matchedTheme =
                    CANVAS_THEMES.find((t) => t.id === (tab.backgroundTheme || 'midnight_dots')) ||
                    CANVAS_THEMES[0];

                  return (
                    <div
                      key={tab.id}
                      className="p-2.5 rounded-lg bg-gray-900/80 border border-gray-800/90 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-black/50 border border-white/10 text-emerald-400">
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white block">
                                {tab.name}
                              </span>
                              {isHome && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 shadow-sm">
                                  <Home className="w-2.5 h-2.5" />
                                  Home Board
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-gray-400 flex items-center gap-1.5">
                              <span>{matchedTheme.label}</span>
                              {tab.backgroundTheme === 'custom' && (
                                <span className="text-emerald-400">
                                  ({tab.backgroundDimLevel ?? 45}% dim)
                                </span>
                              )}
                              {tab.hideNotes && (
                                <span className="text-amber-400 font-semibold">
                                  • Notes Hidden
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Reorder, Home Canvas, Show/Hide Notes, Edit & Action Controls */}
                        <div className="flex items-center gap-1">
                          {/* Quick Toggle Show/Hide Sticky Notes on this Canvas */}
                          <button
                            type="button"
                            onClick={() => updateTab(tab.id, { hideNotes: !tab.hideNotes })}
                            title={
                              tab.hideNotes
                                ? 'Sticky notes are hidden on this canvas (click to show)'
                                : 'Sticky notes are visible on this canvas (click to hide)'
                            }
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              tab.hideNotes
                                ? 'text-amber-400 bg-amber-500/15 hover:bg-amber-500/25'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                          >
                            {tab.hideNotes ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Set as Home Canvas */}
                          <button
                            type="button"
                            onClick={() => setHomeTab(tab.id)}
                            title={isHome ? 'Default Home Board (Active)' : 'Set as Default Home Board'}
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              isHome
                                ? 'text-purple-300 bg-purple-500/25 border border-purple-500/40 shadow-sm'
                                : 'text-gray-400 hover:text-purple-300 hover:bg-purple-500/15'
                            }`}
                          >
                            <Home className="w-3.5 h-3.5" />
                          </button>

                          {/* Move Up */}
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => handleMoveTab(idx, 'up')}
                            title="Move tab up/earlier in order"
                            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>

                          {/* Move Down */}
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => handleMoveTab(idx, 'down')}
                            title="Move tab down/later in order"
                            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>

                          {/* Edit / Rename / Theme */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingTabId(null);
                              } else {
                                setEditingTabId(tab.id);
                                setEditTabName(tab.name);
                                setEditTabIcon(tab.icon || 'Pin');
                                setEditTabTheme(tab.backgroundTheme || 'midnight_dots');
                                setEditTabWallpaperUrl(tab.customWallpaperUrl || '');
                                setEditTabDimLevel(tab.backgroundDimLevel ?? 45);
                                setEditTabHideNotes(Boolean(tab.hideNotes));
                              }
                            }}
                            title="Edit name, icon, background picture, and dim level"
                            className="p-1 rounded-md text-gray-400 hover:text-blue-300 hover:bg-blue-500/20 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Tab */}
                          {tabs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => deleteTab(tab.id)}
                              title="Delete this canvas"
                              className="p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Canvas Editor */}
                      {isEditingThis && (
                        <div className="pt-2 border-t border-gray-800/80 space-y-2.5">
                          <input
                            type="text"
                            value={editTabName}
                            onChange={(e) => setEditTabName(e.target.value)}
                            placeholder="Canvas Name"
                            className="w-full rounded-lg bg-gray-950 border border-gray-800 p-2 text-xs text-white focus:outline-none focus:border-blue-500"
                          />

                          {/* Icon Picker */}
                          <div className="grid grid-cols-8 gap-1.5 p-1.5 bg-gray-950 rounded-lg border border-gray-800 max-h-32 overflow-y-auto">
                            {CANVAS_ICONS.map((item) => {
                              const IComp = item.icon;
                              const isCur = editTabIcon === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setEditTabIcon(item.id)}
                                  className={`p-1.5 rounded flex items-center justify-center transition-all cursor-pointer ${
                                    isCur
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                  }`}
                                  title={item.label}
                                >
                                  <IComp className="w-3.5 h-3.5" />
                                </button>
                              );
                            })}
                          </div>

                          {/* Background Theme Picker */}
                          <div>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                              Canvas Background Theme:
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {CANVAS_THEMES.map((theme) => {
                                const isCurTheme = editTabTheme === theme.id;
                                return (
                                  <button
                                    key={theme.id}
                                    type="button"
                                    onClick={() => setEditTabTheme(theme.id)}
                                    className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                                      isCurTheme
                                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-white'
                                    }`}
                                  >
                                    <span className={`w-4 h-4 rounded shrink-0 ${theme.previewClass}`} />
                                    <span className="text-[10px] font-semibold truncate">{theme.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {editTabTheme === 'custom' && (
                            <div className="space-y-2.5 p-2.5 rounded-lg bg-gray-950 border border-gray-800">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                  Upload Picture (Up to 4K UHD) or Paste URL
                                </span>
                                <input
                                  ref={wallpaperUploadRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleEditWallpaperUpload}
                                  className="hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => wallpaperUploadRef.current?.click()}
                                  disabled={isUploadingWallpaper}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  <Upload className="w-3 h-3" />
                                  <span>{isUploadingWallpaper ? 'Processing...' : 'Upload Picture'}</span>
                                </button>
                              </div>

                              {/* 4K Curated Photo Presets */}
                              <div className="grid grid-cols-4 gap-1.5">
                                {CURATED_WALLPAPER_PRESETS.map((preset) => (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setEditTabWallpaperUrl(preset.url)}
                                    title={preset.label}
                                    className={`relative h-10 rounded-md overflow-hidden border transition-all cursor-pointer ${
                                      editTabWallpaperUrl === preset.url
                                        ? 'border-emerald-400 ring-1 ring-emerald-400'
                                        : 'border-gray-800 opacity-75 hover:opacity-100'
                                    }`}
                                  >
                                    <img
                                      src={preset.thumbUrl}
                                      alt={preset.label}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>

                              <input
                                type="text"
                                value={
                                  editTabWallpaperUrl.startsWith('data:')
                                    ? 'Uploaded Local Picture (4K Ready)'
                                    : editTabWallpaperUrl
                                }
                                onChange={(e) => setEditTabWallpaperUrl(e.target.value)}
                                placeholder="Custom Wallpaper Image URL (https://...)"
                                className="w-full rounded-lg bg-gray-900 border border-gray-800 p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                              />

                              {/* Background Dim Level Slider */}
                              <div>
                                <div className="flex items-center justify-between text-[11px] text-gray-300 mb-1">
                                  <span className="flex items-center gap-1 font-semibold">
                                    <SunDim className="w-3.5 h-3.5 text-amber-400" />
                                    Background Dim Level
                                  </span>
                                  <span className="font-mono font-bold text-emerald-400">
                                    {editTabDimLevel}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={90}
                                  step={5}
                                  value={editTabDimLevel}
                                  onChange={(e) => setEditTabDimLevel(Number(e.target.value))}
                                  className="w-full accent-emerald-500 cursor-pointer"
                                />
                                <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                                  <span>0% (Bright)</span>
                                  <span>45% (Balanced)</span>
                                  <span>90% (Dark)</span>
                                </div>
                              </div>

                              {editTabWallpaperUrl && (
                                <div
                                  className="relative h-16 rounded-lg overflow-hidden border border-gray-800 flex items-center justify-center"
                                  style={{
                                    backgroundImage: `linear-gradient(rgba(9, 13, 22, ${
                                      editTabDimLevel / 100
                                    }), rgba(9, 13, 22, ${Math.min(
                                      0.95,
                                      editTabDimLevel / 100 + 0.1
                                    )})), url("${editTabWallpaperUrl}")`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                  }}
                                >
                                  <span className="px-2 py-0.5 rounded bg-gray-900/75 text-[10px] font-semibold text-white">
                                    Preview ({editTabDimLevel}% Dim)
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Show / Hide Sticky Notes Toggle */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-gray-300">
                              Hide Sticky Notes on this Canvas:
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditTabHideNotes(!editTabHideNotes)}
                              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                                editTabHideNotes ? 'bg-amber-500' : 'bg-gray-700'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                  editTabHideNotes ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Default Home Board Toggle */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1.5">
                              <Home className="w-3.5 h-3.5 text-purple-400" />
                              <span className="text-xs text-gray-300">
                                Default Home Board:
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setHomeTab(tab.id)}
                              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                                isHome ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                  isHome ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="flex justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingTabId(null)}
                              className="px-2.5 py-1 rounded text-[11px] text-gray-400 hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (editTabName.trim()) {
                                  await updateTab(tab.id, {
                                    name: editTabName.trim(),
                                    icon: editTabIcon,
                                    backgroundTheme: editTabTheme,
                                    customWallpaperUrl:
                                      editTabTheme === 'custom' ? editTabWallpaperUrl.trim() : undefined,
                                    backgroundDimLevel: editTabDimLevel,
                                    hideNotes: editTabHideNotes,
                                  });
                                }
                                setEditingTabId(null);
                              }}
                              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-[11px] font-bold text-white shadow cursor-pointer"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* TAB 2: Display & Kiosk Settings */}
            {activeTab === 'display' && (
              <>
            {/* Automated Tab Carousel Section */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      Auto-Rotate Tabs (Carousel)
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Automatically cycles tabs for an ambient smart-display
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setCarouselEnabled(!settings.carouselEnabled)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                    settings.carouselEnabled ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                      settings.carouselEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.carouselEnabled && (
                <div className="pt-2 border-t border-gray-800/60 flex items-center justify-between">
                  <span className="text-xs text-gray-300">Rotation Interval:</span>
                  <div className="flex gap-1.5">
                    {[15, 30, 45, 60, 120].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setCarouselDuration(sec)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                          settings.defaultRotateDurationSec === sec
                            ? 'bg-emerald-600/30 border border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-gray-800/80 text-gray-400 hover:text-white border border-transparent'
                        }`}
                      >
                        {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Night Mode & Kiosk Hardware Section */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400" />
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      Night Mode & Kiosk Display
                    </span>
                    <span className="text-[11px] text-gray-400">
                      OLED burn-in protection, scheduled dimming & screen wake lock
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => updateSettings({ nightModeEnabled: !settings.nightModeEnabled })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    settings.nightModeEnabled
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {settings.nightModeEnabled ? 'Night Mode Active' : 'Activate Now'}
                </button>
              </div>

              {/* Screen Wake Lock Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
                <div className="flex items-center gap-2">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-gray-300">Keep Screen Awake 24/7 (Wake Lock API)</span>
                </div>
                <button
                  onClick={() => updateSettings({ wakeLockEnabled: !settings.wakeLockEnabled })}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    settings.wakeLockEnabled ? 'bg-emerald-600' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      settings.wakeLockEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Auto-Hide Inactive Cursor Toggle (Kiosk Mode) */}
              <div className="space-y-2 pt-2 border-t border-gray-800/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
                    <div>
                      <span className="text-xs text-gray-300 block">Auto-Hide Mouse Cursor (Kiosk Mode)</span>
                      <span className="text-[10px] text-gray-500">Hides cursor when idle (1.2s in Night Mode)</span>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSettings({ autoHideCursor: settings.autoHideCursor === false })}
                    className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                      settings.autoHideCursor !== false ? 'bg-emerald-600' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        settings.autoHideCursor !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {settings.autoHideCursor !== false && (
                  <div className="flex items-center justify-between pl-5">
                    <span className="text-[11px] text-gray-400">Idle timeout:</span>
                    <div className="flex gap-1.5">
                      {[2, 3, 5, 10].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => updateSettings({ cursorIdleTimeoutSec: sec })}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                            (settings.cursorIdleTimeoutSec || 3) === sec
                              ? 'bg-cyan-600/30 border border-cyan-500 text-cyan-300 font-bold'
                              : 'bg-gray-800/80 text-gray-400 hover:text-white border border-transparent'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Night Mode Style Selector */}
              <div className="space-y-1.5 pt-2 border-t border-gray-800/60">
                <span className="text-xs text-gray-400 block">Night Mode Visual Style:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateSettings({ nightModeStyle: 'oled_clock' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      settings.nightModeStyle === 'oled_clock'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    OLED Pixel-Shift Clock
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ nightModeStyle: 'dim' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      settings.nightModeStyle === 'dim'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    Dim Screen Overlay
                  </button>
                </div>
              </div>

              {/* Night Schedule Start / End & Dim Opacity */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800/60">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                    Auto-Start Time
                  </label>
                  <input
                    type="time"
                    value={settings.nightModeStart || '22:00'}
                    onChange={(e) => updateSettings({ nightModeStart: e.target.value })}
                    className="w-full rounded-lg bg-gray-900 border border-gray-800 p-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">
                    Morning Wake Time
                  </label>
                  <input
                    type="time"
                    value={settings.nightModeEnd || '07:00'}
                    onChange={(e) => updateSettings({ nightModeEnd: e.target.value })}
                    className="w-full rounded-lg bg-gray-900 border border-gray-800 p-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {settings.nightModeStyle === 'dim' && (
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Dim Overlay Darkness:</span>
                    <span className="font-mono text-indigo-300">
                      {Math.round((settings.nightDimOpacity ?? 0.85) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="0.95"
                    step="0.05"
                    value={settings.nightDimOpacity ?? 0.85}
                    onChange={(e) => updateSettings({ nightDimOpacity: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Dock Position */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-blue-400" />
                Navigation Dock Position
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['left', 'top', 'right', 'bottom'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setDockPosition(pos)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium capitalize transition-all ${
                      settings.dockPosition === pos
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'border-gray-800 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Dock Visibility Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="space-y-0.5 max-w-[80%]">
                <div className="flex items-center gap-2">
                  {settings.isDockHidden ? (
                    <EyeOff className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-200">Hide Navigation Toolbar</span>
                </div>
                <p className="text-xs text-gray-400">
                  Hides the toolbar for full-screen immersion. Clicking off the peeked toolbar hides it again automatically unless pinned with the eye icon or shortcut <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-[11px] font-mono text-gray-300 border border-gray-700">\</kbd>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDockHidden(!settings.isDockHidden)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  settings.isDockHidden ? 'bg-amber-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.isDockHidden ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Snap to Grid Setting */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="space-y-0.5 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <Grid className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-gray-200">Snap to Grid</span>
                </div>
                <p className="text-xs text-gray-400">
                  Align tiles and sticky notes to a 24×16 grid while dragging or resizing, with real-time visual alignment guides.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSnapToGrid(!settings.snapToGrid)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  settings.snapToGrid ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.snapToGrid ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Lock Canvas Layout Setting */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="space-y-0.5 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-gray-200">Lock Canvas Layout</span>
                </div>
                <p className="text-xs text-gray-400">
                  Disable modifying canvases. Freezes tile positions, sizes, and layout. Disables moving, rotating, resizing, deleting, adding widgets/canvases, or auto-organizing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ lockCanvasEditing: !settings.lockCanvasEditing })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  settings.lockCanvasEditing ? 'bg-amber-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.lockCanvasEditing ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            </>
            )}

            {/* TAB 3: Common Photo Library */}
            {activeTab === 'photos' && (
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-sm font-semibold text-white block">
                      Common Photo Library
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Shared album used by all photo frame widgets configured to use the shared board library
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCommonPhotoModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Configure Common Photos</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-800 text-gray-300">
                <span className="text-gray-400">Current Shared Source:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-300">
                    {settings.commonPhotoSourceLabel || 'Curated Ambient'}
                    {settings.commonPhotos && settings.commonPhotos.length > 0 && ` (${settings.commonPhotos.length.toLocaleString()} photos)`}
                  </span>
                  {settings.commonPhotos && settings.commonPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => applyCommonPhotosToAllWidgets([], undefined, undefined, 'curated')}
                      className="text-[10px] text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 rounded border border-red-500/20 cursor-pointer transition-all font-semibold"
                      title="Reset shared library back to default Curated Scenery"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* TAB 4: Cloud Sync & Local Backup */}
            {activeTab === 'sync' && (
              <>
            {/* Cloud SaaS Sync Section */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  Cloud Sync & Family Mobile Access
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsShareOpen(true)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Family QR Invite</span>
                  </button>
                  {user && (
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-1 text-xs text-red-400 hover:underline"
                    >
                      <LogOut className="w-3 h-3" /> Sign Out
                    </button>
                  )}
                </div>
              </div>

              {user ? (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-400">
                    Signed in as: <span className="font-mono text-gray-200">{user.email}</span>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Your widgets, notes, and settings stay synchronized across all your signed-in devices.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handlePushCloud}
                      disabled={syncLoading}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600/30 border border-cyan-500/50 hover:bg-cyan-600/40 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                      Back Up to Cloud
                    </button>
                    <button
                      onClick={handlePullCloud}
                      disabled={syncLoading}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Restore from Cloud
                    </button>
                  </div>
                </div>
              ) : authStep === 'otp' ? (
                /* Step 2: 6-Digit OTP Code Verification */
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Code sent to <strong className="text-white font-mono">{emailInput}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthStep('email');
                        setAuthMessage('');
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>Change</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        maxLength={10}
                        autoFocus
                        placeholder="••••••••"
                        value={otpInput}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setOtpInput(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleVerifyOtp();
                        }}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-center text-lg font-mono font-bold tracking-[0.25em] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={isVerifyingOtp || otpInput.trim().length < 6}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
                      >
                        {isVerifyingOtp ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        <span>Verify & Sign In</span>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-gray-400 pt-1">
                      <span>Setting up another display? Enter the 6 or 8 digits from your email.</span>
                      <button
                        type="button"
                        onClick={handleSendMagicLink}
                        disabled={isSendingCode}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer font-medium"
                      >
                        {isSendingCode ? 'Sending...' : 'Resend Code'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Step 1: Email Input */
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Sign in with your email to automatically sync your dashboard across your phone, tablet, and smart displays.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendMagicLink();
                      }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={handleSendMagicLink}
                      disabled={isSendingCode || !emailInput.trim()}
                      className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                    >
                      {isSendingCode ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LogIn className="w-3.5 h-3.5" />
                      )}
                      <span>{isSendingCode ? 'Sending...' : 'Send Login Code'}</span>
                    </button>
                  </div>
                </div>
              )}
              {authMessage && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-start gap-2 mt-2 ${
                    authMessage.toLowerCase().includes('fail') ||
                    authMessage.toLowerCase().includes('error') ||
                    authMessage.toLowerCase().includes('invalid')
                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                      : authMessage.toLowerCase().includes('success') ||
                        authMessage.toLowerCase().includes('sent')
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300'
                  }`}
                >
                  {authMessage.toLowerCase().includes('fail') ||
                  authMessage.toLowerCase().includes('error') ||
                  authMessage.toLowerCase().includes('invalid') ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  ) : authMessage.toLowerCase().includes('success') ? (
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : null}
                  <span className="leading-relaxed">{authMessage}</span>
                </div>
              )}
            </div>

            {/* Local Backup & Restore Hub */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <FolderSync className="w-4 h-4 text-emerald-400" />
                    <span>Local Backup & Restore (No Cloud Needed)</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Download a full JSON snapshot of your dashboard, restore an existing file, or auto-sync.
                  </p>
                </div>
              </div>

              {backupStatus && (
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium">
                  {backupStatus}
                </div>
              )}

              <input
                ref={restoreFileRef}
                type="file"
                accept=".json"
                onChange={handleRestoreFile}
                className="hidden"
              />

              <div className="pt-0.5 pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none">
                  <input
                    type="checkbox"
                    checked={resetPinOnRestore}
                    onChange={(e) => setResetPinOnRestore(e.target.checked)}
                    className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-gray-400">
                    Clear PIN & kiosk locks on restored dashboard (prevents lockouts across devices)
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="py-2 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Backup</span>
                </button>

                <button
                  type="button"
                  onClick={() => restoreFileRef.current?.click()}
                  className="py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore from File</span>
                </button>

                <button
                  type="button"
                  onClick={handleBindLocalFile}
                  title={
                    fileSync.status === 'connected'
                      ? `Auto-syncing to ${fileSync.fileName}. Click to change file.`
                      : fileSync.status === 'needs_permission'
                      ? `Click to reconnect auto-sync to ${fileSync.fileName}`
                      : 'Mirror dashboard to a local file on your computer'
                  }
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    fileSync.status === 'connected'
                      ? 'bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border-emerald-500/40'
                      : fileSync.status === 'needs_permission'
                      ? 'bg-amber-500/25 hover:bg-amber-500/35 text-amber-300 border-amber-500/40 animate-pulse'
                      : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>
                    {fileSync.status === 'connected'
                      ? 'PC Sync Active'
                      : fileSync.status === 'needs_permission'
                      ? 'Reconnect Sync'
                      : 'PC Auto-Sync'}
                  </span>
                </button>
              </div>

              {/* Live PC Auto-Sync Status Details */}
              {fileSync.status === 'connected' && (
                <div className="flex items-center justify-between text-[11px] text-emerald-400/90 pt-1">
                  <span>
                    Live mirroring to <strong className="font-mono text-white">{fileSync.fileName}</strong>
                    {fileSync.lastSyncedAt && ` (${new Date(fileSync.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                  </span>
                  <button
                    type="button"
                    onClick={disconnectLocalFile}
                    className="text-gray-400 hover:text-red-400 text-[10px] underline cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {fileSync.status === 'needs_permission' && (
                <div className="flex items-center justify-between text-[11px] text-amber-300/90 pt-1">
                  <span>
                    Previous file: <strong className="font-mono text-white">{fileSync.fileName}</strong> (paused after reload)
                  </span>
                  <button
                    type="button"
                    onClick={handleBindLocalFile}
                    className="text-amber-400 hover:text-amber-300 font-bold underline text-[10px] cursor-pointer"
                  >
                    Reconnect Now
                  </button>
                </div>
              )}
            </div>
            </>
            )}

            {/* TAB 5: Security & System Settings */}
            {activeTab === 'system' && (
              <>
            {/* Kid Protection & Kiosk Security */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Shield className="w-4 h-4 text-blue-400" />
                    <span>Kid Protection & Kiosk Lock</span>
                  </div>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    Configure granular locks independently to prevent kids or visitors from altering layouts or exiting kiosk mode.
                  </span>
                </div>
                {settings.pinLockEnabled && (
                  <button
                    onClick={handleDisablePin}
                    className="text-xs text-red-400 hover:underline cursor-pointer"
                  >
                    Disable PIN
                  </button>
                )}
              </div>

              {/* PIN Status / Setup */}
              <div className="p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-300">Parent PIN Authorization</span>
                  {settings.pinLockEnabled ? (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> PIN Active
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No PIN configured</span>
                  )}
                </div>

                {!settings.pinLockEnabled ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="Enter 4-digit PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-44 font-mono tracking-widest text-center"
                    />
                    <button
                      onClick={handleSavePin}
                      disabled={pinInput.length !== 4}
                      className="py-1.5 px-3 rounded-lg bg-blue-600 disabled:opacity-40 text-xs font-medium text-white hover:bg-blue-500 transition-all cursor-pointer"
                    >
                      Set PIN
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-400">
                      Emergency override: press and hold the PIN pad shield for 4 seconds.
                    </span>
                    <button
                      onClick={() => {
                        setPinInput('');
                        updateSettings({
                          pinLockEnabled: false,
                          pinHash: null,
                          lockCanvasEditing: false,
                          lockFullscreenKiosk: false,
                          lockSettingsAccess: false,
                        });
                        setPinDisabledMessage('Previous PIN removed. Enter 4 digits to set a new PIN.');
                        setTimeout(() => setPinDisabledMessage(''), 3500);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer"
                    >
                      Change PIN
                    </button>
                  </div>
                )}
                {pinSuccess && (
                  <span className="text-xs text-emerald-400 mt-2 block">PIN successfully saved!</span>
                )}
                {pinDisabledMessage && (
                  <span className="text-xs text-amber-300 mt-2 block">{pinDisabledMessage}</span>
                )}
              </div>

              {/* Independent Protection Toggles */}
              <div className="space-y-2.5 pt-1">
                {/* 1. Lock Canvas Editing (Independent) */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Lock Canvas Layout & Content</span>
                    </div>
                    <span className="text-[11px] text-gray-400 block leading-tight">
                      Disables modifying canvases. Freezes tiles in place — disables moving, resizing, rotating, deleting, adding widgets/canvases, or auto-organizing. Interactive widgets & chore checkboxes remain usable.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSettings({ lockCanvasEditing: !settings.lockCanvasEditing })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      settings.lockCanvasEditing ? 'bg-amber-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.lockCanvasEditing ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Lock Fullscreen Kiosk */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>Lock Fullscreen Kiosk Mode</span>
                    </div>
                    <span className="text-[11px] text-gray-400 block leading-tight">
                      Traps Escape key, disables browser context menus, and auto-returns to fullscreen on touch. Requires parent PIN to exit.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        lockFullscreenKiosk: settings.lockFullscreenKiosk === false ? true : false,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      settings.lockFullscreenKiosk !== false ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.lockFullscreenKiosk !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Require PIN for Settings */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Settings className="w-3.5 h-3.5 text-purple-400" />
                      <span>Require PIN for Command Center Settings</span>
                    </div>
                    <span className="text-[11px] text-gray-400 block leading-tight">
                      Prompts for parent PIN before opening settings, wallpaper configurations, and photo library controls.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({
                        lockSettingsAccess: settings.lockSettingsAccess === false ? true : false,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      settings.lockSettingsAccess !== false ? 'bg-purple-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.lockSettingsAccess !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Software Version, Updates & Panel Refresh */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <RotateCw className="w-4 h-4 text-cyan-400" />
                    <span>App Version & Updates</span>
                  </div>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    Ambiently automatically checks for newer releases and updates in the background.
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Installed: v{APP_VERSION}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {isUpdateAvailable ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                        <span className="text-cyan-300 font-bold">New Version Available: v{latestVersion}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-gray-300">Ambiently is up to date (v{APP_VERSION})</span>
                      </>
                    )}
                  </div>
                  <div className="text-[10.5px] text-gray-500 font-mono">
                    {checkFeedback || (lastChecked ? `Last checked: ${new Date(lastChecked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Auto-checking every 5 minutes')}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      setCheckFeedback('Checking for updates...');
                      const hasUp = await checkForUpdates();
                      setCheckFeedback(hasUp ? `Update found: v${useUpdateChecker.getState().latestVersion}!` : 'You are on the newest version!');
                      setTimeout(() => setCheckFeedback(''), 4000);
                    }}
                    disabled={isChecking}
                    className="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border border-gray-700"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                    <span>{isChecking ? 'Checking...' : 'Check Now'}</span>
                  </button>

                  {isUpdateAvailable ? (
                    <button
                      type="button"
                      onClick={applyUpdate}
                      className="py-1.5 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-blue-600/30 flex items-center gap-1.5"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Refresh & Update</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="py-1.5 px-3 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border border-gray-700/80"
                      title="Reload all dashboard panels and web assets"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Refresh Panel</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Support & Donate Panel */}
            <SupportPanel />

            {/* Danger Zone: Factory Reset */}
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span>Danger Zone: Factory Reset</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Permanently wipes all customized tiles, notes, Plex credentials, local folders, and custom layouts, restoring Ambiently to its fresh out-of-the-box state.
              </p>

              {!isConfirmingReset ? (
                <button
                  onClick={() => setIsConfirmingReset(true)}
                  className="py-2 px-4 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Start From Scratch (Factory Reset)</span>
                </button>
              ) : (
                <div className="p-3 bg-red-950/60 rounded-xl border border-red-500/40 space-y-2.5">
                  <p className="text-xs font-bold text-red-300">
                    ⚠️ Are you absolutely sure? All tiles and notes will be permanently erased.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleFactoryReset}
                      disabled={isResetting}
                      className="py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-red-600/30 flex items-center gap-1.5"
                    >
                      {isResetting ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Resetting...</span>
                        </>
                      ) : (
                        <span>Yes, Wipe Everything & Reset</span>
                      )}
                    </button>
                    <button
                      onClick={() => setIsConfirmingReset(false)}
                      disabled={isResetting}
                      className="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Create Canvas Modal */}
      <CreateCanvasModal
        isOpen={isCreateCanvasOpen}
        onClose={() => setIsCreateCanvasOpen(false)}
        existingCanvasCount={tabs.length}
        onCreateCanvas={(name, icon, theme, wallpaperUrl, dimLevel) => {
          addTab(name, icon, theme, wallpaperUrl, dimLevel);
        }}
      />

      {/* Dedicated Changelog Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />
      <ShareBoardModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {/* Common Photo Sources Hub */}
      {isCommonPhotoModalOpen && (
        <React.Suspense fallback={null}>
          <PhotoSourcesModal
            isOpen={isCommonPhotoModalOpen}
            onClose={() => setIsCommonPhotoModalOpen(false)}
            isCommonSource={true}
            initialWebUrls={settings.commonPhotoSourceUrl || ''}
            currentSourceLabel={settings.commonPhotoSourceLabel}
            currentSourceType={settings.commonPhotoSourceType}
            currentPhotoCount={settings.commonPhotos?.length}
            onPhotosLoaded={(photos, sourceLabel, sourceUrl, sourceType) => {
              applyCommonPhotosToAllWidgets(photos, sourceLabel, sourceUrl, sourceType);
            }}
          />
        </React.Suspense>
      )}
    </>
  );
};
