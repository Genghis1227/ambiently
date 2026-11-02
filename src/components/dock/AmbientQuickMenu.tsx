import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Moon,
  Maximize2,
  Minimize2,
  Settings,
  X,
  Play,
  Pause,
  Home,
  QrCode,
  Sparkles,
  Layers,
  Smartphone,
} from 'lucide-react';
import type { DockPosition } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboardStore';
import { APP_VERSION } from '../../data/changelog';
import { ChangelogModal } from '../changelog/ChangelogModal';
import { ShareBoardModal } from '../settings/ShareBoardModal';

interface AmbientQuickMenuProps {
  dockPosition: DockPosition;
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tabId: string) => void;
  onOpenSettings: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onToggleMobileCompanion?: () => void;
}

export const AmbientQuickMenu: React.FC<AmbientQuickMenuProps> = ({
  dockPosition,
  isOpen,
  onClose,
  onSelectTab,
  onOpenSettings,
  onToggleFullscreen,
  isFullscreen,
  onToggleMobileCompanion,
}) => {
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const settings = useDashboardStore((s) => s.settings);
  const toggleNightModeManual = useDashboardStore((s) => s.toggleNightModeManual);
  const setCarouselEnabled = useDashboardStore((s) => s.setCarouselEnabled);
  const tabs = useDashboardStore((s) => s.tabs);

  // Live clock display in header
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Position adjacent to the dock based on dockPosition
  const positionClasses = {
    left: 'left-full top-0 ml-3',
    right: 'right-full top-0 mr-3',
    top: 'top-full left-0 mt-3',
    bottom: 'bottom-full left-0 mb-3',
  }[dockPosition];

  const homeTab = tabs.find((t) => t.isHome) || tabs[0];

  return (
    <>
      {/* Click-outside transparent backdrop rendered at document.body level */}
      {createPortal(
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
        />,
        document.body
      )}

      {/* Floating Quick HUD Card */}
      <div
        className={`absolute z-50 w-80 max-w-[calc(100vw-5rem)] rounded-2xl bg-gray-950/95 backdrop-blur-2xl border border-gray-800 p-4 shadow-2xl text-white select-none transition-all animate-in fade-in zoom-in-95 duration-150 pointer-events-auto ${positionClasses}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Brand, Title, Version Pill & Close */}
        <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-gray-800/80">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Ambiently"
              className="w-8 h-8 rounded-xl object-cover shadow-sm border border-gray-700/60"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight">Ambiently</span>
                <button
                  type="button"
                  onClick={() => setIsChangelogOpen(true)}
                  title="View What's New & Release Notes"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[10px] font-semibold transition-all cursor-pointer"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>v{APP_VERSION}</span>
                </button>
              </div>
              <div className="text-[11px] text-gray-400">Ambient Command Hub</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all cursor-pointer"
            title="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* System Status Pill */}
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-gray-900/80 border border-gray-800/80 text-xs text-gray-400 mb-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-300 font-medium">Local-First Engine</span>
          </div>
          <span className="font-mono text-gray-400 text-[11px]">{currentTime}</span>
        </div>

        {/* Kiosk Quick Controls Grid */}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-0.5">
          Kiosk Controls
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Night Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              toggleNightModeManual();
            }}
            className={`p-2.5 rounded-xl border flex flex-col items-start gap-1 transition-all cursor-pointer text-left ${
              settings.nightModeEnabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-gray-900/90 border-gray-800 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <Moon className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                {settings.nightModeEnabled ? 'Active' : 'Off'}
              </span>
            </div>
            <span className="text-xs font-semibold">Night Mode</span>
          </button>

          {/* Fullscreen Kiosk Toggle */}
          <button
            type="button"
            onClick={() => {
              onToggleFullscreen();
            }}
            className={`p-2.5 rounded-xl border flex flex-col items-start gap-1 transition-all cursor-pointer text-left ${
              isFullscreen
                ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                : 'bg-gray-900/90 border-gray-800 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                {isFullscreen ? 'Kiosk' : 'Normal'}
              </span>
            </div>
            <span className="text-xs font-semibold">Fullscreen</span>
          </button>

          {/* Tab Carousel Auto-Rotate Toggle */}
          <button
            type="button"
            onClick={() => {
              setCarouselEnabled(!settings.carouselEnabled);
            }}
            className={`p-2.5 rounded-xl border flex flex-col items-start gap-1 transition-all cursor-pointer text-left ${
              settings.carouselEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-gray-900/90 border-gray-800 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              {settings.carouselEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                {settings.carouselEnabled ? 'Rotating' : 'Paused'}
              </span>
            </div>
            <span className="text-xs font-semibold">Auto-Rotate</span>
          </button>

          {/* Return Home Canvas */}
          <button
            type="button"
            onClick={() => {
              if (homeTab) onSelectTab(homeTab.id);
              onClose();
            }}
            className="p-2.5 rounded-xl border border-gray-800 bg-gray-900/90 hover:bg-gray-800 text-gray-300 flex flex-col items-start gap-1 transition-all cursor-pointer text-left group"
          >
            <div className="flex items-center justify-between w-full">
              <Home className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Home
              </span>
            </div>
            <span className="text-xs font-semibold truncate max-w-full text-white">
              {homeTab?.name || 'Home Board'}
            </span>
          </button>
        </div>

        {/* Action Shortcuts */}
        <div className="space-y-1.5 mb-3">
          {onToggleMobileCompanion && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onToggleMobileCompanion();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-xs font-semibold text-blue-300 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                <span>Switch to Mobile Companion</span>
              </div>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full font-mono">
                Remote
              </span>
            </button>
          )}

          {/* Share Board / Mobile QR */}
          <button
            type="button"
            onClick={() => {
              setIsShareModalOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900/80 hover:bg-gray-800/90 border border-gray-800 text-xs font-medium text-gray-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-cyan-400" />
              <span>Connect Phone (QR Code)</span>
            </div>
            <span className="text-[10px] text-gray-500">Invite</span>
          </button>

          {/* Full Settings Modal */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900/80 hover:bg-gray-800/90 border border-gray-800 text-xs font-medium text-gray-200 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              <span>Settings & Boards Manager</span>
            </div>
            <span className="text-[10px] text-gray-500">⚙️</span>
          </button>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-gray-400" />
            <span>{tabs.length} Canvases</span>
          </div>
          <button
            type="button"
            onClick={() => setIsChangelogOpen(true)}
            className="text-blue-400 hover:underline cursor-pointer"
          >
            Release Notes
          </button>
        </div>
      </div>

      {/* Changelog Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => {
          setIsChangelogOpen(false);
          onClose();
        }}
      />

      {/* Share / Mobile Companion QR Modal */}
      <ShareBoardModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          onClose();
        }}
      />
    </>
  );
};
