import { create } from 'zustand';
import { APP_VERSION } from '../data/changelog';

export interface VersionInfo {
  version: string;
  buildTime?: string;
}

interface UpdateState {
  currentVersion: string;
  latestVersion: string;
  isUpdateAvailable: boolean;
  isChecking: boolean;
  lastChecked: number | null;
  isDismissed: boolean;
  checkForUpdates: () => Promise<boolean>;
  dismissUpdate: () => void;
  applyUpdate: () => void;
}

export const useUpdateChecker = create<UpdateState>((set, get) => ({
  currentVersion: APP_VERSION,
  latestVersion: APP_VERSION,
  isUpdateAvailable: false,
  isChecking: false,
  lastChecked: null,
  isDismissed: false,

  checkForUpdates: async () => {
    set({ isChecking: true });
    try {
      // 1. Fetch live version.json from the server bypassing cache
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      let foundUpdate = false;
      let remoteVersion = get().currentVersion;

      if (res.ok) {
        const data: VersionInfo = await res.json();
        remoteVersion = data.version || remoteVersion;

        // Compare semantic or version string (e.g. "0.2.4" vs "0.2.3")
        if (data.version && data.version !== get().currentVersion) {
          foundUpdate = true;
        }
      }

      // 2. Also check Service Worker if available
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting) {
              foundUpdate = true;
            }
          }
        } catch {
          // Ignore service worker check failures in unsupported environments
        }
      }

      set({
        isChecking: false,
        lastChecked: Date.now(),
        latestVersion: remoteVersion,
        isUpdateAvailable: foundUpdate,
      });

      return foundUpdate;
    } catch (err) {
      console.warn('Update check failed:', err);
      set({ isChecking: false, lastChecked: Date.now() });
      return false;
    }
  },

  dismissUpdate: () => {
    set({ isDismissed: true });
  },

  applyUpdate: () => {
    // If there is a waiting Service Worker, tell it to take over
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }).catch(() => {});
    }

    // Force hard reload from server
    window.location.reload();
  },
}));

// Setup global automatic background listener & timer
let isInitialized = false;

export function initUpdateChecker() {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  const store = useUpdateChecker.getState();

  // Initial check after 3 seconds
  const initialTimer = setTimeout(() => {
    store.checkForUpdates();
  }, 3000);

  // Poll every 5 minutes (300,000ms)
  const intervalTimer = setInterval(() => {
    store.checkForUpdates();
  }, 5 * 60 * 1000);

  // Check whenever user switches tabs or wakes screen
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      store.checkForUpdates();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('focus', onVisibilityChange);

  // Listen to service worker controller change
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New service worker activated, reload to get latest version
      window.location.reload();
    });
  }

  return () => {
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('focus', onVisibilityChange);
  };
}
