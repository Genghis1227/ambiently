import React, { useState, useEffect } from 'react';
import { X, Lock, Shield, FolderSync, Cloud, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { openLocalFileBinding } from '../../services/fileSync';
import { getCurrentUser, sendMagicLink, signOutSupabase, pushToCloud, pullFromCloud } from '../../services/supabase';
import { APP_VERSION } from '../../data/changelog';
import { ChangelogModal } from '../changelog/ChangelogModal';
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
    setPinLock,
    saveLocalBackup,
  } = useDashboardStore();

  const [pinInput, setPinInput] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  // Supabase cloud state
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getCurrentUser().then(setUser);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
                <h2 className="text-base font-bold text-white leading-tight">Ambiently Command Center</h2>
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

            {/* Dock Position */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
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

            {/* Display Density */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                Display Density / Zoom (Auto-Fit 1080p/4K)
              </label>
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

            {/* Local File Sync */}
            <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FolderSync className="w-4 h-4 text-emerald-400" />
                  Local File Auto-Sync
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Save and auto-sync state directly to a local <code className="text-blue-400 font-mono">ambiently-data.json</code>
                </p>
              </div>
              <button
                onClick={handleBindLocalFile}
                className="py-2 px-3.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium hover:bg-emerald-600/30 transition-all"
              >
                Bind File
              </button>
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
        </div>
      </div>
    </div>

    {/* Dedicated Changelog Modal */}
    <ChangelogModal
      isOpen={isChangelogOpen}
      onClose={() => setIsChangelogOpen(false)}
    />
  </>
  );
};
