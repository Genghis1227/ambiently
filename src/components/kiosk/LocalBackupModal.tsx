import React from 'react';
import { X, HardDrive, CheckCircle2, ShieldCheck } from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Local Computer Backup</h2>
              <p className="text-[11px] text-gray-400">Automatic backup to your PC or NAS drive</p>
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
          <p>
            Your dashboard already saves instantly in your browser (and syncs to Supabase Cloud if signed in).
          </p>
          <p>
            This <strong>optional feature</strong> creates a dedicated backup file on your computer hard drive that updates automatically whenever you add sticky notes or change your layout.
          </p>

          <div className="p-3.5 rounded-xl bg-gray-950/60 border border-gray-800 space-y-2">
            <div className="flex items-center gap-2 text-gray-200 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Status: {hasFileBound ? 'Active (Auto-Syncing)' : 'Not Connected (Optional)'}</span>
            </div>
            <p className="text-[11px] text-gray-400 pl-6">
              {hasFileBound
                ? 'Your dashboard is actively writing automated backups to your selected file.'
                : 'Choose a folder (such as Documents or Desktop) to save your ambiently-backup.json file.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-all"
            >
              {hasFileBound ? 'Done' : 'Maybe Later'}
            </button>
            <button
              onClick={() => {
                onClose();
                onSelectLocation();
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs font-bold text-white transition-all shadow-md"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{hasFileBound ? 'Change Backup File' : 'Choose Backup File'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
