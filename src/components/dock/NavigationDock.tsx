import React, { useState, useEffect, useRef } from 'react';
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
  RotateCw,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Newspaper,
  Utensils,
  ChefHat,
  Briefcase,
  GraduationCap,
  Dumbbell,
  ShoppingCart,
  Compass,
  Baby,
  Gamepad2,
  CloudSun,
  Lightbulb,
  Bell,
  SlidersHorizontal,
  FolderPlus,
  ClipboardList,
  HelpCircle,
} from 'lucide-react';
import type {
  AutoOrganizeMode,
  DashboardTab,
  DockPosition,
} from '../../types/dashboard';
import { MAX_CANVASES } from '../../types/dashboard';
import { AmbientQuickMenu } from './AmbientQuickMenu';
import { useUpdateChecker } from '../../services/updateChecker';
import { useChoreStore, getPendingParentActionCounts } from '../../store/choreStore';

interface NavigationDockProps {
  tabs: DashboardTab[];
  activeTabId: string;
  dockPosition: DockPosition;
  isLocked: boolean;
  onSelectTab: (tabId: string) => void;
  onOpenSettings: () => void;
  /** Opens household sharing, asking for the PIN first when settings need it */
  onOpenShare: () => void;
  onToggleNightMode: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onConnectFile?: () => void;
  hasFileBound?: boolean;
  onOpenAddWidget?: () => void;
  onOpenAddCanvas?: () => void;
  onOpenCreateNote?: () => void;
  onOpenQuickStart?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  onAutoOrganize?: (mode: AutoOrganizeMode) => void;
  onUndoOrganize?: () => void;
  canUndoOrganize?: boolean;
  onToggleMobileCompanion?: () => void;
  isDockHidden?: boolean;
  onToggleDockHidden?: () => void;
  isNightMode?: boolean;
  isCanvasLocked?: boolean;
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
  Newspaper: <Newspaper className="w-5 h-5" />,
  Utensils: <Utensils className="w-5 h-5" />,
  ChefHat: <ChefHat className="w-5 h-5" />,
  Briefcase: <Briefcase className="w-5 h-5" />,
  GraduationCap: <GraduationCap className="w-5 h-5" />,
  Dumbbell: <Dumbbell className="w-5 h-5" />,
  ShoppingCart: <ShoppingCart className="w-5 h-5" />,
  Compass: <Compass className="w-5 h-5" />,
  Baby: <Baby className="w-5 h-5" />,
  Gamepad2: <Gamepad2 className="w-5 h-5" />,
  CloudSun: <CloudSun className="w-5 h-5" />,
  Lightbulb: <Lightbulb className="w-5 h-5" />,
  Bell: <Bell className="w-5 h-5" />,
};

