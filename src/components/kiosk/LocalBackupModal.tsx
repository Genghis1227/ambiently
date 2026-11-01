import React, { useRef, useState } from 'react';
import {
  X,
  HardDrive,
  Download,
  Upload,
  FolderSync,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  downloadBackupFile,
  parseAndValidateBackup,
  restoreBackupToDatabase,
} from '../../services/fileSync';

interface LocalBackupModalProps {
  isOpen: boolean;
  hasFileBound: boolean;
  onClose: () => void;
  onSelectLocation: () => void;
}

export const LocalBackupModal: React.FC<LocalBackupModalProps> = ({
  isOpen,
  hasFileBound,
  onClose,
  onSelectLocation,
}) => {
  const { settings, tabs, widgets, notes, initStore } = useDashboardStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    downloadBackupFile(settings, tabs, widgets, notes);
    setStatusMessage({ text: 'Backup file downloaded successfully!' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setStatusMessage(null);

    const validation = await parseAndValidateBackup(file);
    if (!validation.success || !validation.data) {
      setStatusMessage({ text: validation.error || 'Failed to parse backup file.', isError: true });
      setIsRestoring(false);
      return;
    }

    const restoreRes = await restoreBackupToDatabase(validation.data);
    if (restoreRes.success) {
      setStatusMessage({ text: 'Dashboard restored successfully! Refreshing...' });
      await initStore();
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1000);
    } else {
      setStatusMessage({ text: restoreRes.error || 'Failed to restore database.', isError: true });
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Local Backup & Restore</h2>
              <p className="text-[11px] text-gray-400">Export, restore, or auto-sync your dashboard offline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs text-gray-300 leading-relaxed">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-medium ${
                statusMessage.isError
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              {statusMessage.isError ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Section 1: Quick Export & Restore */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Export Card */}
            <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>Export Backup</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  Save a full `.json` backup of your tiles, notes, checklists, and layout to your device.
                </p>
              </div>
              <button
                onClick={handleExport}
                className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .json</span>
              </button>
            </div>

            {/* Restore Card */}
            <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>Restore from File</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  Upload an existing `.json` backup file to restore all your dashboard data instantly.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRestoring}
                className="w-full py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload & Restore</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 2: Real-time Auto-Sync to PC Hard Drive */}
          <div className="p-3.5 rounded-xl bg-gray-950/40 border border-gray-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-200 font-semibold">
                <FolderSync className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Real-Time PC Auto-Sync (Chromium)</span>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  hasFileBound
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-gray-800 text-gray-400'
                }`}
              >
                {hasFileBound ? 'Active' : 'Optional'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Continuously streams automated live updates to an `ambiently-data.json` file on your computer whenever you add notes or adjust widgets.
            </p>
            <button
              onClick={() => {
                onClose();
                onSelectLocation();
              }}
              className="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium text-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
              <span>{hasFileBound ? 'Change Auto-Sync File' : 'Choose Auto-Sync Location'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
