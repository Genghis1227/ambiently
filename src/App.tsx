import { useEffect, useState } from 'react';
import { useDashboardStore } from './store/dashboardStore';
import { NavigationDock } from './components/dock/NavigationDock';
import { Corkboard } from './components/layout/Corkboard';
import { PinOverlay } from './components/kiosk/PinOverlay';
import { NightMode } from './components/kiosk/NightMode';
import { SettingsModal } from './components/settings/SettingsModal';
import { LocalBackupModal } from './components/kiosk/LocalBackupModal';
import { MobileCompanion } from './components/mobile/MobileCompanion';
import { AddWidgetModal } from './components/widgets/AddWidgetModal';
import { CreateCanvasModal } from './components/dock/CreateCanvasModal';
import { openLocalFileBinding } from './services/fileSync';
import { subscribeToRealtimeBoard, joinBoardByCode } from './services/supabase';

export function App() {
  const {
    isInitialized,
    initStore,
    settings,
    tabs,
    activeTabId,
    widgets,
    notes,
    setActiveTabId,
    unlockKiosk,
    isUnlocked,
    isCarouselPaused,
    pauseCarouselTemporarily,
    toggleNightModeManual,
    updateSettings,
    updateNotePosition,
    updateWidgetPosition,
    addWidget,
    removeWidget,
    updateWidget,
    addNote,
    updateNote,
    deleteNote,
    permanentlyDeleteNote,
    addTab,
    updateTab,
    autoOrganizeCanvas,
    undoAutoOrganize,
    lastLayoutSnapshot,
    toggleDockHidden,
  } = useDashboardStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isCreateCanvasOpen, setIsCreateCanvasOpen] = useState(false);
  const [isNoteCreatorOpen, setIsNoteCreatorOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [hasFileBound, setHasFileBound] = useState(false);
  const syncRemoteNoteChange = useDashboardStore((s) => s.syncRemoteNoteChange);

  // Auto-join shared board if ?join=CODE is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      joinBoardByCode(joinCode).then((res) => {
        if (res.success) {
          console.log('Connected to shared board:', res.boardTitle);
          initStore();
        }
      });
    }
  }, [initStore]);

  // Live Supabase Realtime WebSocket subscription
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeBoard('default', (note, eventType) => {
      syncRemoteNoteChange(note, eventType);
    });
    return () => unsubscribe();
  }, [syncRemoteNoteChange]);

  // Responsive Mobile Detection (< 768px) with manual toggle override
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [forceDesktopMode, setForceDesktopMode] = useState(false);

  useEffect(() => {
    initStore();
  }, [initStore]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcut: '\' (backslash) to toggle toolbar visibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input, textarea, [contenteditable="true"]')
        ) {
          return;
        }
        e.preventDefault();
        toggleDockHidden();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDockHidden]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleConnectFile = async () => {
    const res = await openLocalFileBinding();
    if (res.success) {
      setHasFileBound(true);
    }
  };

  // Screen Wake Lock API for always-on ambient smart display
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && settings.wakeLockEnabled) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err: any) {
          console.warn('Wake Lock request error:', err.message);
        }
      }
    };

    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [settings.wakeLockEnabled]);

  // Scheduled Night Mode Checker (checks every 60s for exact start/end transitions)
  useEffect(() => {
    if (!settings.nightModeStart || !settings.nightModeEnd) return;

    const checkSchedule = () => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentHHMM === settings.nightModeStart && !settings.nightModeEnabled) {
        updateSettings({ nightModeEnabled: true });
      } else if (currentHHMM === settings.nightModeEnd && settings.nightModeEnabled) {
        updateSettings({ nightModeEnabled: false });
      }
    };

    const timer = setInterval(checkSchedule, 60000);
    return () => clearInterval(timer);
  }, [settings.nightModeStart, settings.nightModeEnd, settings.nightModeEnabled, updateSettings]);

  const visibleTabs = tabs.filter((t) =>
    t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false
  );

  // Tab auto-carousel rotation (pauses automatically when user interacts)
  useEffect(() => {
    if (!settings.carouselEnabled || isCarouselPaused || visibleTabs.length <= 1) return;

    const currentTab = visibleTabs.find((t) => t.id === activeTabId);
    const duration = currentTab?.autoRotateDurationSec || settings.defaultRotateDurationSec || 30;

    const interval = setInterval(() => {
      const currentIndex = visibleTabs.findIndex((t) => t.id === activeTabId);
      const nextIndex = (currentIndex + 1) % visibleTabs.length;
      setActiveTabId(visibleTabs[nextIndex].id);
    }, duration * 1000);

    return () => clearInterval(interval);
  }, [settings.carouselEnabled, isCarouselPaused, settings.defaultRotateDurationSec, visibleTabs, activeTabId, setActiveTabId]);

  if (!isInitialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-950 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-400">Loading Ambiently Display...</p>
        </div>
      </div>
    );
  }

  const homeTab = visibleTabs.find((t) => t.isHome) || visibleTabs[0] || tabs[0];
  const activeTab = visibleTabs.find((t) => t.id === activeTabId) || homeTab;
  const activeTabIdResolved = activeTab?.id || 'tab-corkboard';
  const tabWidgets = widgets.filter((w) => w.tabId === activeTabIdResolved);

  // 1. Mobile Companion Mode on small screens unless user specifically toggled Desktop
  if (isMobileViewport && !forceDesktopMode) {
    return (
      <>
        <MobileCompanion
          tabs={visibleTabs}
          activeTabId={activeTabIdResolved}
          notes={notes}
          widgets={tabWidgets}
          onSelectTab={setActiveTabId}
          onAddNote={addNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onUpdateWidget={updateWidget}
          onRemoveWidget={removeWidget}
          onAddWidget={addWidget}
          onToggleDesktopView={() => setForceDesktopMode(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </>
    );
  }

  // Strict per-canvas sticky notes (plus notes explicitly pinned to 'all' canvases)
  const activeCanvasNotes = notes.filter(
    (n) => (n.tabId || 'tab-corkboard') === activeTabIdResolved || n.tabId === 'all'
  );

  const now = new Date();
  const trashCount = activeCanvasNotes.filter(
    (n) => n.archivedAt || (n.expiresAt && new Date(n.expiresAt) <= now)
  ).length;

  // Dynamic padding based on Dock position (omitted if dock is hidden for full immersion)
  const dockPaddingClasses = settings.isDockHidden
    ? ''
    : {
        left: 'pl-20',
        right: 'pr-20',
        top: 'pt-20',
        bottom: 'pb-20',
      }[settings.dockPosition];

  return (
    <div
      onPointerDown={() => {
        if (settings.carouselEnabled) {
          pauseCarouselTemporarily(20000);
        }
      }}
      className="relative w-screen h-screen overflow-hidden bg-[#090d16] select-none"
    >
      {/* Full native 1:1 Canvas */}
      <div className="w-full h-full">
        <Corkboard
          notes={activeCanvasNotes}
          widgets={tabWidgets}
          tabs={visibleTabs}
          activeTabId={activeTabIdResolved}
          dockPaddingClass={dockPaddingClasses}
          backgroundTheme={activeTab?.backgroundTheme || 'midnight_dots'}
          customWallpaperUrl={activeTab?.customWallpaperUrl}
          backgroundDimLevel={activeTab?.backgroundDimLevel ?? 45}
          hideNotes={Boolean(activeTab?.hideNotes)}
          isCreatorOpen={isNoteCreatorOpen}
          onOpenCreator={() => setIsNoteCreatorOpen(true)}
          onCloseCreator={() => setIsNoteCreatorOpen(false)}
          isTrashOpen={isTrashOpen}
          onCloseTrash={() => setIsTrashOpen(false)}
          onUpdateNotePos={updateNotePosition}
          onUpdateWidgetPos={updateWidgetPosition}
          onAddNote={addNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onPermanentlyDeleteNote={permanentlyDeleteNote}
          onRemoveWidget={removeWidget}
          onOpenAddWidget={() => setIsAddWidgetOpen(true)}
          onUpdateWidget={updateWidget}
          onUpdateTab={updateTab}
          snapToGrid={settings.snapToGrid}
        />
      </div>

      {/* Navigation Dock - Pinned at Viewport Level (Never obscures canvas tiles) */}
      <NavigationDock
        tabs={visibleTabs}
        activeTabId={activeTabIdResolved}
        dockPosition={settings.dockPosition}
        isLocked={!isUnlocked}
        onSelectTab={setActiveTabId}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleNightMode={toggleNightModeManual}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        onConnectFile={() => setIsBackupModalOpen(true)}
        hasFileBound={hasFileBound}
        onOpenAddWidget={() => setIsAddWidgetOpen(true)}
        onOpenAddCanvas={() => setIsCreateCanvasOpen(true)}
        onOpenCreateNote={() => setIsNoteCreatorOpen(true)}
        onOpenTrash={() => setIsTrashOpen(true)}
        trashCount={trashCount}
        onAutoOrganize={(mode) => autoOrganizeCanvas(activeTabIdResolved, mode)}
        onUndoOrganize={undoAutoOrganize}
        canUndoOrganize={lastLayoutSnapshot?.tabId === activeTabIdResolved}
        onToggleMobileCompanion={isMobileViewport ? () => setForceDesktopMode(false) : undefined}
        isDockHidden={settings.isDockHidden}
        onToggleDockHidden={toggleDockHidden}
        isNightMode={settings.nightModeEnabled}
      />

      {/* Night Mode Screen Overlay */}
      <NightMode
        enabled={settings.nightModeEnabled}
        style={settings.nightModeStyle}
        dimOpacity={settings.nightDimOpacity}
        onWake={toggleNightModeManual}
      />

      {/* Kiosk PIN Lock Overlay */}
      {!isUnlocked && (
        <PinOverlay
          onUnlock={unlockKiosk}
          onForgotChallenge={() => unlockKiosk('')}
        />
      )}

      {/* Local Backup Info Modal */}
      <LocalBackupModal
        isOpen={isBackupModalOpen}
        hasFileBound={hasFileBound}
        onClose={() => setIsBackupModalOpen(false)}
        onSelectLocation={handleConnectFile}
      />

      {/* Add Widget Catalog Modal */}
      <AddWidgetModal
        isOpen={isAddWidgetOpen}
        onClose={() => setIsAddWidgetOpen(false)}
        activeTabId={activeTabIdResolved}
        onAddWidget={addWidget}
      />

      <CreateCanvasModal
        isOpen={isCreateCanvasOpen}
        onClose={() => setIsCreateCanvasOpen(false)}
        onCreateCanvas={(name, icon, theme, wallpaperUrl, dimLevel) => {
          addTab(name, icon, theme, wallpaperUrl, dimLevel);
        }}
      />

      {/* Settings & Customization Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
