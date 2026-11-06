import { useEffect, useState, lazy, Suspense } from 'react';
import { Lock } from 'lucide-react';
import { useDashboardStore } from './store/dashboardStore';
import { NavigationDock } from './components/dock/NavigationDock';
import { Corkboard } from './components/layout/Corkboard';
import { PinOverlay } from './components/kiosk/PinOverlay';
import { NightMode } from './components/kiosk/NightMode';
import { MobileCompanion } from './components/mobile/MobileCompanion';
import { openLocalFileBinding, useFileSync, checkFileBindingStatus } from './services/fileSync';
import { subscribeToRealtimeBoard, joinBoardByCode } from './services/supabase';
import { useIdleCursor } from './hooks/useIdleCursor';
import { isCanvasThemeLight } from './data/canvasThemes';

const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const LocalBackupModal = lazy(() =>
  import('./components/kiosk/LocalBackupModal').then((m) => ({ default: m.LocalBackupModal }))
);
const AddWidgetModal = lazy(() =>
  import('./components/widgets/AddWidgetModal').then((m) => ({ default: m.AddWidgetModal }))
);
const CreateCanvasModal = lazy(() =>
  import('./components/dock/CreateCanvasModal').then((m) => ({ default: m.CreateCanvasModal }))
);

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
  const [pinChallenge, setPinChallenge] = useState<{
    action: 'exit_fullscreen' | 'open_settings';
    title?: string;
    subtitle?: string;
  } | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isCreateCanvasOpen, setIsCreateCanvasOpen] = useState(false);
  const [isNoteCreatorOpen, setIsNoteCreatorOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const fileSync = useFileSync();
  const hasFileBound = fileSync.status === 'connected';
  const syncRemoteNoteChange = useDashboardStore((s) => s.syncRemoteNoteChange);

  // Initialize and check persistent PC Auto-Sync file binding
  useEffect(() => {
    checkFileBindingStatus();
  }, []);

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

  // Ambient Kiosk & Night Mode Idle Cursor Auto-Hide
  useIdleCursor({
    enabled: settings.autoHideCursor !== false,
    timeoutMs: (settings.cursorIdleTimeoutSec || 3) * 1000,
    nightModeTimeoutMs: 1200,
    isNightMode: settings.nightModeEnabled,
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Granular kiosk & protection controls
  const isFullscreenKioskLocked = Boolean(settings.pinLockEnabled && settings.lockFullscreenKiosk !== false);
  const isSettingsLocked = Boolean(settings.pinLockEnabled && settings.lockSettingsAccess !== false);
  const isCanvasLocked = Boolean(settings.lockCanvasEditing);

  // Keyboard shortcuts:
  // '\' (backslash) to toggle toolbar visibility
  // '1'-'9' and '0' (for 10) to switch between canvases
  // Escape to prompt PIN if in fullscreen and kiosk fullscreen lock is enabled
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input, textarea, [contenteditable="true"], [role="dialog"]')
      ) {
        return;
      }

      if (e.key === 'Escape' && isFullscreenKioskLocked && document.fullscreenElement) {
        e.preventDefault();
        setPinChallenge({
          action: 'exit_fullscreen',
          title: 'Exit Fullscreen Kiosk',
          subtitle: 'Enter parent PIN to exit fullscreen',
        });
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      if (e.key === '\\') {
        e.preventDefault();
        toggleDockHidden();
        return;
      }

      // Hotkey numbers from 1 to 10 to flip through canvases
      if (/^[0-9]$/.test(e.key)) {
        const index = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        const activeTabs = tabs.filter((t) => !t.deleted_at);
        if (activeTabs[index]) {
          e.preventDefault();
          setActiveTabId(activeTabs[index].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDockHidden, tabs, setActiveTabId, isFullscreenKioskLocked]);

  // Fullscreen state listener + Keyboard Lock API (Chromium / Edge / Chrome Kiosk)
  useEffect(() => {
    const onFullscreenChange = () => {
      const isNowFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(isNowFullscreen);

      if (isNowFullscreen && 'keyboard' in navigator && (navigator as any).keyboard?.lock) {
        (navigator as any).keyboard.lock(['Escape']).catch(() => {});
      } else if (!isNowFullscreen && 'keyboard' in navigator && (navigator as any).keyboard?.unlock) {
        (navigator as any).keyboard.unlock();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Prevent context menu (right click / long press) when kiosk fullscreen lock is enabled to prevent kids accessing browser menu
  useEffect(() => {
    if (!isFullscreenKioskLocked) return;
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [isFullscreenKioskLocked]);

  // Auto return to fullscreen on next tap/touch if kiosk fullscreen lock is active and screen is not in fullscreen
  useEffect(() => {
    if (!isFullscreenKioskLocked) return;

    const handlePointerDown = () => {
      if (!document.fullscreenElement && !pinChallenge && !isSettingsOpen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isFullscreenKioskLocked, pinChallenge, isSettingsOpen]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
      setIsFullscreen(true);
    } else {
      // If kid-proof kiosk fullscreen lock is enabled, exiting fullscreen requires the parent PIN!
      if (isFullscreenKioskLocked) {
        setPinChallenge({
          action: 'exit_fullscreen',
          title: 'Exit Fullscreen Kiosk',
          subtitle: 'Enter parent PIN to exit fullscreen',
        });
        return;
      }
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const handleOpenSettings = () => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_settings',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to access settings & controls',
      });
      return;
    }
    setIsSettingsOpen(true);
  };

  const handlePinUnlock = async (enteredPin: string) => {
    const success = await unlockKiosk(enteredPin);
    if (success) {
      if (pinChallenge?.action === 'exit_fullscreen') {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
          setIsFullscreen(false);
        }
      } else if (pinChallenge?.action === 'open_settings') {
        setIsSettingsOpen(true);
      }
      setPinChallenge(null);
      return true;
    }
    return false;
  };

  const handleConnectFile = async () => {
    await openLocalFileBinding();
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
          onOpenSettings={handleOpenSettings}
        />
        {isSettingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
            />
          </Suspense>
        )}
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

  const isCanvasLight = isCanvasThemeLight(activeTab?.backgroundTheme);

  return (
    <div
      onPointerDown={() => {
        if (settings.carouselEnabled) {
          pauseCarouselTemporarily(20000);
        }
      }}
      className={`relative w-screen h-screen overflow-hidden ${
        isCanvasLight ? 'bg-slate-100 text-slate-800' : 'bg-[#090d16] text-white'
      } select-none`}
    >
      {/* Semantic Screen-Reader & Crawler Heading Hierarchy */}
      <header className="sr-only">
        <h1>{settings.dashboardTitle || 'Ambiently — Smart Display, Family Calendar & Wall Dashboard'}</h1>
        <p>
          Self-hosted, offline-first ambient smart display and digital family command center for wall monitors or tablets.
        </p>
      </header>

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
          isCanvasLocked={isCanvasLocked}
        />
      </div>

      {/* Navigation Dock - Pinned at Viewport Level (Never obscures canvas tiles) */}
      <NavigationDock
        tabs={visibleTabs}
        activeTabId={activeTabIdResolved}
        dockPosition={settings.dockPosition}
        isLocked={Boolean(settings.pinLockEnabled)}
        isCanvasLocked={isCanvasLocked}
        onSelectTab={setActiveTabId}
        onOpenSettings={handleOpenSettings}
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

      {/* Kiosk Fullscreen Warning Banner when kiosk lock is enabled but not in fullscreen */}
      {isFullscreenKioskLocked && !isFullscreen && !pinChallenge && (
        <div
          onClick={() => {
            document.documentElement.requestFullscreen().catch(() => {});
          }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center gap-2 cursor-pointer animate-pulse"
        >
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Kid Lock Active • Tap anywhere to return to Fullscreen</span>
        </div>
      )}

      {/* Kid-Proof Kiosk PIN Challenge Overlay */}
      {pinChallenge && (
        <PinOverlay
          title={pinChallenge.title}
          subtitle={pinChallenge.subtitle}
          onUnlock={handlePinUnlock}
          onForgotChallenge={() => {
            unlockKiosk('');
            if (pinChallenge.action === 'exit_fullscreen') {
              if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
              }
            } else if (pinChallenge.action === 'open_settings') {
              setIsSettingsOpen(true);
            }
            setPinChallenge(null);
          }}
          onCancel={() => setPinChallenge(null)}
        />
      )}

      <Suspense fallback={null}>
        {/* Local Backup Info Modal */}
        {isBackupModalOpen && (
          <LocalBackupModal
            isOpen={isBackupModalOpen}
            hasFileBound={hasFileBound}
            onClose={() => setIsBackupModalOpen(false)}
            onSelectLocation={handleConnectFile}
          />
        )}

        {/* Add Widget Catalog Modal */}
        {isAddWidgetOpen && (
          <AddWidgetModal
            isOpen={isAddWidgetOpen}
            onClose={() => setIsAddWidgetOpen(false)}
            activeTabId={activeTabIdResolved}
            onAddWidget={addWidget}
          />
        )}

        {isCreateCanvasOpen && (
          <CreateCanvasModal
            isOpen={isCreateCanvasOpen}
            onClose={() => setIsCreateCanvasOpen(false)}
            existingCanvasCount={tabs.length}
            onCreateCanvas={(name, icon, theme, wallpaperUrl, dimLevel) => {
              addTab(name, icon, theme, wallpaperUrl, dimLevel);
            }}
          />
        )}

        {/* Settings & Customization Modal */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
