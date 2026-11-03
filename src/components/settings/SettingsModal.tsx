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
} from 'lucide-react';
import { db } from '../../services/db';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  openLocalFileBinding,
  downloadBackupFile,
  parseAndValidateBackup,
  restoreBackupToDatabase,
} from '../../services/fileSync';
import {
  getCurrentUser,
  sendMagicLink,
  signOutSupabase,
  pushToCloud,
  pullFromCloud,
} from '../../services/supabase';
import { APP_VERSION } from '../../data/changelog';
import { CANVAS_ICONS } from '../../data/canvasIcons';
import { CANVAS_THEMES } from '../../data/canvasThemes';
import {
  CURATED_WALLPAPER_PRESETS,
  processUploadedWallpaper,
} from '../../utils/imageUpload';
import type { CanvasBackgroundTheme } from '../../types/dashboard';
import { CreateCanvasModal } from '../dock/CreateCanvasModal';
import { ChangelogModal } from '../changelog/ChangelogModal';
import { SupportPanel } from './SupportPanel';
import { ShareBoardModal } from './ShareBoardModal';

import type { User } from '@supabase/supabase-js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
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
    updateSettings,
    setPinLock,
    saveLocalBackup,
    addTab,
    updateTab,
    setHomeTab,
    deleteTab,
    reorderTabs,
  } = useDashboardStore();

  const [pinInput, setPinInput] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Supabase cloud state
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
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
    downloadBackupFile(settings, tabs, widgets, notes);
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
    const res = await restoreBackupToDatabase(validation.data);
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
      setTimeout(() => setPinSuccess(false), 2000);
      setPinInput('');
    }
  };

  const handleDisablePin = async () => {
    await setPinLock(null);
  };

  const handleBindLocalFile = async () => {
    const res = await openLocalFileBinding();
    if (res.success) {
      await saveLocalBackup();
    }
  };

  const handleSendMagicLink = async () => {
    if (!emailInput.trim()) return;
    setAuthMessage('Sending sign-in link...');
    const res = await sendMagicLink(emailInput.trim());
    if (res.success) {
      setAuthMessage('Sign-in link sent! Check your email inbox to log in.');
    } else {
      setAuthMessage(res.error || 'Failed to send magic link');
    }
  };

  const handleSignOut = async () => {
    await signOutSupabase();
    setUser(null);
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
          className="w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden cursor-default"
        >
          {/* Pinned Header with Title, Clickable Version Badge, and Close Button */}
          <div className="flex items-center justify-between border-b border-gray-800 p-5 bg-gray-950/80 shrink-0">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Ambiently" className="w-8 h-8 rounded-lg shadow-sm" />
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

          <div className="p-6 overflow-y-auto space-y-6">
            {/* Canvases & Boards Manager */}
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
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Canvas</span>
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
              ) : (
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
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={handleSendMagicLink}
                      className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Send Login Link
                    </button>
                  </div>
                </div>
              )}
              {authMessage && (
                <span className="text-[11px] text-cyan-300 mt-2 block">{authMessage}</span>
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
                  className="py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>PC Auto-Sync</span>
                </button>
              </div>
            </div>

            {/* Kid-Proof PIN Protection */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Kid-Proof PIN Lock
                </div>
                {settings.pinLockEnabled ? (
                  <button
                    onClick={handleDisablePin}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Disable Lock
                  </button>
                ) : null}
              </div>

              {settings.pinLockEnabled ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> PIN protection is currently active
                </p>
              ) : (
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
                    className="py-1.5 px-3 rounded-lg bg-blue-600 disabled:opacity-40 text-xs font-medium text-white hover:bg-blue-500 transition-all"
                  >
                    Set PIN
                  </button>
                </div>
              )}
              {pinSuccess && (
                <span className="text-xs text-emerald-400 mt-2 block">PIN successfully set!</span>
              )}
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
          </div>
        </div>
      </div>

      {/* Create Canvas Modal */}
      <CreateCanvasModal
        isOpen={isCreateCanvasOpen}
        onClose={() => setIsCreateCanvasOpen(false)}
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
    </>
  );
};
