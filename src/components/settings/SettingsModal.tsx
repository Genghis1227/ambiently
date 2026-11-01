import React, { useState } from 'react';
import { X, Lock, Shield, FolderSync } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { openLocalFileBinding } from '../../services/fileSync';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    settings,
    setDockPosition,
    setDisplayDensity,
    setPinLock,
    saveLocalBackup,
  } = useDashboardStore();

  const [pinInput, setPinInput] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Ambiently" className="w-8 h-8 rounded-lg shadow-sm" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Ambiently Command Center</h2>
              <p className="text-[11px] text-gray-400">dashboard.trinhism.com</p>
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
  );
};
