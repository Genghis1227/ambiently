import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { X, Users, Copy, Check, Smartphone } from 'lucide-react';
import { getOrCreateInviteCode } from '../../services/supabase';

interface ShareBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareBoardModal: React.FC<ShareBoardModalProps> = ({ isOpen, onClose }) => {
  const [inviteData, setInviteData] = useState<{ code: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getOrCreateInviteCode().then((data) => {
        setInviteData(data);
        setLoading(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!inviteData) return;
    navigator.clipboard.writeText(inviteData.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl flex flex-col overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-950/40">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Share Board & Family Access</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center space-y-4">
          <p className="text-xs text-gray-300 leading-relaxed max-w-sm">
            Scan this QR code with any phone camera to instantly connect to this dashboard in{' '}
            <strong className="text-cyan-400">Mobile Companion Mode</strong>. Family members can add sticky notes and check off tasks live!
          </p>

          {/* QR Code Container */}
          <div className="p-4 bg-white rounded-2xl shadow-xl border border-gray-200">
            {loading ? (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-gray-500">
                Generating Code...
              </div>
            ) : inviteData ? (
              <QRCodeSVG
                value={inviteData.url}
                size={180}
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="w-44 h-44 flex flex-col items-center justify-center p-3 text-center text-gray-500 text-xs">
                <span>Sign in to Cloud Sync in Settings (⚙️) to generate a family invite code.</span>
              </div>
            )}
          </div>

          {inviteData && (
            <>
              {/* 6-Digit Join Code */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
                  Or Enter Join Code On Mobile:
                </span>
                <span className="text-2xl font-mono font-extrabold text-cyan-400 tracking-widest mt-0.5">
                  {inviteData.code}
                </span>
              </div>

              {/* Direct Copy Link Button */}
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 border border-gray-700 text-xs font-semibold text-gray-200 transition-all active:scale-98 shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Invite Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-gray-400" />
                    <span>Copy Mobile Join Link</span>
                  </>
                )}
              </button>
            </>
          )}

          <div className="pt-2 text-[11px] text-gray-500 flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400/80" />
            <span>Zero app store downloads required • Instant PWA</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
