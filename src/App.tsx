import { useEffect, useState } from 'react';
import { useDashboardStore } from './store/dashboardStore';
import { NavigationDock } from './components/dock/NavigationDock';
import { BentoGrid } from './components/layout/BentoGrid';
import { Corkboard } from './components/layout/Corkboard';
import { PinOverlay } from './components/kiosk/PinOverlay';
import { NightMode } from './components/kiosk/NightMode';
import { SettingsModal } from './components/settings/SettingsModal';
import { openLocalFileBinding } from './services/fileSync';

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
    toggleNightModeManual,
    updateNotePosition,
    addNote,
    updateNote,
    deleteNote,
    saveLocalBackup,
  } = useDashboardStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasFileBound, setHasFileBound] = useState(false);

  useEffect(() => {
    initStore();
  }, [initStore]);

  // Screen Wake Lock API integration
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && settings.wakeLockEnabled) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Screen wake lock error:', err);
      }
    };
    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [settings.wakeLockEnabled]);

  // Automated Tab Carousel
  useEffect(() => {
    if (!settings.carouselEnabled || tabs.length <= 1) return;

    const currentTab = tabs.find((t) => t.id === activeTabId);
    const duration = (currentTab?.autoRotateDurationSec || settings.defaultRotateDurationSec) * 1000;

    const timer = setInterval(() => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTabId(tabs[nextIndex].id);
    }, duration);

    return () => clearInterval(timer);
  }, [settings.carouselEnabled, settings.defaultRotateDurationSec, tabs, activeTabId, setActiveTabId]);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleConnectFile = async () => {
    const res = await openLocalFileBinding();
    if (res.success) {
      setHasFileBound(true);
      await saveLocalBackup();
    }
  };

  if (!isInitialized) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#090d16] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-400">Loading Ambiently...</span>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const tabWidgets = widgets.filter((w) => w.tabId === activeTab?.id);
  const tabNotes = notes.filter((n) => n.tabId === activeTab?.id);

  // Dynamic padding based on Dock position
  const dockPaddingClasses = {
    left: 'pl-20',
    right: 'pr-20',
    top: 'pt-20',
    bottom: 'pb-20',
  }[settings.dockPosition];

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#090d16] select-none"
      style={{
        transform: `scale(${settings.displayDensity})`,
        transformOrigin: 'center center',
      }}
    >
      {/* Navigation Dock */}
      <NavigationDock
        tabs={tabs}
        activeTabId={activeTab?.id || ''}
        dockPosition={settings.dockPosition}
        isLocked={!isUnlocked}
        onSelectTab={setActiveTabId}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleNightMode={toggleNightModeManual}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        onConnectFile={handleConnectFile}
        hasFileBound={hasFileBound}
      />

      {/* Main View Engine: Bento Grid vs Freeform Corkboard */}
      {activeTab?.layoutMode === 'freeform' ? (
        <Corkboard
          notes={tabNotes.length > 0 ? tabNotes : notes}
          dockPaddingClass={dockPaddingClasses}
          onUpdateNotePos={updateNotePosition}
        />
      ) : (
        <BentoGrid
          widgets={tabWidgets.length > 0 ? tabWidgets : widgets}
          notes={notes}
          dockPaddingClass={dockPaddingClasses}
          onAddNote={addNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
        />
      )}

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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
