import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultWidgetStickerMode,
  isStickerCapableWidget,
  isWidgetStickerMode,
} from '../src/utils/widgetStickerMode';
import type { DashboardWidget } from '../src/types/dashboard';

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
});
