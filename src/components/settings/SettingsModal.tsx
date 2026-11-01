import React, { useState, useEffect } from 'react';
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
    setDisplayDensity,
    setCarouselEnabled,
    setCarouselDuration,
    setPinLock,
    saveLocalBackup,
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
  const restoreFileRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      getCurrentUser().then(setUser);
    }
  }, [isOpen]);

  if (!isOpen) return null;


  const handleFactoryReset = async () => {
    setIsResetting(true);
    try {
      // 1. Clear IndexedDB database completely
      await db.delete();

      // 2. Clear photo cache storage if supported
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
      }

      // 3. Clear localStorage & sessionStorage
      localStorage.clear();
      sessionStorage.clear();

      // 4. Clean reload
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
    setAuthMessage('Sending magic link...');
    const res = await sendMagicLink(emailInput.trim());
    if (res.success) {
      setAuthMessage('Magic link sent! Check your email inbox.');
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
      setAuthMessage('Local dashboard uploaded to Supabase Cloud!');
    } else {
      setAuthMessage(res.error || 'Cloud sync failed');
    }
  };

  const handlePullCloud = async () => {
    setSyncLoading(true);
    const res = await pullFromCloud();
    setSyncLoading(false);
    if (res.success) {
      setAuthMessage('Downloaded latest changes from Cloud!');
      window.location.reload();
    } else {
      setAuthMessage(res.error || 'Cloud pull failed');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div className="w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
          {/* Header with Title and Clickable Version Badge */}
          <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
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
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
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

            {/* Display Density (Canvas Scale) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block">
                  Canvas Display Density / Zoom
                </label>
                <span className="text-[11px] text-blue-400 font-mono">
                  {settings.displayDensity * 100}%
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">
                Scales board cards for 1080p, 1440p, or 4K screens (dock & settings remain pinned).
              </p>
              <div className="grid grid-cols-4 gap-2">
                {([0.75, 1.0, 1.25, 1.5] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => setDisplayDensity(density)}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      settings.displayDensity === density
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'border-gray-800 text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    {density === 1.0 ? '100% (Default)' : `${density * 100}%`}
                  </button>
                ))}
              </div>
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

            {/* Support & Donate Panel */}
            <SupportPanel />

            {/* Cloud SaaS Sync Section */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Cloud className="w-4 h-4 text-cyan-400" />
                  Supabase Cloud Sync (Multi-Device)
                </div>
                {user && (
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1 text-xs text-red-400 hover:underline"
                  >
                    <LogOut className="w-3 h-3" /> Sign Out
                  </button>
                )}
              </div>

              {user ? (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-400">
                    Signed in as: <span className="font-mono text-gray-200">{user.email}</span>
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handlePushCloud}
                      disabled={syncLoading}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-cyan-600/30 border border-cyan-500/50 hover:bg-cyan-600/40 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                      Sync to Cloud
                    </button>
                    <button
                      onClick={handlePullCloud}
                      disabled={syncLoading}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-300 flex items-center justify-center gap-1.5"
                    >
                      Pull from Cloud
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    Sign in with a Magic Link to sync your notes & layout across mobile and kiosk displays.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Enter your email..."
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={handleSendMagicLink}
                      className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg flex items-center gap-1 transition-all"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Sign In
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
