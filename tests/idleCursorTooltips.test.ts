import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  restoreDocumentTooltips,
  suppressDocumentTooltips,
  suppressElementTooltip,
} from '../src/hooks/useIdleCursor';

describe('Idle cursor native browser tooltip suppression', () => {
  it('strips native title tooltips when hidden and preserves aria-label and attributes', () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <div id="mosaic-tile" aria-label="Photo tile" title="Click to focus this photo with Ken Burns"></div>
      <button id="prev-btn" aria-label="Previous photo" title="Previous photo (Go back)"></button>
    </body></html>`);

    suppressDocumentTooltips(document);

    const tile = document.getElementById('mosaic-tile')!;
    const prevBtn = document.getElementById('prev-btn')!;

    assert.equal(tile.hasAttribute('title'), false);
    assert.equal(tile.getAttribute('aria-label'), 'Photo tile');
    assert.equal(
      tile.getAttribute('data-idle-suppressed-title'),
      'Click to focus this photo with Ken Burns'
    );

    assert.equal(prevBtn.hasAttribute('title'), false);
    assert.equal(prevBtn.getAttribute('aria-label'), 'Previous photo');
    assert.equal(prevBtn.getAttribute('data-idle-suppressed-title'), 'Previous photo (Go back)');
  });

  it('re-stashes updated title attributes while cursor stays hidden without losing latest text', () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <div id="mosaic-tile" title="Click to focus this photo with Ken Burns"></div>
    </body></html>`);

    suppressDocumentTooltips(document);
    const tile = document.getElementById('mosaic-tile')!;
    assert.equal(tile.hasAttribute('title'), false);

    // Simulate React updating `title` on focus rotation while pointer remains hidden
    tile.setAttribute('title', 'Currently in focus (Click to advance photo)');
    suppressElementTooltip(tile);

    assert.equal(tile.hasAttribute('title'), false);
    assert.equal(
      tile.getAttribute('data-idle-suppressed-title'),
      'Currently in focus (Click to advance photo)'
    );

    restoreDocumentTooltips(document);
    assert.equal(tile.getAttribute('title'), 'Currently in focus (Click to advance photo)');
    assert.equal(tile.hasAttribute('data-idle-suppressed-title'), false);
  });

  it('restores suppressed titles cleanly on cursor wake without overwriting explicit wake-time titles', () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <div id="tile-a" title="Click to focus this photo with Ken Burns"></div>
      <div id="tile-b" title="Click to advance this photo"></div>
    </body></html>`);

    suppressDocumentTooltips(document);

    const tileA = document.getElementById('tile-a')!;
    const tileB = document.getElementById('tile-b')!;

    // Suppose tileB explicitly got a new title during wake
    tileB.setAttribute('title', 'Explicitly updated title');

    restoreDocumentTooltips(document);

    assert.equal(tileA.getAttribute('title'), 'Click to focus this photo with Ken Burns');
    assert.equal(tileA.hasAttribute('data-idle-suppressed-title'), false);

    assert.equal(tileB.getAttribute('title'), 'Explicitly updated title');
    assert.equal(tileB.hasAttribute('data-idle-suppressed-title'), false);
  });
});
