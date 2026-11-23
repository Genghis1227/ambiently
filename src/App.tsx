import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useDashboardStore, flushPendingCloudPush } from './store/dashboardStore';
import type { AutoOrganizeMode } from './types/dashboard';
import { useChoreStore } from './store/choreStore';
import { useKanbanStore } from './stores/useKanbanStore';
import { NavigationDock } from './components/dock/NavigationDock';
import { Corkboard } from './components/layout/Corkboard';
import { PinOverlay } from './components/kiosk/PinOverlay';
import { NightMode } from './components/kiosk/NightMode';
const IdlePhotoScreensaver = lazy(() =>
  import('./components/kiosk/IdlePhotoScreensaver').then((m) => ({
    default: m.IdlePhotoScreensaver,
  }))
);
import { openLocalFileBinding, useFileSync, checkFileBindingStatus } from './services/fileSync';
import {
  subscribeToRealtimeBoard,
  resolveActiveDashboardId,
  clearLegacyJoinKeys,
  onAuthStateChange,
  pullFromCloud,
  pushToCloud,
  hasSupabaseCredentials,
  getCachedSessionUser,
  isRealtimeConnected,
} from './services/supabase';
import { useIdleCursor } from './hooks/useIdleCursor';
import { isCanvasThemeLight } from './data/canvasThemes';
import { isTimeInNightWindow } from './utils/nightMode';
import {
  normalizeIdleScreensaverPhotoOrder,
  normalizeIdleScreensaverPhotoStyle,
  normalizeIdleScreensaverPolaroidCount,
  normalizeIdleScreensaverPolaroidSizeMode,
  normalizeIdleScreensaverRotationSec,
  normalizeIdleScreensaverTimeoutMin,
  resolveEffectiveIdleScreensaverTarget,
  resolveScreensaverWeatherLocation,
  shouldBlockIdleScreensaver,
} from './utils/idleScreensaver';
import { initUpdateChecker } from './services/updateChecker';
import { photoSyncService } from './services/photoSyncService';
import { UpdateNotificationBanner } from './components/common/UpdateNotificationBanner';
import { PlexReauthBanner } from './components/common/PlexReauthBanner';
import { SyncRefusedBanner } from './components/common/SyncRefusedBanner';
import { MovedWidgetToast } from './components/common/MovedWidgetToast';
import { LayoutUndoToast } from './components/common/LayoutUndoToast';
import { CanvasSwipePreviewPill } from './components/common/CanvasSwipePreviewPill';
import { GlobalTimerAlarmOverlay } from './components/common/GlobalTimerAlarmOverlay';
import { isCanvasPinLocked, isSettingsPinRequired } from './utils/pinValidation';
import { useCanvasSwipe } from './hooks/useCanvasSwipe';
import { useDisplayOrientation } from './hooks/useDisplayOrientation';
import {
  readPersistedForceDesktopMode,
  writePersistedForceDesktopMode,
} from './utils/displayOrientation';
import { useSharedClock } from './utils/sharedClock';
import {
  getBackgroundCanvasWidgetTypes,
  preloadWidgetChunksForTypes,
} from './utils/widgetPreloader';
import {
  resolveVisibleChoreOverlay,
  resolveVisibleKanbanOverlay,
} from './utils/fullscreenWidgetOverlay';

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
const PhotoSourcesModal = lazy(() =>
  import('./components/photos/PhotoSourcesModal').then((m) => ({ default: m.PhotoSourcesModal }))
);
const ShareBoardModal = lazy(() =>
  import('./components/settings/ShareBoardModal').then((m) => ({ default: m.ShareBoardModal }))
);
const MobileCompanion = lazy(() =>
  import('./components/mobile/MobileCompanion').then((m) => ({ default: m.MobileCompanion }))
);
const InAppWebViewerModal = lazy(() =>
  import('./components/common/InAppWebViewerModal').then((m) => ({ default: m.InAppWebViewerModal }))
);
const ChoreDashboardView = lazy(() =>
  import('./components/chores/ChoreDashboardView').then((m) => ({ default: m.ChoreDashboardView }))
);
const KanbanBoardView = lazy(() =>
  import('./components/kanban/KanbanBoardView').then((m) => ({ default: m.KanbanBoardView }))
);
const ParentChoreDrawer = lazy(() =>
  import('./components/chores/ParentChoreDrawer').then((m) => ({ default: m.ParentChoreDrawer }))
);
const QuickStartModal = lazy(() =>
  import('./components/settings/QuickStartModal').then((m) => ({ default: m.QuickStartModal }))
);
const WidgetDeleteConfirmModal = lazy(() =>
  import('./components/common/WidgetDeleteConfirmModal').then((m) => ({
    default: m.WidgetDeleteConfirmModal,
  }))
);

