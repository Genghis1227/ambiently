import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOTTOM_EDGE_CLEARANCE_RATIO,
  TOP_EDGE_CLEARANCE_RATIO,
  resolveWidgetToolbarPlacement,
} from '../src/utils/widgetToolbarPlacement';

describe('Widget floating action toolbar placement (widgetToolbarPlacement)', () => {
  it('places toolbar strictly outside the top edge when top clearance exists', () => {
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: false,
        yRatio: 0.2,
        hRatio: 0.4,
      }),
      'outside-top'
    );
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: false,
        yRatio: TOP_EDGE_CLEARANCE_RATIO,
        hRatio: 0.8,
      }),
      'outside-top'
    );
  });

  it('flips toolbar strictly outside the bottom edge for top-row tiles (e.g. Smart Bento Grid top rows)', () => {
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: false,
        yRatio: 0.03,
        hRatio: 0.46,
      }),
      'outside-bottom'
    );
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: false,
        yRatio: 0.0,
        hRatio: BOTTOM_EDGE_CLEARANCE_RATIO,
      }),
      'outside-bottom'
    );
  });

  it('uses compact top-center pill for fullscreen tiles or columns spanning both top and bottom edges', () => {
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: false,
        yRatio: 0.03,
        hRatio: 0.94,
      }),
      'compact-pill'
    );
    assert.equal(
      resolveWidgetToolbarPlacement({
        isFullScreen: true,
        yRatio: 0.2,
        hRatio: 0.4,
      }),
      'compact-pill'
    );
  });
});
