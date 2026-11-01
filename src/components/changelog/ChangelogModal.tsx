import React from 'react';
import { X, ExternalLink, Calendar } from 'lucide-react';
import { RELEASES, APP_VERSION } from '../../data/changelog';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800/80 bg-gray-950/40">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Ambiently" className="w-9 h-9 rounded-xl shadow-md border border-gray-700/60" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white leading-tight">Ambiently Changelog</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Release notes & feature updates</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Releases Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {RELEASES.map((rel, idx) => (
            <div
              key={rel.version}
              className={`space-y-2.5 ${idx !== 0 ? 'pt-5 border-t border-gray-800/60' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/40">
                    {rel.version}
                  </span>
                  <span className="text-sm font-semibold text-gray-200">{rel.title}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                  <Calendar className="w-3 h-3" />
                  <span>{rel.date}</span>
                </div>
              </div>

              <ul className="space-y-1.5 pl-2 text-xs text-gray-400">
                {rel.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                    <span className="leading-relaxed">{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800/80 bg-gray-950/60 flex items-center justify-between">
          <a
            href="https://github.com/Genghis1227/ambiently/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 transition-colors"
          >
            <span>View full CHANGELOG.md on GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white transition-all shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
