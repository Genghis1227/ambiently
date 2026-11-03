import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Pin,
  StickyNote,
  Image,
  Calendar,
  Settings,
  Lock,
  Moon,
  Maximize2,
  Minimize2,
  Plus,
  Home,
  Coffee,
  Heart,
  Star,
  Music,
  Sun,
  CheckSquare,
  Sparkles,
  Smile,
  Tv,
  Folder,
  Clock,
  Archive,
  Wand2,
  RotateCcw,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type {
  AutoOrganizeMode,
  DashboardTab,
  DockPosition,
} from '../../types/dashboard';
import { AmbientQuickMenu } from './AmbientQuickMenu';

interface NavigationDockProps {
  tabs: DashboardTab[];
  activeTabId: string;
  dockPosition: DockPosition;
  isLocked: boolean;
  onSelectTab: (tabId: string) => void;
  onOpenSettings: () => void;
  onToggleNightMode: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onConnectFile?: () => void;
  hasFileBound?: boolean;
  onOpenAddWidget?: () => void;
  onOpenAddCanvas?: () => void;
  onOpenCreateNote?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  onAutoOrganize?: (mode: AutoOrganizeMode) => void;
  onUndoOrganize?: () => void;
  canUndoOrganize?: boolean;
  onToggleMobileCompanion?: () => void;
  isDockHidden?: boolean;
  onToggleDockHidden?: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid className="w-5 h-5" />,
  Pin: <Pin className="w-5 h-5" />,
  StickyNote: <StickyNote className="w-5 h-5" />,
  Image: <Image className="w-5 h-5" />,
  Calendar: <Calendar className="w-5 h-5" />,
  Home: <Home className="w-5 h-5" />,
  Coffee: <Coffee className="w-5 h-5" />,
  Heart: <Heart className="w-5 h-5" />,
  Star: <Star className="w-5 h-5" />,
  Music: <Music className="w-5 h-5" />,
  Sun: <Sun className="w-5 h-5" />,
  CheckSquare: <CheckSquare className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  Smile: <Smile className="w-5 h-5" />,
  Tv: <Tv className="w-5 h-5" />,
  Folder: <Folder className="w-5 h-5" />,
  Clock: <Clock className="w-5 h-5" />,
};