export const NavigationDock: React.FC<NavigationDockProps> = ({
  tabs,
  activeTabId,
  dockPosition,
  isLocked,
  onSelectTab,
  onOpenSettings,
  onOpenShare,
  onToggleNightMode,
  onToggleFullscreen,
  isFullscreen,
  onOpenAddWidget,
  onOpenAddCanvas,
  onOpenCreateNote,
  onOpenQuickStart,
  onOpenTrash,
  trashCount = 0,
  onAutoOrganize,
  onUndoOrganize,
  canUndoOrganize = false,
  onToggleMobileCompanion,
  isDockHidden = false,
  onToggleDockHidden,
  isNightMode = false,
  isCanvasLocked = false,
}) => {
  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  const [showOrganizeMenu, setShowOrganizeMenu] = useState(false);
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const [activePopout, setActivePopout] = useState<'hub' | 'add' | 'utilities' | null>(null);
  const [activeMode, setActiveMode] = useState<AutoOrganizeMode>('bento');
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const { isUpdateAvailable, latestVersion, applyUpdate } = useUpdateChecker();
  const choreSnapshot = useChoreStore((s) => s.snapshot);
  const isChoreFullScreenOpen = useChoreStore((s) => s.isFullScreenOpen);
  const setChoreFullScreenOpen = useChoreStore((s) => s.setFullScreenOpen);
  const pendingChoreCounts = getPendingParentActionCounts(choreSnapshot);

  useEffect(() => {
    if (!showOrganizeMenu) return;
    const timer = window.setTimeout(() => setShowOrganizeMenu(false), 6000);
    return () => clearTimeout(timer);
  }, [showOrganizeMenu, activeMode]);

  // When dock hidden status changes from external source, reset peek
  useEffect(() => {
    if (!isDockHidden) {
      setIsPeekOpen(false);
    }
  }, [isDockHidden]);

  // When night mode activates, collapse peeked toolbar and close open menus immediately
  useEffect(() => {
    if (isNightMode) {
      setIsQuickMenuOpen(false);
      setShowOrganizeMenu(false);
      setActivePopout(null);
      if (isDockHidden) {
        setIsPeekOpen(false);
      }
    }
  }, [isNightMode, isDockHidden]);

  // Mouse leave timer to auto-hide when moving away from the toolbar
  const hideTimerRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (isDockHidden && isPeekOpen) {
      if (isQuickMenuOpen) return;
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setIsPeekOpen(false);
        setActivePopout(null);
      }, isNightMode ? 350 : 500);
    }
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // Close pop-out panels or auto-hide peeked dock when clicking outside or pressing Escape
  useEffect(() => {
    if ((!isDockHidden || !isPeekOpen) && !activePopout && !showOrganizeMenu) return;

    const handlePointerDownOutside = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore clicks within the dock itself, quick menus, or open dialogs/modals
      if (
        navRef.current?.contains(target) ||
        target.closest('[data-dock-element="true"]') ||
        target.closest('[role="dialog"]')
      ) {
        return;
      }

      setActivePopout(null);
      setShowOrganizeMenu(false);
      if (isDockHidden && isPeekOpen) {
        setIsPeekOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopout(null);
        setShowOrganizeMenu(false);
        if (isDockHidden && isPeekOpen) {
          setIsPeekOpen(false);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDockHidden, isPeekOpen, activePopout, showOrganizeMenu]);

  // If dock is hidden, it is effectively hidden unless the user has peeked it open
  const isEffectivelyHidden = isDockHidden && !isPeekOpen;

  const positionClasses = {
    left: `left-3 top-1/2 flex-col ${
      isEffectivelyHidden
        ? '-translate-y-1/2 -translate-x-[220%] opacity-0 pointer-events-none'
        : '-translate-y-1/2 translate-x-0 opacity-100'
    }`,
    right: `right-3 top-1/2 flex-col ${
      isEffectivelyHidden
        ? '-translate-y-1/2 translate-x-[220%] opacity-0 pointer-events-none'
        : '-translate-y-1/2 translate-x-0 opacity-100'
    }`,
    top: `top-3 left-1/2 flex-row ${
      isEffectivelyHidden
        ? '-translate-x-1/2 -translate-y-[220%] opacity-0 pointer-events-none'
        : '-translate-x-1/2 translate-y-0 opacity-100'
    }`,
    bottom: `bottom-3 left-1/2 flex-row ${
      isEffectivelyHidden
        ? '-translate-x-1/2 translate-y-[220%] opacity-0 pointer-events-none'
        : '-translate-x-1/2 translate-y-0 opacity-100'
    }`,
  }[dockPosition];

  const inlinePopoutPositionClasses = {
    left: 'left-full ml-3 top-1/2 -translate-y-1/2',
    right: 'right-full mr-3 top-1/2 -translate-y-1/2',
    top: 'top-full mt-3 left-1/2 -translate-x-1/2',
    bottom: 'bottom-full mb-3 left-1/2 -translate-x-1/2',
  }[dockPosition];

  const togglePopout = (panel: 'hub' | 'add' | 'utilities') => {
    setIsQuickMenuOpen(false);
    setShowOrganizeMenu(false);
    setActivePopout((prev) => (prev === panel ? null : panel));
  };

  return (
    <>
      {/* Edge Handle to Peek Hidden Toolbar */}
      {isDockHidden && !isPeekOpen && onToggleDockHidden && (
        <button
          type="button"
          data-dock-element="true"
          onClick={() => setIsPeekOpen(true)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          title="Peek Navigation Toolbar (Shortcut: \)"
          className={`fixed z-[65] flex items-center justify-center p-2.5 backdrop-blur-xl transition-all cursor-pointer group active:scale-95 ${
            isNightMode
              ? 'bg-gray-950/40 hover:bg-gray-900/80 text-gray-600 hover:text-gray-300 border border-gray-900/60 opacity-30 hover:opacity-100 shadow-none'
              : 'bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700/80 shadow-2xl'
          } ${
            dockPosition === 'left'
              ? 'left-0 bottom-24 rounded-r-2xl border-l-0 shadow-[4px_0_15px_rgba(0,0,0,0.5)]'
              : dockPosition === 'right'
              ? 'right-0 bottom-24 rounded-l-2xl border-r-0 shadow-[-4px_0_15px_rgba(0,0,0,0.5)]'
              : dockPosition === 'top'
              ? 'top-0 right-24 rounded-b-2xl border-t-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)]'
              : 'bottom-0 right-24 rounded-t-2xl border-b-0 shadow-[0_-4px_15px_rgba(0,0,0,0.5)]'
          }`}
        >
          {dockPosition === 'left' && <ChevronRight className={`w-5 h-5 ${isNightMode ? 'text-blue-500/30 group-hover:text-blue-400' : 'text-blue-400'} group-hover:scale-110 transition-transform`} />}
          {dockPosition === 'right' && <ChevronLeft className={`w-5 h-5 ${isNightMode ? 'text-blue-500/30 group-hover:text-blue-400' : 'text-blue-400'} group-hover:scale-110 transition-transform`} />}
          {dockPosition === 'top' && <ChevronDown className={`w-5 h-5 ${isNightMode ? 'text-blue-500/30 group-hover:text-blue-400' : 'text-blue-400'} group-hover:scale-110 transition-transform`} />}
          {dockPosition === 'bottom' && <ChevronUp className={`w-5 h-5 ${isNightMode ? 'text-blue-500/30 group-hover:text-blue-400' : 'text-blue-400'} group-hover:scale-110 transition-transform`} />}
        </button>
      )}

      <nav
        ref={navRef}
        data-dock-element="true"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed z-[65] flex items-center gap-2 p-2 rounded-2xl backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isNightMode
            ? 'opacity-85 hover:opacity-100 bg-gray-950/95 border border-gray-900 shadow-xl'
            : 'bg-gray-900/85 border border-gray-800/90 shadow-2xl'
        } ${positionClasses}`}
      >
        {/* Brand Icon & Quick HUD Trigger */}
        <div className="relative flex items-center justify-center p-1">
          <button
            type="button"
            onClick={() => {
              setActivePopout(null);
              setShowOrganizeMenu(false);
              setIsQuickMenuOpen(!isQuickMenuOpen);
            }}
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
              setActivePopout(null);
              onSelectTab(tabId);
            }}
            onOpenSettings={onOpenSettings}
            onOpenShare={onOpenShare}
            onToggleFullscreen={onToggleFullscreen}
            isFullscreen={isFullscreen}
            onToggleMobileCompanion={onToggleMobileCompanion}
            onOpenQuickStart={onOpenQuickStart}
          />
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-0.5' : 'h-6 w-px mx-0.5'}`}
        />

        {/* Tab Switcher Icons (Canvases stay directly on main toolbar) */}
        <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            const hasExplicitHome = tabs.some((t) => t.isHome);
            const isHome = tab.isHome || (!hasExplicitHome && idx === 0);
            const hotkeyLabel = idx === 9 ? '0' : idx < 9 ? String(idx + 1) : '';
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setIsQuickMenuOpen(false);
                  setActivePopout(null);
                  onSelectTab(tab.id);
                }}
                title={
                  isHome
                    ? `${tab.name} (Home Board)${hotkeyLabel ? ` [Key: ${hotkeyLabel}]` : ''}`
                    : `${tab.name}${hotkeyLabel ? ` [Key: ${hotkeyLabel}]` : ''}`
                }
                className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                }`}
              >
                {tab.icon && iconMap[tab.icon] ? iconMap[tab.icon] : <LayoutGrid className="w-5 h-5" />}
                {/* Home Indicator Icon */}
                {isHome && (
                  <span
                    className={`absolute -top-1 -right-1 p-0.5 rounded-full flex items-center justify-center shadow-md transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white ring-2 ring-gray-950'
                        : 'bg-gray-800 text-purple-300 border border-purple-500/40'
                    }`}
                    title="Home Board"
                  >
                    <Home className="w-2.5 h-2.5 stroke-[2.5]" />
                  </span>
                )}
                {/* Hotkey number indicator (1-9, 0) */}
                {hotkeyLabel && (
                  <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold opacity-40 group-hover:opacity-90 transition-opacity pointer-events-none">
                    {hotkeyLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-1' : 'h-6 w-px mx-1'}`}
        />

        {/* Dedicated Middle Hub Section: Pop-out launcher for Chores & Rewards + upcoming Meal Planner */}
        <div
          className={`relative flex items-center justify-center ${
            isVertical ? 'py-0.5' : 'px-0.5'
          }`}
        >
          <button
            type="button"
            onClick={() => togglePopout('hub')}
            title={
              pendingChoreCounts.totalPendingCount > 0
                ? `Family Hub: Chores & Meal Planning (${pendingChoreCounts.totalPendingCount} awaiting parent review)`
                : 'Family Hub: Chores & Meal Planning'
            }
            className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all cursor-pointer border ${
              isChoreFullScreenOpen || activePopout === 'hub'
                ? 'bg-emerald-600 text-white border-emerald-400/60 shadow-lg shadow-emerald-500/30'
                : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            {pendingChoreCounts.totalPendingCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-gray-950 font-mono font-bold text-[10px] flex items-center justify-center shadow-md ring-1.5 ring-gray-950"
                title={`${pendingChoreCounts.totalPendingCount} pending parent actions`}
              >
                {pendingChoreCounts.totalPendingCount}
              </span>
            )}
          </button>

          {/* Horizontal Pop-Out Panel: Chores & Rewards + Meal Planner */}
          {activePopout === 'hub' && (
            <div
              data-dock-element="true"
              className={`absolute z-50 flex flex-row items-center gap-2 p-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-emerald-500/40 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${inlinePopoutPositionClasses}`}
            >
              <button
                type="button"
                onClick={() => {
                  setActivePopout(null);
                  setChoreFullScreenOpen(!isChoreFullScreenOpen);
                }}
                title={
                  pendingChoreCounts.totalPendingCount > 0
                    ? `Family Chores & Rewards (${pendingChoreCounts.totalPendingCount} awaiting parent review)`
                    : 'Family Chores & Rewards'
                }
                className={`relative flex items-center gap-2 px-3 h-10 rounded-xl transition-all cursor-pointer border whitespace-nowrap ${
                  isChoreFullScreenOpen
                    ? 'bg-emerald-600 text-white border-emerald-400/60 shadow-md shadow-emerald-500/30'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                <span className="text-xs font-semibold">Chores & Rewards</span>
                {pendingChoreCounts.totalPendingCount > 0 && (
                  <span className="min-w-[18px] h-4.5 px-1 rounded-full bg-amber-500 text-gray-950 font-mono font-bold text-[10px] flex items-center justify-center">
                    {pendingChoreCounts.totalPendingCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                disabled
                title="Weekly Meal Planner (Coming Soon)"
                className="relative flex items-center gap-2 px-3 h-10 rounded-xl bg-gray-800/60 text-gray-400 border border-gray-700/60 opacity-75 cursor-not-allowed whitespace-nowrap"
              >
                <Utensils className="w-4 h-4 shrink-0 text-amber-400/70" />
                <span className="text-xs font-semibold">Meal Planner</span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-700/80 text-gray-300">
                  Soon
                </span>
              </button>
            </div>
          )}
        </div>

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-1' : 'h-6 w-px mx-1'}`}
        />

        {/* Board Creation & Organization Actions: '+' Pop-out (Note, Widget, Canvas), Auto-Organize & Archive */}
        {isCanvasLocked ? (
          <div
            title="Canvas layout & editing is locked (tiles, positions, and creation disabled)"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-xs"
          >
            <Lock className="w-4 h-4" />
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
            {/* '+' Add Menu Trigger & Horizontal Pop-Out Panel */}
            {(onOpenCreateNote || onOpenAddWidget || onOpenAddCanvas) && (
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => togglePopout('add')}
                  title="Add Note, Widget, or Canvas"
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer border ${
                    activePopout === 'add'
                      ? 'bg-blue-600 text-white border-blue-400/60 shadow-lg shadow-blue-500/30'
                      : 'bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border-blue-500/30'
                  }`}
                >
                  <Plus
                    className={`w-5 h-5 transition-transform duration-200 ${
                      activePopout === 'add' ? 'rotate-45' : ''
                    }`}
                  />
                </button>

                {activePopout === 'add' && (
                  <div
                    data-dock-element="true"
                    className={`absolute z-50 flex flex-row items-center gap-2 p-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-blue-500/40 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${inlinePopoutPositionClasses}`}
                  >
                    {onOpenCreateNote && (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePopout(null);
                          onOpenCreateNote();
                        }}
                        title="New Sticky Note"
                        className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all cursor-pointer group shadow-xs"
                      >
                        <StickyNote className="w-4 h-4 transition-transform group-hover:scale-105" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-gray-950 flex items-center justify-center shadow-md ring-1.5 ring-gray-950">
                          <Plus className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      </button>
                    )}

                    {onOpenAddWidget && (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePopout(null);
                          onOpenAddWidget();
                        }}
                        title="Add Widget Tile to Canvas"
                        className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-all cursor-pointer group shadow-xs"
                      >
                        <LayoutGrid className="w-4 h-4 transition-transform group-hover:scale-105" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md ring-1.5 ring-gray-950">
                          <Plus className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      </button>
                    )}

                    {onOpenAddCanvas && (
                      <button
                        type="button"
                        onClick={
                          tabs.length >= MAX_CANVASES
                            ? undefined
                            : () => {
                                setActivePopout(null);
                                onOpenAddCanvas();
                              }
                        }
                        disabled={tabs.length >= MAX_CANVASES}
                        title={
                          tabs.length >= MAX_CANVASES
                            ? 'Canvas limit reached (maximum 10 canvases allowed)'
                            : 'Create New Canvas'
                        }
                        className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all border group shadow-xs ${
                          tabs.length >= MAX_CANVASES
                            ? 'text-gray-600 border-gray-800 bg-gray-900/40 opacity-40 cursor-not-allowed'
                            : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30 cursor-pointer'
                        }`}
                      >
                        <FolderPlus className="w-4 h-4 transition-transform group-hover:scale-105" />
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-gray-950 flex items-center justify-center shadow-md ring-1.5 ring-gray-950">
                          <Plus className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {onAutoOrganize && (
              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setActivePopout(null);
                    setIsQuickMenuOpen(false);
                    onAutoOrganize(activeMode);
                    setShowOrganizeMenu(true);
                  }}
                  title="Auto-Organize / Auto-Tile (Zero Overlap)"
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer border ${
                    showOrganizeMenu
                      ? 'bg-purple-600 text-white border-purple-400/60 shadow-lg shadow-purple-500/30'
                      : 'bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 border-purple-500/30'
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                </button>

                {/* Auto-Organize Mode Switcher & Undo Horizontal Pop-Out Panel */}
                {showOrganizeMenu && (
                  <div
                    data-dock-element="true"
                    className={`absolute z-50 flex flex-row items-center gap-1.5 whitespace-nowrap p-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-purple-500/40 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${inlinePopoutPositionClasses}`}
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
              </div>
            )}

            {onOpenTrash && trashCount > 0 && (
              <button
                onClick={() => {
                  setActivePopout(null);
                  onOpenTrash();
                }}
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
        )}

        <div
          className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-0.5' : 'h-6 w-px mx-0.5'}`}
        />

        {/* Quick Utilities Pop-out & Settings/Lock */}
        <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => togglePopout('utilities')}
              title={
                isUpdateAvailable
                  ? `Quick Utilities (✨ Update v${latestVersion} available!)`
                  : 'Quick Utilities (Night Mode, Fullscreen, Refresh, Hide Toolbar)'
              }
              className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${
                activePopout === 'utilities'
                  ? 'bg-gray-700 text-white shadow-md'
                  : isUpdateAvailable
                  ? 'text-cyan-300 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 shadow-lg shadow-cyan-950/60'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {isUpdateAvailable && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500 ring-2 ring-gray-950" />
                </span>
              )}
            </button>

            {/* Horizontal Pop-Out Panel: Night Mode, Fullscreen, Refresh/Update, Hide Toolbar */}
            {activePopout === 'utilities' && (
              <div
                data-dock-element="true"
                className={`absolute z-50 flex flex-row items-center gap-1.5 p-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-gray-700/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${inlinePopoutPositionClasses}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActivePopout(null);
                    onToggleNightMode();
                    if (isDockHidden) {
                      setIsPeekOpen(false);
                    }
                  }}
                  title="Toggle Night Mode"
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${
                    isNightMode
                      ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivePopout(null);
                    onToggleFullscreen();
                  }}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Kiosk'}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${
                    isFullscreen
                      ? 'text-blue-300 bg-blue-500/15 border border-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                  }`}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActivePopout(null);
                    if (isUpdateAvailable) {
                      applyUpdate();
                    } else {
                      window.location.reload();
                    }
                  }}
                  title={
                    isUpdateAvailable
                      ? `✨ New version v${latestVersion} available! Click to refresh and apply update`
                      : 'Refresh Dashboard (Reload panel)'
                  }
                  className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${
                    isUpdateAvailable
                      ? 'text-cyan-300 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/50 shadow-lg shadow-cyan-950/60'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                  }`}
                >
                  <RotateCw className={`w-4 h-4 ${isUpdateAvailable ? 'animate-spin [animation-duration:3s]' : ''}`} />
                  {isUpdateAvailable && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500 ring-2 ring-gray-950" />
                    </span>
                  )}
                </button>

                {onToggleDockHidden && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePopout(null);
                      onToggleDockHidden();
                      setIsPeekOpen(false);
                    }}
                    title={
                      isDockHidden
                        ? 'Keep toolbar visible (Pin toolbar)'
                        : 'Hide toolbar (Shortcut: \\)'
                    }
                    className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all cursor-pointer ${
                      isDockHidden
                        ? 'text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
                    }`}
                  >
                    {isDockHidden ? (
                      <EyeOff className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                )}

                {onOpenQuickStart && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePopout(null);
                      onOpenQuickStart();
                    }}
                    title="Quick Start & How-To Guide"
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setActivePopout(null);
              setShowOrganizeMenu(false);
              onOpenSettings();
            }}
            title="Settings & Lock"
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all cursor-pointer"
          >
            {isLocked ? <Lock className="w-4 h-4 text-blue-400" /> : <Settings className="w-4 h-4" />}
          </button>
        </div>
      </nav>
    </>
  );
};
