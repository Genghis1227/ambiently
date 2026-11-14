import type { AppSettings } from '../types/dashboard';

export interface PinValidationResult {
  canSubmit: boolean;
  hasMismatch: boolean;
  errorMessage: string | null;
}

/**
 * Strips non-digit characters and caps a PIN draft to 4 numeric digits.
 */
export function sanitizePinDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/**
 * Validates double-entry 4-digit PIN setup or change drafts without revealing masked digits.
 */
export function validatePinSetup(pin: string, confirmPin: string): PinValidationResult {
  if (confirmPin.length === 0) {
    return { canSubmit: false, hasMismatch: false, errorMessage: null };
  }

  if (!/^\d{4}$/.test(pin)) {
    return { canSubmit: false, hasMismatch: true, errorMessage: 'Enter a 4-digit PIN first.' };
  }

  if (confirmPin.length < 4) {
    if (!/^\d+$/.test(confirmPin) || !pin.startsWith(confirmPin)) {
      return { canSubmit: false, hasMismatch: true, errorMessage: 'PINs do not match.' };
    }
    return { canSubmit: false, hasMismatch: false, errorMessage: null };
  }

  if (confirmPin.length === 4 && pin === confirmPin) {
    return { canSubmit: true, hasMismatch: false, errorMessage: null };
  }

  return { canSubmit: false, hasMismatch: true, errorMessage: 'PINs do not match.' };
}

/**
 * Repairs legacy or disabled PIN lock fields so `lockSettingsAccess` cannot stay stuck at `false`
 * unless the user explicitly opted out via `settingsPinOptOut`.
 */
export function normalizePinLockSettings(settings: AppSettings): {
  settings: AppSettings;
  repaired: boolean;
} {
  const hasActivePin = Boolean(settings.pinLockEnabled && settings.pinHash);
  const settingsPinOptOut = Boolean(settings.settingsPinOptOut);
  const expectedLockSettings = !settingsPinOptOut;

  if (!hasActivePin) {
    const normalized: AppSettings = {
      ...settings,
      pinLockEnabled: false,
      pinHash: null,
      lockCanvasEditing: false,
      lockFullscreenKiosk: false,
      settingsPinOptOut,
      lockSettingsAccess: expectedLockSettings,
    };
    const repaired =
      settings.pinLockEnabled !== normalized.pinLockEnabled ||
      (settings.pinHash ?? null) !== normalized.pinHash ||
      settings.lockCanvasEditing !== normalized.lockCanvasEditing ||
      settings.lockFullscreenKiosk !== normalized.lockFullscreenKiosk ||
      settings.settingsPinOptOut !== normalized.settingsPinOptOut ||
      settings.lockSettingsAccess !== normalized.lockSettingsAccess;
    return { settings: repaired ? normalized : settings, repaired };
  }

  if (settings.lockSettingsAccess !== expectedLockSettings) {
    return {
      settings: {
        ...settings,
        lockSettingsAccess: expectedLockSettings,
      },
      repaired: true,
    };
  }

  return { settings, repaired: false };
}

/**
 * Produces the PIN and kiosk lock field updates when setting or clearing the Parent PIN.
 */
export function applyPinLockTransition(
  current: AppSettings,
  nextPinHash: string | null
): Pick<
  AppSettings,
  | 'pinLockEnabled'
  | 'pinHash'
  | 'lockCanvasEditing'
  | 'lockFullscreenKiosk'
  | 'lockSettingsAccess'
  | 'settingsPinOptOut'
> {
  if (nextPinHash) {
    const settingsPinOptOut = Boolean(current.settingsPinOptOut);
    return {
      pinLockEnabled: true,
      pinHash: nextPinHash,
      lockCanvasEditing: Boolean(current.lockCanvasEditing),
      lockFullscreenKiosk: true,
      settingsPinOptOut,
      lockSettingsAccess: !settingsPinOptOut,
    };
  }

  return {
    pinLockEnabled: false,
    pinHash: null,
    lockCanvasEditing: false,
    lockFullscreenKiosk: false,
    lockSettingsAccess: true,
    settingsPinOptOut: false,
  };
}

/**
 * Returns true when opening Command Center Settings / Share / Plex Pairing must prompt for the Parent PIN.
 */
export function isSettingsPinRequired(
  settings: Pick<AppSettings, 'pinLockEnabled' | 'pinHash' | 'lockSettingsAccess' | 'settingsPinOptOut'>
): boolean {
  return Boolean(
    settings.pinLockEnabled &&
      settings.pinHash &&
      !settings.settingsPinOptOut &&
      settings.lockSettingsAccess !== false
  );
}

/**
 * Returns true when canvas layout editing is locked by an active Parent PIN.
 */
export function isCanvasPinLocked(
  settings: Pick<AppSettings, 'pinLockEnabled' | 'pinHash' | 'lockCanvasEditing'>
): boolean {
  return Boolean(settings.pinLockEnabled && settings.pinHash && settings.lockCanvasEditing);
}