export const NavigationDock: React.FC<NavigationDockProps> = ({
  tabs,
  activeTabId,
  dockPosition,
  isLocked,
  onSelectTab,
  onOpenSettings,
  onToggleNightMode,
  onToggleFullscreen,
  isFullscreen,
  onOpenAddWidget,
  onOpenAddCanvas,
  onOpenCreateNote,
  onOpenTrash,
  trashCount = 0,
  onAutoOrganize,
  onUndoOrganize,
  canUndoOrganize = false,
  onToggleMobileCompanion,
  isDockHidden = false,
  onToggleDockHidden,
}) => {
  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  const [showOrganizeMenu, setShowOrganizeMenu] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<AutoOrganizeMode>('bento');

  useEffect(() => {
    if (!showOrganizeMenu) return;
    const timer = window.setTimeout(() => setShowOrganizeMenu(false), 6000);
    return () => clearTimeout(timer);
  }, [showOrganizeMenu, activeMode]);

  const positionClasses = {
    left: `left-3 top-1/2 flex-col ${
      isDockHidden
        ? '-translate-y-1/2 -translate-x-[220%] opacity-0 pointer-events-none'
        : '-translate-y-1/2 translate-x-0 opacity-100'
    }`,
    right: `right-3 top-1/2 flex-col ${
      isDockHidden
        ? '-translate-y-1/2 translate-x-[220%] opacity-0 pointer-events-none'
        : '-translate-y-1/2 translate-x-0 opacity-100'
    }`,
    top: `top-3 left-1/2 flex-row ${
      isDockHidden
        ? '-translate-x-1/2 -translate-y-[220%] opacity-0 pointer-events-none'
        : '-translate-x-1/2 translate-y-0 opacity-100'
    }`,
    bottom: `bottom-3 left-1/2 flex-row ${
      isDockHidden
        ? '-translate-x-1/2 translate-y-[220%] opacity-0 pointer-events-none'
        : '-translate-x-1/2 translate-y-0 opacity-100'
    }`,
  }[dockPosition];

  const popoverPositionClasses = {
    left: 'left-16 top-1/2 -translate-y-1/2',
    right: 'right-16 top-1/2 -translate-y-1/2',
    top: 'top-16 left-1/2 -translate-x-1/2',
    bottom: 'bottom-16 left-1/2 -translate-x-1/2',
  }[dockPosition];

  return (
    <>
      {/* Edge Handle to Restore Hidden Toolbar */}
      {isDockHidden && onToggleDockHidden && (
        <button
          type="button"
          onClick={onToggleDockHidden}
          title="Show Navigation Toolbar (Shortcut: \)"
          className={`fixed z-50 flex items-center justify-center p-2.5 bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white backdrop-blur-xl border border-gray-700/80 shadow-2xl transition-all cursor-pointer group active:scale-95 ${
            dockPosition === 'left'
              ? 'left-0 top-1/2 -translate-y-1/2 rounded-r-2xl border-l-0 shadow-[4px_0_15px_rgba(0,0,0,0.5)]'
              : dockPosition === 'right'
              ? 'right-0 top-1/2 -translate-y-1/2 rounded-l-2xl border-r-0 shadow-[-4px_0_15px_rgba(0,0,0,0.5)]'
              : dockPosition === 'top'
              ? 'top-0 left-1/2 -translate-x-1/2 rounded-b-2xl border-t-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)]'
              : 'bottom-0 left-1/2 -translate-x-1/2 rounded-t-2xl border-b-0 shadow-[0_-4px_15px_rgba(0,0,0,0.5)]'
          }`}
        >
          {dockPosition === 'left' && <ChevronRight className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
          {dockPosition === 'right' && <ChevronLeft className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
          {dockPosition === 'top' && <ChevronDown className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
          {dockPosition === 'bottom' && <ChevronUp className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
        </button>
      )}

      <nav
        className={`fixed z-50 flex items-center gap-2 p-2 rounded-2xl bg-gray-900/85 backdrop-blur-xl border border-gray-800/90 shadow-2xl transition-all duration-300 ease-in-out ${positionClasses}`}
      >
        {/* Brand Icon & Quick HUD Trigger */}
        <div className="relative flex items-center justify-center p-1">
          <button
            type="button"
            onClick={() => setIsQuickMenuOpen(!isQuickMenuOpen)}
            title="Ambiently Quick Hub & Kiosk Controls"
            className={`rounded-xl p-0.5 transition-all cursor-pointer group active:scale-95 ${
              isQuickMenuOpen
                ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/30'
                : 'hover:ring-1 hover:ring-blue-400/50'
            }`}
          >
            <img
              src="/logo.png"
              alt="Ambiently"
              className="w-7 h-7 rounded-lg object-cover shadow-sm border border-gray-700/60 group-hover:scale-105 transition-transform"
            />
          </button>

          {/* Ambient Quick Command Popover */}
          <AmbientQuickMenu
            dockPosition={dockPosition}
            isOpen={isQuickMenuOpen}
            onClose={() => setIsQuickMenuOpen(false)}
            onSelectTab={(tabId) => {
              setIsQuickMenuOpen(false);
              onSelectTab(tabId);
            }}
            onOpenSettings={onOpenSettings}
            onToggleFullscreen={onToggleFullscreen}
            isFullscreen={isFullscreen}
            onToggleMobileCompanion={onToggleMobileCompanion}
          />
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-0.5' : 'h-6 w-px mx-0.5'}`}
        />

        {/* Tab Switcher Icons */}
        <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const hasExplicitHome = tabs.some((t) => t.isHome);
            const isHome = tab.isHome || (!hasExplicitHome && idx === 0);
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setIsQuickMenuOpen(false);
                  onSelectTab(tab.id);
                }}
                title={isHome ? `${tab.name} (Home Board)` : tab.name}
                className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                }`}
              >
                {tab.icon && iconMap[tab.icon] ? iconMap[tab.icon] : <LayoutGrid className="w-5 h-5" />}
                {/* Home Indicator Dot (when inactive) */}
                {isHome && !isActive && (
                  <span
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_4px_rgba(192,132,252,0.8)]"
                    title="Home Board"
                  />
                )}
                {/* Active Dot indicator */}
                {isActive && (
                  <span
                    className={`absolute w-1.5 h-1.5 rounded-full bg-white ${
                      dockPosition === 'left'
                        ? '-left-1'
                        : dockPosition === 'right'
                        ? '-right-1'
                        : dockPosition === 'top'
                        ? '-top-1'
                        : '-bottom-1'
                    }`}
                  />
                )}
              </button>
            );
          })}

          {/* Create New Canvas Button */}
          {onOpenAddCanvas && (
            <button
              onClick={onOpenAddCanvas}
              title="Create New Canvas"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-emerald-400 hover:text-white hover:bg-emerald-600/30 transition-all border border-emerald-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-0.5' : 'h-6 w-px mx-0.5'}`}
        />

        {/* Board Creation & Organization Actions: Pin Note, Add Tile, Auto-Organize & Trash */}
        <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          {onOpenCreateNote && (
            <button
              onClick={onOpenCreateNote}
              title="New Sticky Note"
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
            >
              <StickyNote className="w-4 h-4" />
            </button>
          )}

          {onOpenAddWidget && (
            <button
              onClick={onOpenAddWidget}
              title="Add Widget Tile to Canvas"
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-all cursor-pointer"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          )}

          {onAutoOrganize && (
            <button
              onClick={() => {
                onAutoOrganize(activeMode);
                setShowOrganizeMenu(true);
              }}
              title="Auto-Organize / Auto-Tile (Zero Overlap)"
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition-all cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
            </button>
          )}

          {onOpenTrash && trashCount > 0 && (
            <button
              onClick={onOpenTrash}
              title={`Archived & Expired Notes (${trashCount})`}
              className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-gray-950 font-mono font-bold text-[10px] flex items-center justify-center">
                {trashCount}
              </span>
            </button>
          )}
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-0.5' : 'h-6 w-px mx-0.5'}`}
        />

        {/* Quick Utilities / Kiosk controls */}
        <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          <button
            onClick={onToggleNightMode}
            title="Toggle Night Mode"
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all cursor-pointer"
          >
            <Moon className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Kiosk'}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenSettings}
            title="Settings & Lock"
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all cursor-pointer"
          >
            {isLocked ? <Lock className="w-4 h-4 text-blue-400" /> : <Settings className="w-4 h-4" />}
          </button>

          {onToggleDockHidden && (
            <button
              onClick={onToggleDockHidden}
              title="Hide Navigation Toolbar (Shortcut: \)"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all cursor-pointer"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}
        </div>
      </nav>

      {/* Auto-Organize Mode Switcher & Undo Floating Bar */}
      {showOrganizeMenu && onAutoOrganize && (
        <div
          className={`fixed z-40 flex items-center gap-1.5 p-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-purple-500/40 shadow-2xl ${popoverPositionClasses}`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 px-1.5">
            Layout:
          </span>
          {(
            [
              { id: 'bento', label: 'Bento Grid' },
              { id: 'pack', label: 'Keep Sizes' },
              { id: 'split', label: 'Split (Widgets | Notes)' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setActiveMode(opt.id);
                onAutoOrganize(opt.id);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeMode === opt.id
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-gray-800 text-gray-300 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {canUndoOrganize && onUndoOrganize && (
            <button
              type="button"
              onClick={() => {
                onUndoOrganize();
                setShowOrganizeMenu(false);
              }}
              title="Restore previous manual layout"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}
        </div>
      )}
    </>
  );
};
