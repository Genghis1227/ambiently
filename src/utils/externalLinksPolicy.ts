export type ExternalBrowserLinksPolicy = 'auto' | 'always' | 'kiosk_qr_only';

export type ExternalLinkKioskReason = 'policy_locked' | 'fullscreen_kiosk' | 'pin_locked' | null;

export interface ExternalBrowserLinkAccess {
  canOpenInBrowser: boolean;
  shouldExitFullscreenBeforeOpen: boolean;
  kioskReason: ExternalLinkKioskReason;
}

/**
 * Normalizes the per-device external browser links policy setting (`'auto' | 'always' | 'kiosk_qr_only'`).
 */
export function normalizeExternalBrowserLinksPolicy(value: unknown): ExternalBrowserLinksPolicy {
  if (value === 'always' || value === 'kiosk_qr_only') {
    return value;
  }
  return 'auto';
}

/**
 * Detects whether the current window is running in fullscreen display mode (e.g. Chromium `--kiosk` or installed PWA fullscreen).
 */
export function detectDisplayModeFullscreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return (
      window.matchMedia('(display-mode: fullscreen)').matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone && window.innerHeight >= window.screen.height - 2)
    );
  } catch {
    return false;
  }
}

/**
 * Evaluates whether "Open in Browser" should be offered for an external link, or hidden in favor
 * of "Open on Phone (QR)" + "Copy Link" to prevent trapping kiosk displays in external tabs without chrome.
 */
export function resolveExternalBrowserLinkAccess(params: {
  policy?: unknown;
  isDocumentFullscreen: boolean;
  isDisplayModeFullscreen: boolean;
  isKioskPinLocked: boolean;
}): ExternalBrowserLinkAccess {
  const normalizedPolicy = normalizeExternalBrowserLinksPolicy(params.policy);

  if (normalizedPolicy === 'kiosk_qr_only') {
    return {
      canOpenInBrowser: false,
      shouldExitFullscreenBeforeOpen: false,
      kioskReason: 'policy_locked',
    };
  }

  if (normalizedPolicy === 'always') {
    return {
      canOpenInBrowser: true,
      shouldExitFullscreenBeforeOpen: Boolean(params.isDocumentFullscreen),
      kioskReason: null,
    };
  }

  if (params.isKioskPinLocked) {
    return {
      canOpenInBrowser: false,
      shouldExitFullscreenBeforeOpen: false,
      kioskReason: 'pin_locked',
    };
  }

  if (params.isDocumentFullscreen || params.isDisplayModeFullscreen) {
    return {
      canOpenInBrowser: false,
      shouldExitFullscreenBeforeOpen: false,
      kioskReason: 'fullscreen_kiosk',
    };
  }

  return {
    canOpenInBrowser: true,
    shouldExitFullscreenBeforeOpen: false,
    kioskReason: null,
  };
}