export function App() {
  const isInitialized = useDashboardStore((s) => s.isInitialized);
  const initStore = useDashboardStore((s) => s.initStore);
  const settings = useDashboardStore((s) => s.settings);
  const tabs = useDashboardStore((s) => s.tabs);
  const activeTabId = useDashboardStore((s) => s.activeTabId);
  const widgets = useDashboardStore((s) => s.widgets);
  const deletedWidgetCount = useDashboardStore((s) => s.deletedWidgets.length);
  const notes = useDashboardStore((s) => s.notes);
  const setActiveTabId = useDashboardStore((s) => s.setActiveTabId);
  const rotateToTab = useDashboardStore((s) => s.rotateToTab);
  const unlockKiosk = useDashboardStore((s) => s.unlockKiosk);
  const lockKiosk = useDashboardStore((s) => s.lockKiosk);
  const isCarouselPaused = useDashboardStore((s) => s.isCarouselPaused);
  const pauseCarouselTemporarily = useDashboardStore((s) => s.pauseCarouselTemporarily);
  const updateSettings = useDashboardStore((s) => s.updateSettings);
  const updateNotePosition = useDashboardStore((s) => s.updateNotePosition);
  const updateWidgetPosition = useDashboardStore((s) => s.updateWidgetPosition);
  const addWidget = useDashboardStore((s) => s.addWidget);
  const removeWidget = useDashboardStore((s) => s.removeWidget);
  const updateWidget = useDashboardStore((s) => s.updateWidget);
  const addNote = useDashboardStore((s) => s.addNote);
  const updateNote = useDashboardStore((s) => s.updateNote);
  const deleteNote = useDashboardStore((s) => s.deleteNote);
  const permanentlyDeleteNote = useDashboardStore((s) => s.permanentlyDeleteNote);
  const permanentlyDeleteNotes = useDashboardStore((s) => s.permanentlyDeleteNotes);
  const addTab = useDashboardStore((s) => s.addTab);
  const updateTab = useDashboardStore((s) => s.updateTab);
  const autoOrganizeCanvas = useDashboardStore((s) => s.autoOrganizeCanvas);
  const layoutUndoStack = useDashboardStore((s) => s.layoutUndoStack);
  const toggleDockHidden = useDashboardStore((s) => s.toggleDockHidden);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pinChallenge, setPinChallenge] = useState<{
    action: 'open_settings' | 'open_share' | 'open_plex_pairing';
    title?: string;
    subtitle?: string;
  } | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isCreateCanvasOpen, setIsCreateCanvasOpen] = useState(false);
  const [isNoteCreatorOpen, setIsNoteCreatorOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isPlexPairingModalOpen, setIsPlexPairingModalOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [pendingDeleteWidgetId, setPendingDeleteWidgetId] = useState<string | null>(null);
  const [isQuickStartOpen, setIsQuickStartOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ambiently_quickstart_dismissed_v1') !== 'true';
    } catch {
      return false;
    }
  });
  const fileSync = useFileSync();
  const hasFileBound = fileSync.status === 'connected';
  const syncRemoteNoteChange = useDashboardStore((s) => s.syncRemoteNoteChange);
  const syncRemoteWidgetChange = useDashboardStore((s) => s.syncRemoteWidgetChange);
  const syncRemoteTabChange = useDashboardStore((s) => s.syncRemoteTabChange);
  const applyCommonPhotosToAllWidgets = useDashboardStore((s) => s.applyCommonPhotosToAllWidgets);
  const isChoreFullScreenOpen = useChoreStore((s) => s.isFullScreenOpen);
  const choreFullScreenContext = useChoreStore((s) => s.fullScreenContext);
  const setChoreFullScreenOpen = useChoreStore((s) => s.setFullScreenOpen);
  const isParentDrawerOpen = useChoreStore((s) => s.isParentDrawerOpen);
  const kanbanFullScreenOverlay = useKanbanStore((s) => s.fullScreenOverlay);
  const setKanbanFullScreenOverlay = useKanbanStore((s) => s.setFullScreenOverlay);
  const [isIdleScreensaverActive, setIsIdleScreensaverActive] = useState(false);

  // Initialize and check persistent PC Auto-Sync file binding
  useEffect(() => {
    clearLegacyJoinKeys();
    checkFileBindingStatus();
  }, []);

  // Periodic version update polling & service worker refresh listener
  useEffect(() => {
    const cleanup = initUpdateChecker();
    return () => cleanup?.();
  }, []);

  const [realtimeBoardId, setRealtimeBoardId] = useState<string | null>(null);

  // Listen for Supabase Auth state changes (cleans up URL hash/code after magic link login)
  useEffect(() => {
    if (!hasSupabaseCredentials()) return;
    resolveActiveDashboardId().then((target) => {
      setRealtimeBoardId(target?.dashboardId || null);
    });

    // Supabase also reports the session at startup, after each hourly token refresh and on some screen
    // wakes. Only a different account signing in needs a fresh pull; startup pulls on its own below.
    let pulledForUserId: string | null = null;
    const unsubscribe = onAuthStateChange(async (user, event) => {
      if (user) {
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || user.id === pulledForUserId) return;
        pulledForUserId = user.id;
        console.log('Ambiently authenticated as:', user.email);
        const target = await resolveActiveDashboardId();
        setRealtimeBoardId(target?.dashboardId || user.id);
        try {
          await flushPendingCloudPush();
          const res = await pullFromCloud({ force: true });
          if (res.success && res.hasChanges) {
            await initStore();
          }
          if (res.success && res.hasUnsyncedLocalChanges) {
            const st = useDashboardStore.getState();
            void pushToCloud(st.settings, st.tabs, st.widgets, st.notes);
          }
        } catch (err) {
          console.warn('Initial cloud pull on auth change failed:', err);
        }
      } else {
        pulledForUserId = null;
        setRealtimeBoardId(null);
      }
    });
    return () => unsubscribe();
  }, [initStore]);

  // Live Supabase Realtime WebSocket subscription ONLY when authenticated
  useEffect(() => {
    if (!realtimeBoardId) return;
    const unsubscribe = subscribeToRealtimeBoard(realtimeBoardId, {
      onRemoteNoteChange: (note, eventType) => syncRemoteNoteChange(note, eventType),
      onRemoteWidgetChange: (widget, eventType) => syncRemoteWidgetChange(widget, eventType),
      onRemoteTabChange: (tab, eventType) => syncRemoteTabChange(tab, eventType),
    });
    return () => unsubscribe();
  }, [realtimeBoardId, syncRemoteNoteChange, syncRemoteWidgetChange, syncRemoteTabChange]);

  // Cloud Pull: fetch fresh state on boot if logged in, on screen wake (visibilitychange), and smart fallback poll
  useEffect(() => {
    if (!hasSupabaseCredentials()) return;

    let isCancelled = false;
    let lastPollTime = 0;

    const pullFreshCloudData = async (force = false) => {
      try {
        const user = await getCachedSessionUser();
        if (user && !isCancelled) {
          await flushPendingCloudPush();
          const res = await pullFromCloud({ force });
          if (res.success && res.hasChanges && !isCancelled) {
            await initStore();
          }
          if (res.success && res.hasUnsyncedLocalChanges && !isCancelled) {
            const st = useDashboardStore.getState();
            void pushToCloud(st.settings, st.tabs, st.widgets, st.notes);
          }
        }
      } catch (err) {
        console.warn('Background cloud pull failed:', err);
      }
    };

    // 1. Initial boot pull (forced so we seed/verify fresh state on startup)
    pullFreshCloudData(true);

    // 2. Pull immediately when device / kiosk screen wakes up or tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        // Throttle rapid visibility changes (min 15 seconds between visibility checks)
        if (now - lastPollTime > 15000) {
          lastPollTime = now;
          pullFreshCloudData(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Smart interval poll for always-on wall kiosks:
    // - Completely pauses when document.visibilityState is 'hidden'
    // - If Realtime WebSocket is connected, polls lightweight revision every 10 minutes (600,000ms)
    // - If Realtime is disconnected, polls lightweight revision every 2 minutes (120,000ms)
    // - Fast-paths in 0ms / 0 IO when cloud revision hasn't changed
    const intervalTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      const intervalNeeded = isRealtimeConnected() ? 600000 : 120000;
      if (now - lastPollTime >= intervalNeeded) {
        lastPollTime = now;
        pullFreshCloudData(false);
      }
    }, 30000);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalTimer);
    };
  }, [initStore]);

  // Responsive Mobile & Portrait Wall-Display Detection with persisted Desktop View override
  const [forceDesktopMode, setForceDesktopMode] = useState<boolean>(readPersistedForceDesktopMode);
  const {
    isMobileViewport,
    isMobileCompanionActive,
    isPortraitDesktop,
    orientation,
  } = useDisplayOrientation(forceDesktopMode);

  // In-App Web Viewer Modal for external links (prevents full-screen kiosk escape in Edge/PWA)
  const [activeWebModal, setActiveWebModal] = useState<{ url: string; title?: string } | null>(null);

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

  // Granular protection controls (Settings/Share/Plex verify PIN on each open; Canvas locks stay enforced whenever active)
  const isSettingsLocked = isSettingsPinRequired(settings);
  const isCanvasLocked = isCanvasPinLocked(settings);

  const visibleTabs = useMemo(
    () =>
      tabs.filter((t) =>
        t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false
      ),
    [tabs]
  );

  const homeTab = visibleTabs.find((t) => t.isHome) || visibleTabs[0] || tabs[0];
  const activeTab = visibleTabs.find((t) => t.id === activeTabId) || homeTab;
  const activeTabIdResolved = activeTab?.id || 'tab-corkboard';

  const tabWidgets = useMemo(
    () => widgets.filter((w) => w.tabId === activeTabIdResolved),
    [widgets, activeTabIdResolved]
  );

  const closeUnscopedOverlays = useCallback(() => {
    const choreState = useChoreStore.getState();
    if (
      choreState.isFullScreenOpen &&
      (!choreState.fullScreenContext || choreState.fullScreenContext.tabId === null)
    ) {
      choreState.setFullScreenOpen(false);
    }
    const kanbanState = useKanbanStore.getState();
    if (kanbanState.fullScreenOverlay && kanbanState.fullScreenOverlay.tabId === null) {
      kanbanState.setFullScreenOverlay(null);
    }
  }, []);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      closeUnscopedOverlays();
      setActiveTabId(tabId);
    },
    [closeUnscopedOverlays, setActiveTabId]
  );

  const handleRotateToTab = useCallback(
    (tabId: string) => {
      closeUnscopedOverlays();
      rotateToTab(tabId);
    },
    [closeUnscopedOverlays, rotateToTab]
  );

  // Keyboard shortcuts:
  // '\' (backslash) to toggle toolbar visibility
  // '1'-'9' and '0' (for 10) to switch between canvases
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('input, textarea, [contenteditable="true"], [role="dialog"]'))
      ) {
        return;
      }

      if (activeWebModal) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setActiveWebModal(null);
        }
        return;
      }

      // Never trigger background canvas hotkeys when any modal or PIN pad is open
      if (
        pinChallenge ||
        isParentDrawerOpen ||
        isSettingsOpen ||
        isShareOpen ||
        isQuickStartOpen ||
        isAddWidgetOpen ||
        isCreateCanvasOpen ||
        isBackupModalOpen ||
        isNoteCreatorOpen ||
        isTrashOpen ||
        document.querySelector('[role="dialog"]')
      ) {
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
        if (visibleTabs[index]) {
          e.preventDefault();
          handleSelectTab(visibleTabs[index].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toggleDockHidden,
    visibleTabs,
    handleSelectTab,
    activeWebModal,
    pinChallenge,
    isParentDrawerOpen,
    isSettingsOpen,
    isShareOpen,
    isQuickStartOpen,
    isAddWidgetOpen,
    isCreateCanvasOpen,
    isBackupModalOpen,
    isNoteCreatorOpen,
    isTrashOpen,
  ]);

  // Fullscreen state listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Global click interception for external links (RSS news, widget embeds, etc.)
  // Opens in an In-App Window Frame with a dedicated Close button rather than escaping fullscreen in Edge kiosk
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest('a');
      if (!anchor) return;

      if (anchor.dataset.nativeLink === 'true' || anchor.hasAttribute('download')) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return;

      const isHttp = href.startsWith('http://') || href.startsWith('https://');
      if (!isHttp) return;

      // Allow internal same-origin routes without target="_blank"
      if (typeof window !== 'undefined' && href.startsWith(window.location.origin) && !anchor.target) {
        return;
      }

      // External link clicked: intercept and open in the in-app web window frame
      e.preventDefault();
      e.stopPropagation();

      const linkTitle =
        anchor.getAttribute('title') ||
        anchor.innerText?.trim() ||
        anchor.getAttribute('aria-label') ||
        undefined;

      setActiveWebModal({
        url: href,
        title: linkTitle,
      });
    };

    const handleOpenInAppWeb = (e: Event) => {
      const custom = e as CustomEvent<{ url: string; title?: string }>;
      if (custom.detail?.url) {
        setActiveWebModal({
          url: custom.detail.url,
          title: custom.detail.title,
        });
      }
    };

    document.addEventListener('click', handleGlobalClick, { capture: true });
    window.addEventListener('open_in_app_web_viewer', handleOpenInAppWeb);

    return () => {
      document.removeEventListener('click', handleGlobalClick, { capture: true });
      window.removeEventListener('open_in_app_web_viewer', handleOpenInAppWeb);
    };
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  const handleOpenSettings = useCallback(() => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_settings',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to access settings & controls',
      });
      return;
    }
    setIsSettingsOpen(true);
  }, [isSettingsLocked]);

  // The household sharing screen and Plex sign-in are settings too, so they need the PIN the same way
  const handleOpenShare = useCallback(() => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_share',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to manage who can use this board',
      });
      return;
    }
    setIsShareOpen(true);
  }, [isSettingsLocked]);

  const handleOpenPlexPairing = useCallback(() => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_plex_pairing',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to sign in to Plex',
      });
      return;
    }
    setIsPlexPairingModalOpen(true);
  }, [isSettingsLocked]);

  // Does what the PIN pad was opened for, once the PIN is entered or removed
  const finishPinChallenge = () => {
    if (pinChallenge?.action === 'open_settings') {
      setIsSettingsOpen(true);
    } else if (pinChallenge?.action === 'open_share') {
      setIsShareOpen(true);
    } else if (pinChallenge?.action === 'open_plex_pairing') {
      setIsPlexPairingModalOpen(true);
    }
    setPinChallenge(null);
  };

  const handlePinUnlock = async (enteredPin: string) => {
    const success = await unlockKiosk(enteredPin);
    if (success) {
      finishPinChallenge();
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

  // Track temporary night-mode wake snooze until timestamp (in milliseconds)
  const [nightWakeSnoozeUntil, setNightWakeSnoozeUntil] = useState<number | null>(() => {
    try {
      const stored = sessionStorage.getItem('ambiently_night_snooze');
      if (stored) {
        const val = parseInt(stored, 10);
        return val > Date.now() ? val : null;
      }
    } catch {
      // sessionStorage unavailable in some sandboxes
    }
    return null;
  });

  const [dismissedUntilMorning, setDismissedUntilMorning] = useState(false);
  const wakeTimeoutMin = settings.nightModeWakeTimeoutMin ?? 2;

  // Called when user taps to wake from Night Mode
  const handleWakeFromNightMode = useCallback(() => {
    setIsIdleScreensaverActive(false);
    if (wakeTimeoutMin === 0) {
      setDismissedUntilMorning(true);
      setNightWakeSnoozeUntil(null);
      try {
        sessionStorage.removeItem('ambiently_night_snooze');
      } catch {}
    } else {
      const snoozeUntil = Date.now() + wakeTimeoutMin * 60 * 1000;
      setNightWakeSnoozeUntil(snoozeUntil);
      try {
        sessionStorage.setItem('ambiently_night_snooze', String(snoozeUntil));
      } catch {}
    }
    updateSettings({ nightModeEnabled: false });
  }, [wakeTimeoutMin, updateSettings]);

  const handleToggleNightMode = useCallback(() => {
    setIsIdleScreensaverActive(false);
    if (settings.nightModeEnabled) {
      setDismissedUntilMorning(true);
      setNightWakeSnoozeUntil(null);
      try {
        sessionStorage.removeItem('ambiently_night_snooze');
      } catch {}
      updateSettings({ nightModeEnabled: false });
    } else {
      setDismissedUntilMorning(false);
      setNightWakeSnoozeUntil(null);
      try {
        sessionStorage.removeItem('ambiently_night_snooze');
      } catch {}
      updateSettings({ nightModeEnabled: true });
    }
  }, [settings.nightModeEnabled, updateSettings]);

  const handleCloseAddWidget = useCallback(() => setIsAddWidgetOpen(false), []);
  const handleCloseCreateCanvas = useCallback(() => setIsCreateCanvasOpen(false), []);

  // Extend snooze on user touch/keyboard/pointer activity if currently in a night-wake snooze
  useEffect(() => {
    if (!nightWakeSnoozeUntil || wakeTimeoutMin === 0) return;

    const extendSnooze = () => {
      const newSnooze = Date.now() + wakeTimeoutMin * 60 * 1000;
      setNightWakeSnoozeUntil(newSnooze);
      try {
        sessionStorage.setItem('ambiently_night_snooze', String(newSnooze));
      } catch {}
    };

    const events = ['mousedown', 'pointerdown', 'touchstart', 'keydown'];
    events.forEach((evt) => window.addEventListener(evt, extendSnooze, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, extendSnooze));
    };
  }, [nightWakeSnoozeUntil, wakeTimeoutMin]);

  const wasInNightWindow = useRef<boolean | null>(null);
  const prevNightModeEnabled = useRef<boolean>(settings.nightModeEnabled);

  // Smart Scheduled Night Mode Evaluator (runs once settings have loaded and every 5 seconds)
  useEffect(() => {
    const justDisabledManually =
      prevNightModeEnabled.current === true && !settings.nightModeEnabled;
    const justEnabledManually =
      prevNightModeEnabled.current === false && settings.nightModeEnabled;
    prevNightModeEnabled.current = settings.nightModeEnabled;

    if (justEnabledManually) {
      setDismissedUntilMorning(false);
      setNightWakeSnoozeUntil(null);
      try {
        sessionStorage.removeItem('ambiently_night_snooze');
      } catch {}
    }

    // Wait for saved settings: updateSettings saves the store's current settings, which are still
    // the defaults at this point, over the user's real ones.
    if (!isInitialized || settings.nightScheduleEnabled === false) return;
    if (!settings.nightModeStart || !settings.nightModeEnd) return;

    const checkSchedule = (manualDisableOverride = false) => {
      const now = new Date();
      const inWindow = isTimeInNightWindow(now, settings.nightModeStart, settings.nightModeEnd);
      const wasInWindow = wasInNightWindow.current;
      wasInNightWindow.current = inWindow;

      if (inWindow) {
        const isSnoozed = Boolean(nightWakeSnoozeUntil && Date.now() < nightWakeSnoozeUntil);

        if (manualDisableOverride && !isSnoozed && !dismissedUntilMorning) {
          setDismissedUntilMorning(true);
          return;
        }

        if (isSnoozed || dismissedUntilMorning) {
          // User is actively awake or snoozed during night
          return;
        }

        // Auto-engage Night Mode if not already active
        if (!settings.nightModeEnabled) {
          if (nightWakeSnoozeUntil && Date.now() >= nightWakeSnoozeUntil) {
            setNightWakeSnoozeUntil(null);
            try {
              sessionStorage.removeItem('ambiently_night_snooze');
            } catch {}
          }
          updateSettings({ nightModeEnabled: true });
        }
      } else {
        // Daytime: reset snooze and dismissed state, turn off night mode if it was on
        if (dismissedUntilMorning) {
          setDismissedUntilMorning(false);
        }
        if (nightWakeSnoozeUntil) {
          setNightWakeSnoozeUntil(null);
          try {
            sessionStorage.removeItem('ambiently_night_snooze');
          } catch {}
        }
        // End night mode only as the window closes (or on load), so it can still be switched on
        // by hand during the day
        if (wasInWindow !== false && settings.nightModeEnabled) {
          updateSettings({ nightModeEnabled: false });
        }
      }
    };

    checkSchedule(justDisabledManually);
    const timer = setInterval(() => checkSchedule(false), 30000);
    return () => clearInterval(timer);
  }, [
    isInitialized,
    settings.nightScheduleEnabled,
    settings.nightModeStart,
    settings.nightModeEnd,
    settings.nightModeEnabled,
    nightWakeSnoozeUntil,
    dismissedUntilMorning,
    updateSettings,
  ]);

  // Scheduled background photo library rescan (24h default, pauses in Night Mode & hidden tabs)
  const prevNightModeForSyncRef = useRef<boolean>(settings.nightModeEnabled);
  useEffect(() => {
    if (!isInitialized) return;

    void photoSyncService.init();

    const jitterMs = 90_000 + Math.floor(Math.random() * 150_000);
    const bootTimer = setTimeout(() => {
      void photoSyncService.runDueAutoSyncs();
    }, jitterMs);

    const intervalTimer = setInterval(() => {
      void photoSyncService.runDueAutoSyncs();
    }, 15 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void photoSyncService.runDueAutoSyncs();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let plexRescanTimer: ReturnType<typeof setTimeout> | null = null;
    const handlePlexAuthChanged = () => {
      if (plexRescanTimer) clearTimeout(plexRescanTimer);
      plexRescanTimer = setTimeout(() => {
        void photoSyncService.runDueAutoSyncs();
      }, 5000);
    };
    window.addEventListener('plex_auth_changed', handlePlexAuthChanged);

    return () => {
      clearTimeout(bootTimer);
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('plex_auth_changed', handlePlexAuthChanged);
      if (plexRescanTimer) clearTimeout(plexRescanTimer);
    };
  }, [isInitialized]);

  useEffect(() => {
    const wasNight = prevNightModeForSyncRef.current;
    prevNightModeForSyncRef.current = settings.nightModeEnabled;
    if (isInitialized && wasNight && !settings.nightModeEnabled) {
      void photoSyncService.runDueAutoSyncs();
    }
  }, [isInitialized, settings.nightModeEnabled]);

  // Low-Power Kiosk GPU Mode class sync on root element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(
      'reduce-visual-effects',
      Boolean(settings.reduceVisualEffects)
    );
  }, [settings.reduceVisualEffects]);

  // Pre-warm lazy widget chunks used on inactive canvases once idle so carousel/swipe switches stay instant
  useEffect(() => {
    if (!isInitialized) return;
    const enabledIds = new Set(visibleTabs.map((t) => t.id));
    const backgroundTypes = getBackgroundCanvasWidgetTypes(widgets, activeTabIdResolved, enabledIds);
    if (backgroundTypes.length === 0) return;

    const win = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(() => {
        void preloadWidgetChunksForTypes(backgroundTypes);
      }, { timeout: 2500 });
      return () => {
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
      };
    }
    const timer = setTimeout(() => {
      void preloadWidgetChunksForTypes(backgroundTypes);
    }, 1800);
    return () => clearTimeout(timer);
  }, [isInitialized, visibleTabs, widgets, activeTabIdResolved]);

  const handleOpenCreator = useCallback(() => setIsNoteCreatorOpen(true), []);
  const handleCloseCreator = useCallback(() => setIsNoteCreatorOpen(false), []);
  const handleOpenTrash = useCallback(() => setIsTrashOpen(true), []);
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);
  const handleOpenAddWidget = useCallback(() => setIsAddWidgetOpen(true), []);
  const handleOpenAddCanvas = useCallback(() => setIsCreateCanvasOpen(true), []);
  const handleOpenQuickStart = useCallback(() => setIsQuickStartOpen(true), []);
  const handleOpenBackupModal = useCallback(() => setIsBackupModalOpen(true), []);
  const handleEnterDesktopMode = useCallback(() => {
    writePersistedForceDesktopMode(true);
    setForceDesktopMode(true);
  }, []);
  const handleEnterMobileCompanion = useCallback(() => {
    writePersistedForceDesktopMode(false);
    setForceDesktopMode(false);
  }, []);
  const handleAutoOrganizeActiveTab = useCallback(
    (mode: AutoOrganizeMode) => autoOrganizeCanvas(activeTabIdResolved, mode, orientation),
    [autoOrganizeCanvas, activeTabIdResolved, orientation]
  );
  const handleUndoActiveTabLayout = useCallback(() => {
    void useDashboardStore.getState().undoLayoutChange();
  }, []);
  const canUndoActiveTabLayout = layoutUndoStack.some(
    (entry) => entry.tabId === activeTabIdResolved
  );
  const handleRequestRemoveWidget = useCallback(
    (widgetId: string) => {
      if (useDashboardStore.getState().settings.confirmWidgetDelete === false) {
        void removeWidget(widgetId);
        return;
      }
      setPendingDeleteWidgetId(widgetId);
    },
    [removeWidget]
  );

  const pendingDeleteWidget = pendingDeleteWidgetId
    ? widgets.find((w) => w.id === pendingDeleteWidgetId && !w.deleted_at) || null
    : null;
  const pendingDeleteCanvasName = pendingDeleteWidget
    ? tabs.find((t) => t.id === pendingDeleteWidget.tabId)?.name || 'this canvas'
    : 'this canvas';

  const isAnyOverlayOpen = Boolean(
    isParentDrawerOpen ||
      isSettingsOpen ||
      isQuickStartOpen ||
      isAddWidgetOpen ||
      isCreateCanvasOpen ||
      isNoteCreatorOpen ||
      isTrashOpen ||
      isShareOpen ||
      isBackupModalOpen ||
      pinChallenge ||
      activeWebModal
  );

  const activeChoreOverlay = resolveVisibleChoreOverlay({
    isFullScreenOpen: isChoreFullScreenOpen,
    fullScreenContext: choreFullScreenContext,
    activeTabId: activeTabIdResolved,
    activeTabWidgets: tabWidgets,
  });

  const activeKanbanOverlay = resolveVisibleKanbanOverlay({
    fullScreenOverlay: kanbanFullScreenOverlay,
    activeTabId: activeTabIdResolved,
    activeTabWidgets: tabWidgets,
  });

  const isFullscreenWidgetOverlayVisible = Boolean(activeChoreOverlay || activeKanbanOverlay);

  const idleScreensaverTimeoutMin = normalizeIdleScreensaverTimeoutMin(
    settings.idleScreensaverTimeoutMin
  );
  const screensaverWeatherLocation = useMemo(
    () => resolveScreensaverWeatherLocation(widgets),
    [widgets]
  );
  const isIdleScreensaverBlocked = shouldBlockIdleScreensaver({
    timeoutMin: idleScreensaverTimeoutMin,
    isMobileCompanionActive,
    nightModeEnabled: Boolean(settings.nightModeEnabled),
    isAnyBlockingOverlayOpen: isAnyOverlayOpen || isFullscreenWidgetOverlayVisible,
    hasActiveModalOrAlarmInDom: false,
  });
  const showIdleScreensaver = isIdleScreensaverActive && !isIdleScreensaverBlocked;
  const effectiveScreensaver = useMemo(
    () => resolveEffectiveIdleScreensaverTarget(settings, tabs),
    [settings, tabs]
  );
  const isCanvasScreensaverActive =
    showIdleScreensaver && effectiveScreensaver.mode === 'canvas';
  const isPhotoScreensaverActive =
    showIdleScreensaver && effectiveScreensaver.mode === 'photos';
  const screensaverCanvasTab = isCanvasScreensaverActive ? effectiveScreensaver.tab : null;
  const screensaverCanvasWidgets = useMemo(
    () =>
      screensaverCanvasTab
        ? widgets.filter((w) => w.tabId === screensaverCanvasTab.id)
        : [],
    [screensaverCanvasTab, widgets]
  );
  const screensaverCanvasNotes = useMemo(
    () =>
      screensaverCanvasTab
        ? notes.filter(
            (n) => (n.tabId || 'tab-corkboard') === screensaverCanvasTab.id || n.tabId === 'all'
          )
        : [],
    [screensaverCanvasTab, notes]
  );

  const handleWakeIdleScreensaver = useCallback(() => {
    setIsIdleScreensaverActive(false);
    if (settings.carouselEnabled) {
      pauseCarouselTemporarily(20000);
    }
  }, [settings.carouselEnabled, pauseCarouselTemporarily]);

  const handlePreviewScreensaver = useCallback(() => {
    setIsSettingsOpen(false);
    lockKiosk();
    setIsIdleScreensaverActive(true);
  }, [lockKiosk]);

  useEffect(() => {
    if (isIdleScreensaverBlocked || isIdleScreensaverActive) {
      return;
    }

    const timeoutMs = idleScreensaverTimeoutMin * 60 * 1000;
    let timerId: number | null = null;
    let lastMoveMs = 0;

    const isUiBusyForScreensaver = () => {
      if (typeof document === 'undefined') return false;
      if (
        document.querySelector('[role="dialog"], [aria-modal="true"], [data-carousel-lock="true"]')
      ) {
        return true;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      if (!activeEl) return false;
      const tag = activeEl.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        activeEl.isContentEditable
      );
    };

    const scheduleScreensaver = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        if (isUiBusyForScreensaver()) {
          scheduleScreensaver();
          return;
        }
        setIsIdleScreensaverActive(true);
      }, timeoutMs);
    };

    const handleActivity = () => {
      scheduleScreensaver();
    };

    const handlePointerMove = () => {
      const nowMs = Date.now();
      if (nowMs - lastMoveMs < 1500) return;
      lastMoveMs = nowMs;
      scheduleScreensaver();
    };

    scheduleScreensaver();

    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', handleActivity, opts);
    window.addEventListener('keydown', handleActivity, opts);
    window.addEventListener('wheel', handleActivity, opts);
    window.addEventListener('touchstart', handleActivity, opts);
    window.addEventListener('pointermove', handlePointerMove, opts);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      window.removeEventListener('pointerdown', handleActivity, opts);
      window.removeEventListener('keydown', handleActivity, opts);
      window.removeEventListener('wheel', handleActivity, opts);
      window.removeEventListener('touchstart', handleActivity, opts);
      window.removeEventListener('pointermove', handlePointerMove, opts);
    };
  }, [idleScreensaverTimeoutMin, isIdleScreensaverBlocked, isIdleScreensaverActive]);

  useEffect(() => {
    if (!showIdleScreensaver) return;
    const interval = window.setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"], [aria-modal="true"], [data-carousel-lock="true"]')
      ) {
        setIsIdleScreensaverActive(false);
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [showIdleScreensaver]);

  useEffect(() => {
    if (
      isMobileCompanionActive ||
      isCanvasLocked ||
      isAnyOverlayOpen ||
      isFullscreenWidgetOverlayVisible ||
      showIdleScreensaver ||
      settings.nightModeEnabled
    ) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;

      const isEditable = (node: EventTarget | Element | null): boolean => {
        if (!node || !(node instanceof HTMLElement)) return false;
        const tag = node.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable) {
          return true;
        }
        return Boolean(node.closest('[contenteditable="true"]'));
      };

      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;

      const st = useDashboardStore.getState();
      if (!st.layoutUndoStack.some((entry) => entry.tabId === activeTabIdResolved)) return;

      e.preventDefault();
      void st.undoLayoutChange(activeTabIdResolved);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTabIdResolved,
    isAnyOverlayOpen,
    isFullscreenWidgetOverlayVisible,
    showIdleScreensaver,
    isCanvasLocked,
    isMobileCompanionActive,
    settings.nightModeEnabled,
  ]);
  const {
    swipePreview,
    transitionClass: swipeTransitionClass,
    onPointerDownCapture: handleCanvasSwipePointerDown,
  } = useCanvasSwipe({
    tabs: visibleTabs,
    activeTabId: activeTabIdResolved,
    enabled: settings.canvasSwipeEnabled !== false && visibleTabs.length >= 2,
    mode: isMobileCompanionActive ? 'mobile' : 'desktop',
    isCanvasLocked,
    isBlocked: isAnyOverlayOpen || showIdleScreensaver || Boolean(settings.nightModeEnabled),
    dockPosition: settings.dockPosition,
    isDockHidden: Boolean(settings.isDockHidden),
    onSelectTab: handleSelectTab,
  });

  const widgetSafetyOverlays = (
    <>
      <MovedWidgetToast onSelectTab={handleSelectTab} />
      <LayoutUndoToast />
      <CanvasSwipePreviewPill preview={swipePreview} />
      {pendingDeleteWidget && (
        <Suspense fallback={null}>
          <WidgetDeleteConfirmModal
            isOpen={true}
            widgetTitle={pendingDeleteWidget.title || 'Widget'}
            canvasName={pendingDeleteCanvasName}
            onCancel={() => setPendingDeleteWidgetId(null)}
            onConfirm={() => {
              const id = pendingDeleteWidget.id;
              setPendingDeleteWidgetId(null);
              void removeWidget(id);
            }}
          />
        </Suspense>
      )}
    </>
  );

  // `visibleTabs` is a new array on every render, and a background cloud refresh renders every 60
  // seconds. Depending on the ids instead keeps that from restarting the countdown.
  const visibleTabIds = visibleTabs.map((t) => t.id).join('\n');
  const rotateDurationSec = settings.defaultRotateDurationSec || 30;

  // Pause carousel on any pointer, touch, or wheel activity (including inside portals)
  useEffect(() => {
    if (!settings.carouselEnabled) return;

    let lastActivityPauseAt = 0;
    const handleUserActivity = () => {
      const nowMs = Date.now();
      if (nowMs - lastActivityPauseAt < 4000) return;
      lastActivityPauseAt = nowMs;
      pauseCarouselTemporarily(20000);
    };

    const events = ['pointerdown', 'touchstart', 'wheel'] as const;
    events.forEach((evt) =>
      window.addEventListener(evt, handleUserActivity, { capture: true, passive: true })
    );
    return () => {
      events.forEach((evt) =>
        window.removeEventListener(evt, handleUserActivity, { capture: true })
      );
    };
  }, [settings.carouselEnabled, pauseCarouselTemporarily]);

  // Tab auto-carousel rotation (pauses automatically when user interacts or any modal/hub/input is active)
  useEffect(() => {
    const tabIds = visibleTabIds.split('\n').filter(Boolean);
    if (
      !settings.carouselEnabled ||
      isCarouselPaused ||
      isAnyOverlayOpen ||
      showIdleScreensaver ||
      tabIds.length <= 1
    ) {
      return;
    }

    const interval = setInterval(() => {
      // Never rotate if any widget modal, dialog, or inline editor is open, or if an input is focused
      if (typeof document !== 'undefined') {
        if (document.querySelector('[role="dialog"], [aria-modal="true"], [data-carousel-lock="true"]')) {
          return;
        }
        const activeEl = document.activeElement as HTMLElement | null;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable)
        ) {
          return;
        }
      }

      const currentIndex = tabIds.indexOf(activeTabIdResolved);
      const nextIndex = (currentIndex === -1 ? 1 : currentIndex + 1) % tabIds.length;
      handleRotateToTab(tabIds[nextIndex]);
    }, rotateDurationSec * 1000);

    return () => clearInterval(interval);
  }, [
    settings.carouselEnabled,
    isCarouselPaused,
    isAnyOverlayOpen,
    showIdleScreensaver,
    rotateDurationSec,
    visibleTabIds,
    activeTabIdResolved,
    handleRotateToTab,
  ]);

  // Strict per-canvas sticky notes (plus notes explicitly pinned to 'all' canvases)
  const activeCanvasNotes = useMemo(
    () =>
      notes.filter(
        (n) => (n.tabId || 'tab-corkboard') === activeTabIdResolved || n.tabId === 'all'
      ),
    [notes, activeTabIdResolved]
  );

  const minuteClock = useSharedClock('minute', !isMobileCompanionActive);
  const minuteNowMs = minuteClock.getTime();
  const noteTrashCount = useMemo(
    () =>
      activeCanvasNotes.filter(
        (n) => n.archivedAt || (n.expiresAt && new Date(n.expiresAt).getTime() <= minuteNowMs)
      ).length,
    [activeCanvasNotes, minuteNowMs]
  );
  const trashCount = noteTrashCount + deletedWidgetCount;

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

  // 1. Mobile Companion Mode on small screens unless user specifically toggled Desktop
  if (isMobileCompanionActive) {
    return (
      <>
        <Suspense fallback={null}>
          <MobileCompanion
            tabs={visibleTabs}
            activeTabId={activeTabIdResolved}
            notes={notes}
            widgets={tabWidgets}
            onSelectTab={handleSelectTab}
            onAddNote={addNote}
            onUpdateNote={updateNote}
            onDeleteNote={deleteNote}
            onUpdateWidget={updateWidget}
            onRemoveWidget={handleRequestRemoveWidget}
            onAddWidget={addWidget}
            onToggleDesktopView={handleEnterDesktopMode}
            onOpenSettings={handleOpenSettings}
            onSwipePointerDown={handleCanvasSwipePointerDown}
            transitionClass={swipeTransitionClass}
          />
          <div className="contents" onPointerDownCapture={handleCanvasSwipePointerDown}>
            {activeChoreOverlay && (
              <ChoreDashboardView
                isOpen={true}
                mode="overlay"
                title={activeChoreOverlay.title}
                config={activeChoreOverlay.config}
                dockPaddingClass=""
                onClose={() => setChoreFullScreenOpen(false)}
              />
            )}
            {activeKanbanOverlay && (
              <KanbanBoardView
                isOpen={true}
                mode="overlay"
                widgetId={activeKanbanOverlay.widgetId}
                title={activeKanbanOverlay.title}
                config={activeKanbanOverlay.config}
                isLight={activeKanbanOverlay.isLight}
                dockPaddingClass=""
                onUpdateConfig={(updates) => {
                  const live = useDashboardStore
                    .getState()
                    .widgets.find((w) => w.id === activeKanbanOverlay.widgetId);
                  if (live) {
                    void updateWidget(live.id, { config: { ...live.config, ...updates } });
                  }
                }}
                onClose={() => setKanbanFullScreenOverlay(null)}
              />
            )}
          </div>
          {isParentDrawerOpen && <ParentChoreDrawer />}
        </Suspense>
        <SyncRefusedBanner withDock={false} />
        <GlobalTimerAlarmOverlay
          visibleTabs={visibleTabs}
          activeTabId={activeTabIdResolved}
          isAnyModalOpen={isAnyOverlayOpen}
          onSelectTab={handleSelectTab}
        />
        {widgetSafetyOverlays}
        {isSettingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => {
                setIsSettingsOpen(false);
                lockKiosk();
              }}
              onOpenQuickStart={() => setIsQuickStartOpen(true)}
            />
          </Suspense>
        )}
        {isQuickStartOpen && (
          <Suspense fallback={null}>
            <QuickStartModal
              isOpen={isQuickStartOpen}
              onClose={() => setIsQuickStartOpen(false)}
              onOpenSettings={handleOpenSettings}
              onOpenChoresHub={() => {
                setKanbanFullScreenOverlay(null);
                setChoreFullScreenOpen(true);
              }}
            />
          </Suspense>
        )}
        {activeWebModal && (
          <Suspense fallback={null}>
            <InAppWebViewerModal
              isOpen={Boolean(activeWebModal)}
              url={activeWebModal.url}
              title={activeWebModal.title}
              onClose={() => setActiveWebModal(null)}
            />
          </Suspense>
        )}
        {pinChallenge && (
          <PinOverlay
            title={pinChallenge.title}
            subtitle={pinChallenge.subtitle}
            onUnlock={handlePinUnlock}
            onPinRemoved={finishPinChallenge}
            onCancel={() => setPinChallenge(null)}
          />
        )}
      </>
    );
  }

  // Dynamic padding based on Dock position (omitted if dock is hidden for full immersion)
  const dockPaddingClasses = settings.isDockHidden
    ? ''
    : {
        left: 'pl-20',
        right: 'pr-20',
        top: 'pt-20',
        bottom: 'pb-20',
      }[settings.dockPosition];

  const displayedTab = screensaverCanvasTab || activeTab;
  const displayedTabId = screensaverCanvasTab ? screensaverCanvasTab.id : activeTabIdResolved;
  const displayedWidgets = screensaverCanvasTab ? screensaverCanvasWidgets : tabWidgets;
  const displayedNotes = screensaverCanvasTab ? screensaverCanvasNotes : activeCanvasNotes;
  const displayedDockPadding = isCanvasScreensaverActive ? '' : dockPaddingClasses;
  const displayedIsCanvasLocked = isCanvasScreensaverActive ? true : isCanvasLocked;

  const isCanvasLight = isCanvasThemeLight(displayedTab?.backgroundTheme);
  const isOledNightClock = Boolean(
    settings.nightModeEnabled && settings.nightModeStyle === 'oled_clock'
  );
  const hideBackgroundCorkboard = isOledNightClock || isPhotoScreensaverActive;

  return (
    <div
      data-display-orientation={isPortraitDesktop ? 'portrait' : 'landscape'}
      onPointerDownCapture={handleCanvasSwipePointerDown}
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

      {/* Full native 1:1 Canvas (visibility hidden under opaque OLED Night Clock or Photo Slideshow Screensaver to suspend background decoding) */}
      <div
        className={
          hideBackgroundCorkboard
            ? 'w-full h-full invisible pointer-events-none'
            : `w-full h-full${swipeTransitionClass ? ` ${swipeTransitionClass}` : ''}`
        }
      >
        <Corkboard
          notes={displayedNotes}
          widgets={displayedWidgets}
          tabs={visibleTabs}
          activeTabId={displayedTabId}
          dockPaddingClass={displayedDockPadding}
          backgroundTheme={displayedTab?.backgroundTheme || 'midnight_dots'}
          customWallpaperUrl={displayedTab?.customWallpaperUrl}
          backgroundDimLevel={displayedTab?.backgroundDimLevel ?? 45}
          hideNotes={Boolean(displayedTab?.hideNotes)}
          isCreatorOpen={isNoteCreatorOpen}
          onOpenCreator={handleOpenCreator}
          onCloseCreator={handleCloseCreator}
          isTrashOpen={isTrashOpen}
          onCloseTrash={handleCloseTrash}
          onUpdateNotePos={updateNotePosition}
          onUpdateWidgetPos={updateWidgetPosition}
          onAddNote={addNote}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onPermanentlyDeleteNote={permanentlyDeleteNote}
          onPermanentlyDeleteNotes={permanentlyDeleteNotes}
          onAddWidget={addWidget}
          onRemoveWidget={handleRequestRemoveWidget}
          onOpenAddWidget={handleOpenAddWidget}
          onUpdateWidget={updateWidget}
          onUpdateTab={updateTab}
          snapToGrid={settings.snapToGrid}
          isCanvasLocked={displayedIsCanvasLocked}
        />
      </div>

      {/* Navigation Dock - Pinned at Viewport Level (hidden during edge-to-edge Canvas Screensaver) */}
      {!isCanvasScreensaverActive && (
        <NavigationDock
          tabs={visibleTabs}
          activeTabId={activeTabIdResolved}
          dockPosition={settings.dockPosition}
          isLocked={isSettingsLocked}
          isCanvasLocked={isCanvasLocked}
          onSelectTab={handleSelectTab}
          onOpenSettings={handleOpenSettings}
          onOpenShare={handleOpenShare}
          onToggleNightMode={handleToggleNightMode}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          onConnectFile={handleOpenBackupModal}
          hasFileBound={hasFileBound}
          onOpenAddWidget={handleOpenAddWidget}
          onOpenAddCanvas={handleOpenAddCanvas}
          onOpenCreateNote={handleOpenCreator}
          onOpenQuickStart={handleOpenQuickStart}
          onOpenTrash={handleOpenTrash}
          trashCount={trashCount}
          onAutoOrganize={handleAutoOrganizeActiveTab}
          onUndoOrganize={handleUndoActiveTabLayout}
          canUndoOrganize={canUndoActiveTabLayout}
          onToggleMobileCompanion={isMobileViewport ? handleEnterMobileCompanion : undefined}
          isDockHidden={settings.isDockHidden}
          onToggleDockHidden={toggleDockHidden}
          isNightMode={settings.nightModeEnabled}
        />
      )}

      {/* Idle Photo / Canvas Screensaver Mode (yields automatically to Night Mode, dialogs & alarms) */}
      {showIdleScreensaver && (
        <Suspense fallback={null}>
          <IdlePhotoScreensaver
            onWake={handleWakeIdleScreensaver}
            mode={effectiveScreensaver.mode}
            photoStyle={normalizeIdleScreensaverPhotoStyle(settings.idleScreensaverPhotoStyle)}
            mosaicKenBurns={Boolean(settings.idleScreensaverMosaicKenBurns)}
            polaroidCount={normalizeIdleScreensaverPolaroidCount(
              settings.idleScreensaverPolaroidCount
            )}
            polaroidSizeMode={normalizeIdleScreensaverPolaroidSizeMode(
              settings.idleScreensaverPolaroidSizeMode
            )}
            rotationIntervalSec={normalizeIdleScreensaverRotationSec(
              settings.idleScreensaverRotationIntervalSec
            )}
            photoOrder={normalizeIdleScreensaverPhotoOrder(settings.idleScreensaverPhotoOrder)}
            showCaptions={settings.idleScreensaverShowCaptions !== false}
            showDateTaken={settings.idleScreensaverShowDateTaken}
            showClock={
              effectiveScreensaver.mode === 'canvas'
                ? Boolean(settings.idleScreensaverCanvasShowOverlay) &&
                  settings.idleScreensaverShowClock !== false
                : settings.idleScreensaverShowClock !== false
            }
            showWeather={
              effectiveScreensaver.mode === 'canvas'
                ? Boolean(settings.idleScreensaverCanvasShowOverlay) &&
                  settings.idleScreensaverShowWeather !== false
                : settings.idleScreensaverShowWeather !== false
            }
            weatherLocation={screensaverWeatherLocation}
          />
        </Suspense>
      )}

      {/* Night Mode Screen Overlay */}
      <NightMode
        enabled={settings.nightModeEnabled}
        style={settings.nightModeStyle}
        dimOpacity={settings.nightDimOpacity}
        onWake={handleWakeFromNightMode}
      />

      {/* Realtime Version Update Prompt & Refresh Banner */}
      <UpdateNotificationBanner />

      {/* Device-Local Plex Pairing Prompt when Plex is configured on dashboard */}
      <PlexReauthBanner onOpenPlexAuth={handleOpenPlexPairing} />

      {/* Shown when the cloud refuses some changes because the board is full */}
      <SyncRefusedBanner />

      {/* Cross-Tab Repeating Kitchen Timer Alarm Overlay */}
      <GlobalTimerAlarmOverlay
        visibleTabs={visibleTabs}
        activeTabId={activeTabIdResolved}
        isAnyModalOpen={isAnyOverlayOpen}
        onSelectTab={handleSelectTab}
      />

      {/* Dedicated Plex Pairing Modal */}
      {isPlexPairingModalOpen && (() => {
        const isCommonPlex =
          settings.commonPhotoSourceType === 'plex' ||
          Boolean(settings.commonPhotoSourceLabel?.toLowerCase().includes('plex')) ||
          Boolean(settings.commonPhotos?.some((p) => p.source === 'plex'));
        const firstPlexWidget = !isCommonPlex
          ? widgets.find(
              (w) =>
                !w.deleted_at &&
                w.type === 'photo_frame' &&
                w.config?.useCommonSource === false &&
                (w.config?.sourceType === 'plex' ||
                  w.config?.sourceLabel?.toLowerCase().includes('plex'))
            )
          : undefined;
        const pairingAsCommon = isCommonPlex || !firstPlexWidget;

        return (
          <Suspense fallback={null}>
            <PhotoSourcesModal
              isOpen={true}
              onClose={() => {
                setIsPlexPairingModalOpen(false);
                lockKiosk();
              }}
              initialTab="plex"
              isCommonSource={pairingAsCommon}
              targetWidgetId={pairingAsCommon ? undefined : firstPlexWidget?.id}
              currentSourceLabel={
                pairingAsCommon
                  ? (settings.commonPhotoSourceLabel || 'Plex Photos')
                  : (firstPlexWidget?.config?.sourceLabel || 'Plex Photos')
              }
              currentSourceType="plex"
              currentPhotoCount={
                pairingAsCommon
                  ? settings.commonPhotos?.length
                  : firstPlexWidget?.config?.customPhotos?.length
              }
              onPhotosLoaded={(newPhotos, sourceName, sourceUrl, sourceType, applyToAll, plexSyncConfig, curatedCategoryId) => {
                if (applyToAll || pairingAsCommon || !firstPlexWidget) {
                  applyCommonPhotosToAllWidgets(
                    newPhotos,
                    sourceName,
                    sourceUrl,
                    sourceType,
                    plexSyncConfig,
                    curatedCategoryId
                  );
                } else {
                  updateWidget(firstPlexWidget.id, {
                    config: {
                      ...firstPlexWidget.config,
                      useCommonSource: false,
                      customPhotos: newPhotos,
                      sourceLabel: sourceName,
                      sourceType: sourceType || 'plex',
                      sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
                      plexSyncConfig: sourceType === 'plex' ? plexSyncConfig : undefined,
                      curatedCategoryId: undefined,
                    },
                  });
                }
                setIsPlexPairingModalOpen(false);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('plex_auth_changed', { detail: { hasToken: true } }));
                }
              }}
            />
          </Suspense>
        );
      })()}

      {/* Parent PIN Challenge Overlay */}
      {pinChallenge && (
        <PinOverlay
          title={pinChallenge.title}
          subtitle={pinChallenge.subtitle}
          onUnlock={handlePinUnlock}
          onPinRemoved={finishPinChallenge}
          onCancel={() => setPinChallenge(null)}
        />
      )}

      <Suspense fallback={null}>
        {/* Household sharing, opened from the dock's quick menu */}
        {isShareOpen && (
          <ShareBoardModal
            isOpen={isShareOpen}
            onClose={() => {
              setIsShareOpen(false);
              lockKiosk();
            }}
          />
        )}

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
            onClose={handleCloseAddWidget}
            activeTabId={activeTabIdResolved}
            onAddWidget={addWidget}
          />
        )}

        {isCreateCanvasOpen && (
          <CreateCanvasModal
            isOpen={isCreateCanvasOpen}
            onClose={handleCloseCreateCanvas}
            existingCanvasCount={tabs.length}
            onCreateCanvas={(name, icon, theme, wallpaperUrl, dimLevel, blueprintId) => {
              addTab(name, icon, theme, wallpaperUrl, dimLevel, blueprintId);
            }}
          />
        )}

        {/* Settings & Customization Modal */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => {
              setIsSettingsOpen(false);
              lockKiosk();
            }}
            onOpenQuickStart={() => setIsQuickStartOpen(true)}
            onPreviewScreensaver={handlePreviewScreensaver}
          />
        )}

        {/* Quick Start & How-To Carousel Walkthrough */}
        {isQuickStartOpen && (
          <QuickStartModal
            isOpen={isQuickStartOpen}
            onClose={() => setIsQuickStartOpen(false)}
            onOpenSettings={handleOpenSettings}
            onOpenAddWidget={isCanvasLocked ? undefined : () => setIsAddWidgetOpen(true)}
            onOpenCreateNote={isCanvasLocked ? undefined : () => setIsNoteCreatorOpen(true)}
            onOpenChoresHub={() => {
              setKanbanFullScreenOverlay(null);
              setChoreFullScreenOpen(true);
            }}
          />
        )}

        {/* In-App Web Viewer Modal Frame for External Links */}
        {activeWebModal && (
          <InAppWebViewerModal
            isOpen={Boolean(activeWebModal)}
            url={activeWebModal.url}
            title={activeWebModal.title}
            onClose={() => setActiveWebModal(null)}
          />
        )}

        {/* Full-Screen Chore & Reward Hub View */}
        {activeChoreOverlay && (
          <ChoreDashboardView
            isOpen={true}
            mode="overlay"
            title={activeChoreOverlay.title}
            config={activeChoreOverlay.config}
            dockPaddingClass={dockPaddingClasses}
            onClose={() => setChoreFullScreenOpen(false)}
          />
        )}

        {/* Full-Screen Kanban Board View */}
        {activeKanbanOverlay && (
          <KanbanBoardView
            isOpen={true}
            mode="overlay"
            widgetId={activeKanbanOverlay.widgetId}
            title={activeKanbanOverlay.title}
            config={activeKanbanOverlay.config}
            isLight={activeKanbanOverlay.isLight}
            dockPaddingClass={dockPaddingClasses}
            onUpdateConfig={(updates) => {
              const live = useDashboardStore
                .getState()
                .widgets.find((w) => w.id === activeKanbanOverlay.widgetId);
              if (live) {
                void updateWidget(live.id, { config: { ...live.config, ...updates } });
              }
            }}
            onClose={() => setKanbanFullScreenOverlay(null)}
          />
        )}

        {/* Unified 4-Digit Parent PIN Chore & Reward Drawer */}
        {isParentDrawerOpen && <ParentChoreDrawer />}
      </Suspense>
      {widgetSafetyOverlays}
    </div>
  );
}

export default App;
