import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultWidgetStickerMode,
  isStickerCapableWidget,
  isWidgetStickerMode,
} from '../src/utils/widgetStickerMode';
import {
  keepLocalWidgetFields,
  mergeCloudSettingsForLocal,
  shouldAcceptCloudRow,
  shouldAcceptCloudSettings,
} from '../src/services/syncMerge';
import type { AppSettings, DashboardWidget } from '../src/types/dashboard';

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
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
    updated_at: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

function makeWidget(
  type: DashboardWidget['type'],
  config: Record<string, any> = {}
): DashboardWidget {
  return {
    id: `w-${type}`,
    tabId: 'tab-corkboard',
    type,
    title: type,
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    config,
    updated_at: '2026-11-13T10:00:00.000Z',
  };
}

describe('widgetStickerMode defaults and overrides', () => {
  it('supports sticker mode only on compatible ambient, typography, and media widgets', () => {
    assert.equal(isStickerCapableWidget('image'), true);
    assert.equal(isStickerCapableWidget('textbox'), true);
    assert.equal(isStickerCapableWidget('clock'), true);
    assert.equal(isStickerCapableWidget('world_clock'), true);
    assert.equal(isStickerCapableWidget('clock_weather'), true);
    assert.equal(isStickerCapableWidget('weather'), true);
    assert.equal(isStickerCapableWidget('countdown'), true);
    assert.equal(isStickerCapableWidget('quotes'), true);
    assert.equal(isStickerCapableWidget('photo_frame'), true);

    assert.equal(isStickerCapableWidget('chores'), false);
    assert.equal(isStickerCapableWidget('meals'), false);
    assert.equal(isStickerCapableWidget('calendar'), false);
    assert.equal(isStickerCapableWidget('rss'), false);
    assert.equal(isStickerCapableWidget('sticky_notes'), false);
    assert.equal(isStickerCapableWidget('embed'), false);
  });

  it('evaluates auto, sticker, and bordered global defaults accurately', () => {
    // Auto: image & textbox default to true; other capable widgets default to false
    assert.equal(getDefaultWidgetStickerMode('image', 'auto'), true);
    assert.equal(getDefaultWidgetStickerMode('textbox', 'auto'), true);
    assert.equal(getDefaultWidgetStickerMode('clock', 'auto'), false);
    assert.equal(getDefaultWidgetStickerMode('photo_frame', 'auto'), false);

    // Sticker: all capable widgets default to true; non-capable stay false
    assert.equal(getDefaultWidgetStickerMode('clock', 'sticker'), true);
    assert.equal(getDefaultWidgetStickerMode('weather', 'sticker'), true);
    assert.equal(getDefaultWidgetStickerMode('countdown', 'sticker'), true);
    assert.equal(getDefaultWidgetStickerMode('photo_frame', 'sticker'), true);
    assert.equal(getDefaultWidgetStickerMode('chores', 'sticker'), false);

    // Bordered: all widgets (including image & textbox) default to false
    assert.equal(getDefaultWidgetStickerMode('image', 'bordered'), false);
    assert.equal(getDefaultWidgetStickerMode('textbox', 'bordered'), false);
    assert.equal(getDefaultWidgetStickerMode('clock', 'bordered'), false);
  });

  it('respects explicit per-widget transparentBg and textbox bgStyle overrides over global defaults', () => {
    assert.equal(isWidgetStickerMode(makeWidget('clock'), 'sticker'), true);
    assert.equal(isWidgetStickerMode(makeWidget('clock', { transparentBg: false }), 'sticker'), false);
    assert.equal(isWidgetStickerMode(makeWidget('clock', { transparentBg: true }), 'bordered'), true);

    assert.equal(isWidgetStickerMode(makeWidget('image'), 'bordered'), false);
    assert.equal(isWidgetStickerMode(makeWidget('image', { transparentBg: true }), 'bordered'), true);

    assert.equal(isWidgetStickerMode(makeWidget('textbox'), 'bordered'), false);
    assert.equal(isWidgetStickerMode(makeWidget('textbox', { bgStyle: 'glass', transparentBg: true }), 'sticker'), false);
    assert.equal(isWidgetStickerMode(makeWidget('textbox', { bgStyle: 'transparent', transparentBg: true }), 'bordered'), true);
  });

  it('accepts cloud settings and widget sticker configs during Restore from Cloud even when local timestamps are newer', () => {
    const newerLocalTime = Date.parse('2026-11-14T12:00:00.000Z');
    const olderCloudTime = Date.parse('2026-11-14T10:00:00.000Z');

    assert.equal(
      shouldAcceptCloudSettings({
        switchingBoards: false,
        joiningExistingCloudBoard: false,
        overwriteLocal: true,
        hasLocalSettings: true,
        isMember: false,
        firstSyncThisWay: false,
        localTime: newerLocalTime,
        cloudTime: olderCloudTime,
        boardTime: olderCloudTime,
      }),
      true
    );

    assert.equal(
      shouldAcceptCloudRow({
        overwriteLocal: true,
        hasLocalRow: true,
        localTime: newerLocalTime,
        cloudTime: olderCloudTime,
      }),
      true
    );

    const cloudClock = makeWidget('clock', { transparentBg: true });
    const localClock = makeWidget('clock', { transparentBg: false });
    const restoredClock = keepLocalWidgetFields(cloudClock, { ...localClock, mobileOrder: 2 });
    assert.equal(restoredClock.config?.transparentBg, true);
    assert.equal(restoredClock.mobileOrder, 2);

    const cloudTextbox = makeWidget('textbox', { bgStyle: 'transparent', transparentBg: true });
    const localTextbox = makeWidget('textbox', { bgStyle: 'glass', transparentBg: false });
    const restoredTextbox = keepLocalWidgetFields(cloudTextbox, localTextbox);
    assert.equal(restoredTextbox.config?.bgStyle, 'transparent');
    assert.equal(restoredTextbox.config?.transparentBg, true);
  });

  it('restores defaultWidgetStyle when signing into an existing cloud board on a fresh or wiped browser while keeping local PIN locks', () => {
    const localTimeAfterPinSetup = Date.parse('2026-11-14T12:00:00.000Z');
    const olderBoardTime = Date.parse('2026-11-14T08:00:00.000Z');

    assert.equal(
      shouldAcceptCloudSettings({
        switchingBoards: false,
        joiningExistingCloudBoard: true,
        overwriteLocal: false,
        hasLocalSettings: true,
        isMember: false,
        firstSyncThisWay: true,
        localTime: localTimeAfterPinSetup,
        cloudTime: olderBoardTime,
        boardTime: olderBoardTime,
      }),
      true
    );

    const defaultSettings = makeSettings();
    const localWithPin = makeSettings({
      defaultWidgetStyle: 'auto',
      pinLockEnabled: true,
      pinHash: 'sha256-local-pin',
      lockCanvasEditing: true,
      lockFullscreenKiosk: true,
      lockSettingsAccess: true,
    });

    const merged = mergeCloudSettingsForLocal({
      defaultSettings,
      cloudSettings: {
        defaultWidgetStyle: 'sticker',
        pinLockEnabled: false,
        pinHash: null,
        lockCanvasEditing: false,
      },
      currentSettings: localWithPin,
      resolvedCommonPhotos: [],
      cloudSettingsAt: '2026-11-14T08:00:00.000Z',
      preserveDeviceLocks: true,
    });

    assert.equal(merged.defaultWidgetStyle, 'sticker');
    assert.equal(merged.pinLockEnabled, true);
    assert.equal(merged.pinHash, 'sha256-local-pin');
    assert.equal(merged.lockCanvasEditing, true);
    assert.equal(merged.lockFullscreenKiosk, true);
    assert.equal(merged.lockSettingsAccess, true);
    assert.equal(merged.updated_at, '2026-11-14T08:00:00.000Z');
  });

  it('prevents legacy cloud lockSettingsAccess=false payloads from disabling settings lock when a PIN is set', () => {
    const defaultSettings = makeSettings();
    const localNoPin = makeSettings({
      pinLockEnabled: false,
      pinHash: null,
      lockSettingsAccess: true,
      settingsPinOptOut: false,
    });

    // Legacy cloud row pushed before client lock sanitization contained lockSettingsAccess: false
    const mergedWithoutPin = mergeCloudSettingsForLocal({
      defaultSettings,
      cloudSettings: {
        defaultWidgetStyle: 'sticker',
        pinLockEnabled: false,
        pinHash: null,
        lockCanvasEditing: false,
        lockFullscreenKiosk: false,
        lockSettingsAccess: false,
      },
      currentSettings: localNoPin,
      resolvedCommonPhotos: [],
      cloudSettingsAt: '2026-11-14T09:00:00.000Z',
      preserveDeviceLocks: true,
    });

    assert.equal(mergedWithoutPin.lockSettingsAccess, true);
    assert.equal(mergedWithoutPin.settingsPinOptOut, false);

    // Existing active-PIN device with legacy poisoned lockSettingsAccess=false (no opt-out) also heals to true
    const legacyPoisonedWithPin = makeSettings({
      pinLockEnabled: true,
      pinHash: 'sha256-local-pin',
      lockSettingsAccess: false,
      settingsPinOptOut: undefined,
    });
    const healedFromMerge = mergeCloudSettingsForLocal({
      defaultSettings,
      cloudSettings: {
        lockSettingsAccess: false,
      },
      currentSettings: legacyPoisonedWithPin,
      resolvedCommonPhotos: [],
      cloudSettingsAt: '2026-11-14T09:05:00.000Z',
      preserveDeviceLocks: true,
    });

    assert.equal(healedFromMerge.pinLockEnabled, true);
    assert.equal(healedFromMerge.pinHash, 'sha256-local-pin');
    assert.equal(healedFromMerge.lockSettingsAccess, true);
    assert.equal(healedFromMerge.settingsPinOptOut, false);
  });
});
