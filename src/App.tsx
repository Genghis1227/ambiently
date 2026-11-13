import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useDashboardStore } from './store/dashboardStore';
import { useChoreStore } from './store/choreStore';
import { NavigationDock } from './components/dock/NavigationDock';
import { Corkboard } from './components/layout/Corkboard';
import { PinOverlay } from './components/kiosk/PinOverlay';
import { NightMode } from './components/kiosk/NightMode';
import { openLocalFileBinding, useFileSync, checkFileBindingStatus } from './services/fileSync';
import {
  subscribeToRealtimeBoard,
  resolveActiveDashboardId,
  clearLegacyJoinKeys,
  onAuthStateChange,
  pullFromCloud,
  getCurrentUser,
  isRealtimeConnected,
} from './services/supabase';
import { useIdleCursor } from './hooks/useIdleCursor';
import { isCanvasThemeLight } from './data/canvasThemes';
import { isTimeInNightWindow } from './utils/nightMode';
import { initUpdateChecker } from './services/updateChecker';
import { UpdateNotificationBanner } from './components/common/UpdateNotificationBanner';
import { PlexReauthBanner } from './components/common/PlexReauthBanner';
import { SyncRefusedBanner } from './components/common/SyncRefusedBanner';

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
const ParentChoreDrawer = lazy(() =>
  import('./components/chores/ParentChoreDrawer').then((m) => ({ default: m.ParentChoreDrawer }))
);
const QuickStartModal = lazy(() =>
  import('./components/settings/QuickStartModal').then((m) => ({ default: m.QuickStartModal }))
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
    rotateToTab,
    isUnlocked,
    unlockKiosk,
    isCarouselPaused,
    pauseCarouselTemporarily,
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
    permanentlyDeleteNotes,
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
  const setChoreFullScreenOpen = useChoreStore((s) => s.setFullScreenOpen);
  const isParentDrawerOpen = useChoreStore((s) => s.isParentDrawerOpen);

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
          const res = await pullFromCloud({ force: true });
          if (res.success && res.hasChanges) {
            await initStore();
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
    let isCancelled = false;
    let lastPollTime = 0;

    const pullFreshCloudData = async (force = false) => {
      try {
        const user = await getCurrentUser();
        if (user && !isCancelled) {
          const res = await pullFromCloud({ force });
          if (res.success && res.hasChanges && !isCancelled) {
            await initStore();
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

  // Responsive Mobile Detection (< 768px) with manual toggle override
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [forceDesktopMode, setForceDesktopMode] = useState(false);

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

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Granular protection controls (active only when PIN protection is configured and session is not unlocked)
  const isSettingsLocked = Boolean(settings.pinLockEnabled && settings.lockSettingsAccess !== false && !isUnlocked);
  const isCanvasLocked = Boolean(settings.pinLockEnabled && settings.lockCanvasEditing && !isUnlocked);

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

      // Never trigger background canvas hotkeys when any modal, PIN pad, or full-screen hub is open
      if (
        pinChallenge ||
        isParentDrawerOpen ||
        isChoreFullScreenOpen ||
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
        const activeTabs = tabs.filter((t) => !t.deleted_at);
        if (activeTabs[index]) {
          e.preventDefault();
          setActiveTabId(activeTabs[index].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toggleDockHidden,
    tabs,
    setActiveTabId,
    activeWebModal,
    pinChallenge,
    isParentDrawerOpen,
    isChoreFullScreenOpen,
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

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Error attempting to enable fullscreen:', err.message);
      });
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
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

  // The household sharing screen and Plex sign-in are settings too, so they need the PIN the same way
  const handleOpenShare = () => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_share',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to manage who can use this board',
      });
      return;
    }
    setIsShareOpen(true);
  };

  const handleOpenPlexPairing = () => {
    if (isSettingsLocked) {
      setPinChallenge({
        action: 'open_plex_pairing',
        title: 'Kiosk Settings Locked',
        subtitle: 'Enter parent PIN to sign in to Plex',
      });
      return;
    }
    setIsPlexPairingModalOpen(true);
  };

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

  const visibleTabs = tabs.filter((t) =>
    t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false
  );

  const homeTab = visibleTabs.find((t) => t.isHome) || visibleTabs[0] || tabs[0];
  const activeTab = visibleTabs.find((t) => t.id === activeTabId) || homeTab;
  const activeTabIdResolved = activeTab?.id || 'tab-corkboard';

  // `visibleTabs` is a new array on every render, and a background cloud refresh renders every 60
  // seconds. Depending on the ids instead keeps that from restarting the countdown.
  const visibleTabIds = visibleTabs.map((t) => t.id).join('\n');
  const rotateDurationSec = settings.defaultRotateDurationSec || 30;
  const isAnyOverlayOpen = Boolean(
    isChoreFullScreenOpen ||
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
    if (!settings.carouselEnabled || isCarouselPaused || isAnyOverlayOpen || tabIds.length <= 1) return;

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
      rotateToTab(tabIds[nextIndex]);
    }, rotateDurationSec * 1000);

    return () => clearInterval(interval);
  }, [
    settings.carouselEnabled,
    isCarouselPaused,
    isAnyOverlayOpen,
    rotateDurationSec,
    visibleTabIds,
    activeTabIdResolved,
    rotateToTab,
  ]);

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

  const tabWidgets = widgets.filter((w) => w.tabId === activeTabIdResolved);

  // 1. Mobile Companion Mode on small screens unless user specifically toggled Desktop
  if (isMobileViewport && !forceDesktopMode) {
    return (
      <>
        <Suspense fallback={null}>
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
          {isChoreFullScreenOpen && (
            <ChoreDashboardView
              isOpen={isChoreFullScreenOpen}
              onClose={() => setChoreFullScreenOpen(false)}
            />
          )}
          {isParentDrawerOpen && <ParentChoreDrawer />}
        </Suspense>
        <SyncRefusedBanner withDock={false} />
        {isSettingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
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
              onOpenChoresHub={() => setChoreFullScreenOpen(true)}
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
          onPermanentlyDeleteNotes={permanentlyDeleteNotes}
          onAddWidget={addWidget}
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
        onOpenShare={handleOpenShare}
        onToggleNightMode={handleToggleNightMode}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        onConnectFile={() => setIsBackupModalOpen(true)}
        hasFileBound={hasFileBound}
        onOpenAddWidget={() => setIsAddWidgetOpen(true)}
        onOpenAddCanvas={() => setIsCreateCanvasOpen(true)}
        onOpenCreateNote={() => setIsNoteCreatorOpen(true)}
        onOpenQuickStart={() => setIsQuickStartOpen(true)}
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
        onWake={handleWakeFromNightMode}
      />

      {/* Realtime Version Update Prompt & Refresh Banner */}
      <UpdateNotificationBanner />

      {/* Device-Local Plex Pairing Prompt when Plex is configured on dashboard */}
      <PlexReauthBanner onOpenPlexAuth={handleOpenPlexPairing} />

      {/* Shown when the cloud refuses some changes because the board is full */}
      <SyncRefusedBanner />

      {/* Dedicated Plex Pairing Modal */}
      {isPlexPairingModalOpen && (
        <Suspense fallback={null}>
          <PhotoSourcesModal
            isOpen={true}
            onClose={() => setIsPlexPairingModalOpen(false)}
            initialTab="plex"
            isCommonSource={true}
            currentSourceLabel={settings.commonPhotoSourceLabel || 'Plex Photos'}
            currentSourceType="plex"
            currentPhotoCount={settings.commonPhotos?.length}
            onPhotosLoaded={(newPhotos, sourceName, sourceUrl, sourceType) => {
              applyCommonPhotosToAllWidgets(newPhotos, sourceName, sourceUrl, sourceType);
              setIsPlexPairingModalOpen(false);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('plex_auth_changed', { detail: { hasToken: true } }));
              }
            }}
          />
        </Suspense>
      )}

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
        {isShareOpen && <ShareBoardModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />}

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
            onOpenQuickStart={() => setIsQuickStartOpen(true)}
          />
        )}

        {/* Quick Start & How-To Carousel Walkthrough */}
        {isQuickStartOpen && (
          <QuickStartModal
            isOpen={isQuickStartOpen}
            onClose={() => setIsQuickStartOpen(false)}
            onOpenSettings={handleOpenSettings}
            onOpenAddWidget={() => setIsAddWidgetOpen(true)}
            onOpenCreateNote={() => setIsNoteCreatorOpen(true)}
            onOpenChoresHub={() => setChoreFullScreenOpen(true)}
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
        {isChoreFullScreenOpen && (
          <ChoreDashboardView
            isOpen={isChoreFullScreenOpen}
            onClose={() => setChoreFullScreenOpen(false)}
          />
        )}

        {/* Unified 4-Digit Parent PIN Chore & Reward Drawer */}
        {isParentDrawerOpen && <ParentChoreDrawer />}
      </Suspense>
    </div>
  );
}

export default App;
