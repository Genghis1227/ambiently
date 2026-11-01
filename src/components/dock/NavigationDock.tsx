import React from 'react';
import {
  LayoutGrid,
  Pin,
  Image,
  Calendar,
  Settings,
  Lock,
  Moon,
  Maximize2,
  Minimize2,
  FolderSync,
} from 'lucide-react';
import type { DashboardTab, DockPosition } from '../../types/dashboard';

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
  onConnectFile: () => void;
  hasFileBound: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  LayoutGrid: <LayoutGrid className="w-5 h-5" />,
  Pin: <Pin className="w-5 h-5" />,
  Image: <Image className="w-5 h-5" />,
  Calendar: <Calendar className="w-5 h-5" />,
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
  onConnectFile,
  hasFileBound,
}) => {
  const isVertical = dockPosition === 'left' || dockPosition === 'right';

  const positionClasses = {
    left: 'left-3 top-1/2 -translate-y-1/2 flex-col',
    right: 'right-3 top-1/2 -translate-y-1/2 flex-col',
    top: 'top-3 left-1/2 -translate-x-1/2 flex-row',
    bottom: 'bottom-3 left-1/2 -translate-x-1/2 flex-row',
  }[dockPosition];

  return (
    <nav
      className={`fixed z-30 flex items-center gap-2 p-2 rounded-2xl bg-gray-900/80 backdrop-blur-xl border border-gray-800/90 shadow-2xl transition-all ${positionClasses}`}
    >
      {/* Tab Switcher Icons */}
      <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              title={tab.name}
              className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/70'
              }`}
            >
              {tab.icon && iconMap[tab.icon] ? iconMap[tab.icon] : <LayoutGrid className="w-5 h-5" />}
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
      </div>

      <div
        className={`bg-gray-800 ${isVertical ? 'w-6 h-px my-1' : 'h-6 w-px mx-1'}`}
      />

      {/* Quick Utilities / Kiosk controls */}
      <div className={`flex items-center gap-1.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
        <button
          onClick={onConnectFile}
          title={hasFileBound ? 'Local file auto-sync active' : 'Click to bind local ambiently-data.json'}
          className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
            hasFileBound
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-amber-400 hover:bg-amber-500/10'
          }`}
        >
          <FolderSync className="w-4 h-4" />
          {!hasFileBound && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={onToggleNightMode}
          title="Toggle Night Mode"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all"
        >
          <Moon className="w-4 h-4" />
        </button>

        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Kiosk'}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings & Lock"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-800/70 transition-all"
        >
          {isLocked ? <Lock className="w-4 h-4 text-blue-400" /> : <Settings className="w-4 h-4" />}
        </button>
      </div>
    </nav>
  );
};
