import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPinLockTransition,
  isCanvasPinLocked,
  isSettingsPinRequired,
  normalizePinLockSettings,
  sanitizePinDigits,
  validatePinSetup,
} from '../src/utils/pinValidation.ts';
import type { AppSettings } from '../src/types/dashboard';

function makePinSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 'global',
    dashboardTitle: 'Ambiently Command Center',
    dockPosition: 'left',
    carouselEnabled: true,
    defaultRotateDurationSec: 30,
    displayDensity: 1.0,
    wakeLockEnabled: true,
    nightModeEnabled: false,
    nightModeStart: '22:00',
    nightModeEnd: '07:00',
    nightModeStyle: 'dim',
    nightDimOpacity: 0.85,
    nightModeWakeTimeoutMin: 2,
    nightScheduleEnabled: true,
    snapToGrid: false,
    defaultWidgetStyle: 'auto',
    isDockHidden: false,
    autoHideCursor: true,
    cursorIdleTimeoutSec: 3,
    commonPhotos: [],
    photoAutoSyncInterval: 'daily',
    pinLockEnabled: false,
    pinHash: null,
    isLocked: false,
    lockFullscreenKiosk: true,
    lockCanvasEditing: false,
    lockSettingsAccess: true,
    settingsPinOptOut: false,
    updated_at: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('pinValidation double-entry PIN setup and lock normalization', () => {
  it('strips non-digits and caps PIN drafts at 4 digits', () => {
    assert.equal(sanitizePinDigits('a1b2c3d4e5'), '1234');
    assert.equal(sanitizePinDigits(''), '');
    assert.equal(sanitizePinDigits('09-87!'), '0987');
  });

  it('validates empty, incomplete, mismatched, and matching 4-digit PINs', () => {
    assert.deepEqual(validatePinSetup('', ''), {
      canSubmit: false,
      hasMismatch: false,
      errorMessage: null,
    });

    assert.deepEqual(validatePinSetup('258', '2'), {
      canSubmit: false,
      hasMismatch: true,
      errorMessage: 'Enter a 4-digit PIN first.',
    });

    assert.deepEqual(validatePinSetup('2580', '25'), {
      canSubmit: false,
      hasMismatch: false,
      errorMessage: null,
    });

    assert.deepEqual(validatePinSetup('2580', '26'), {
      canSubmit: false,
      hasMismatch: true,
      errorMessage: 'PINs do not match.',
    });

    assert.deepEqual(validatePinSetup('2580', '2589'), {
      canSubmit: false,
      hasMismatch: true,
      errorMessage: 'PINs do not match.',
    });

    assert.deepEqual(validatePinSetup('2580', '2580'), {
      canSubmit: true,
      hasMismatch: false,
      errorMessage: null,
    });
  });

  it('heals legacy lockSettingsAccess=false residue on active or re-enabled PINs unless explicitly opted out', () => {
    // Legacy poisoned DB row (PIN enabled, lockSettingsAccess stuck at false without opt-out)
    const poisoned = makePinSettings({
      pinLockEnabled: true,
      pinHash: 'sha256-pin',
      lockSettingsAccess: false,
      settingsPinOptOut: undefined,
    });
    const healed = normalizePinLockSettings(poisoned);
    assert.equal(healed.repaired, true);
    assert.equal(healed.settings.lockSettingsAccess, true);
    assert.equal(isSettingsPinRequired(healed.settings), true);

    // Disable -> Re-enable PIN cycle restores settings protection instead of inheriting false
    const disabledPatch = applyPinLockTransition(poisoned, null);
    assert.equal(disabledPatch.pinLockEnabled, false);
    assert.equal(disabledPatch.lockSettingsAccess, true);
    assert.equal(disabledPatch.settingsPinOptOut, false);

    const reenabledPatch = applyPinLockTransition(
      { ...poisoned, ...disabledPatch },
      'sha256-new-pin'
    );
    assert.equal(reenabledPatch.pinLockEnabled, true);
    assert.equal(reenabledPatch.lockSettingsAccess, true);
    assert.equal(reenabledPatch.lockFullscreenKiosk, true);
    assert.equal(
      isSettingsPinRequired({
        ...poisoned,
        ...reenabledPatch,
      }),
      true
    );

    // Explicit user opt-out (settingsPinOptOut=true) is respected
    const optedOut = makePinSettings({
      pinLockEnabled: true,
      pinHash: 'sha256-pin',
      lockSettingsAccess: false,
      settingsPinOptOut: true,
      lockCanvasEditing: true,
    });
    const normalizedOptOut = normalizePinLockSettings(optedOut);
    assert.equal(normalizedOptOut.repaired, false);
    assert.equal(normalizedOptOut.settings.lockSettingsAccess, false);
    assert.equal(isSettingsPinRequired(normalizedOptOut.settings), false);
    assert.equal(isCanvasPinLocked(normalizedOptOut.settings), true);
  });

  it('enforces settings & canvas locks whenever a valid PIN hash is active', () => {
    assert.equal(
      isSettingsPinRequired(makePinSettings({ pinLockEnabled: true, pinHash: null })),
      false
    );
    assert.equal(
      isSettingsPinRequired(makePinSettings({ pinLockEnabled: true, pinHash: 'sha256' })),
      true
    );
    assert.equal(
      isCanvasPinLocked(
        makePinSettings({ pinLockEnabled: false, pinHash: null, lockCanvasEditing: true })
      ),
      false
    );
    assert.equal(
      isCanvasPinLocked(
        makePinSettings({ pinLockEnabled: true, pinHash: 'sha256', lockCanvasEditing: true })
      ),
      true
    );
  });
});
