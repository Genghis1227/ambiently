import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHALK_STROKES,
  MAX_POINTS_PER_STROKE,
  appendChalkStroke,
  decodeStrokePoints,
  encodeStrokePoints,
  getBrushWidthPx,
  normalizePointToBoard,
  renderChalkStrokesToCanvas,
  sanitizeChalkStrokes,
  simplifyPointsRDP,
  undoLastChalkStroke,
} from '../src/utils/chalkboardEngine';
import {
  DEFAULT_SOUNDSCAPE_CHANNELS,
  SOUNDSCAPE_PRESETS,
  createCrossfadedNoiseBufferData,
  detectMatchingSoundscapePreset,
  formatSleepTimerRemaining,
  hasAudibleSoundscapeChannel,
  resolveMasterVolume,
  resolveSoundscapeChannels,
  shouldAutoFadeOutForNightMode,
} from '../src/utils/soundscapeEngine';

describe('chalkboardEngine', () => {
  it('normalizes client coordinates into clamped 0..1000 board space', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    assert.deepEqual(normalizePointToBoard(300, 150, rect), { x: 500, y: 500 });
    assert.deepEqual(normalizePointToBoard(0, 0, rect), { x: 0, y: 0 });
    assert.deepEqual(normalizePointToBoard(900, 900, rect), { x: 1000, y: 1000 });
  });

  it('simplifies collinear points via RDP and preserves endpoints under cap', () => {
    const collinear = Array.from({ length: 40 }, (_, i) => ({ x: i * 25, y: i * 12 }));
    const simplified = simplifyPointsRDP(collinear, 2.5);
    assert.equal(simplified.length, 2);
    assert.deepEqual(simplified[0], { x: 0, y: 0 });
    assert.deepEqual(simplified[1], { x: 975, y: 468 });

    const denseZigZag = Array.from({ length: 300 }, (_, i) => ({
      x: Math.round((i / 299) * 1000),
      y: i % 2 === 0 ? 150 : 850,
    }));
    const capped = simplifyPointsRDP(denseZigZag, 1);
    assert.ok(capped.length <= MAX_POINTS_PER_STROKE);
    assert.deepEqual(capped[0], denseZigZag[0]);
    assert.deepEqual(capped[capped.length - 1], denseZigZag[denseZigZag.length - 1]);
  });

  it('encodes, decodes, sanitizes, appends, and undoes strokes safely', () => {
    const pts = [
      { x: 10, y: 20 },
      { x: 150, y: 240 },
    ];
    const encoded = encodeStrokePoints(pts);
    assert.deepEqual(encoded, [10, 20, 150, 240]);
    assert.deepEqual(decodeStrokePoints(encoded), pts);

    const dirty = [
      null,
      { id: 'empty', tool: 'chalk', color: '#fff', size: 'fine', points: [10] },
      {
        id: 'good-1',
        tool: 'marker',
        color: '#fde047',
        size: 'bold',
        points: [-5, 50, 1200, 400],
      },
    ];
    const cleaned = sanitizeChalkStrokes(dirty);
    assert.equal(cleaned.length, 1);
    assert.deepEqual(cleaned[0], {
      id: 'good-1',
      tool: 'marker',
      color: '#fde047',
      size: 'bold',
      points: [0, 50, 1000, 400],
    });

    let list = cleaned;
    for (let i = 0; i < MAX_CHALK_STROKES + 10; i++) {
      list = appendChalkStroke(list, {
        id: `s-${i}`,
        tool: 'chalk',
        color: '#f8fafc',
        size: 'medium',
        points: [10, 10, 20, 20],
      });
    }
    assert.equal(list.length, MAX_CHALK_STROKES);
    assert.equal(list[list.length - 1].id, `s-${MAX_CHALK_STROKES + 9}`);
    assert.equal(undoLastChalkStroke(list).length, MAX_CHALK_STROKES - 1);
  });

  it('scales brush width proportionally and renders chalk, marker, and destination-out eraser paths', () => {
    assert.ok(getBrushWidthPx('bold', 'eraser', 400) > getBrushWidthPx('bold', 'chalk', 400));

    const ops: string[] = [];
    let cleared = false;
    const mockCtx = {
      save() {},
      restore() {},
      clearRect() {
        cleared = true;
      },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
      arc() {},
      fill() {
        ops.push(`fill:${this.globalCompositeOperation}`);
      },
      stroke() {
        ops.push(`stroke:${this.globalCompositeOperation}`);
      },
      lineCap: 'butt',
      lineJoin: 'miter',
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    renderChalkStrokesToCanvas(
      mockCtx,
      500,
      300,
      [
        {
          id: 'c1',
          tool: 'chalk',
          color: '#f8fafc',
          size: 'medium',
          points: [50, 50, 200, 100, 400, 180],
        },
        {
          id: 'e1',
          tool: 'eraser',
          color: '#000000',
          size: 'bold',
          points: [100, 100],
        },
      ],
      {
        id: 'm1',
        tool: 'marker',
        color: '#7dd3fc',
        size: 'fine',
        points: [500, 500, 700, 600],
      }
    );

    assert.equal(cleared, true);
    assert.ok(ops.includes('stroke:source-over'));
    assert.ok(ops.includes('fill:destination-out'));
  });
});

describe('soundscapeEngine', () => {
  it('resolves channel mixes, master volume, presets, and audible state safely', () => {
    assert.deepEqual(resolveSoundscapeChannels(undefined), DEFAULT_SOUNDSCAPE_CHANNELS);
    assert.deepEqual(resolveSoundscapeChannels({}), DEFAULT_SOUNDSCAPE_CHANNELS);
    assert.deepEqual(resolveSoundscapeChannels({ rain: 140, ocean: -10 }), {
      rain: 100,
      fireplace: 0,
      brown_noise: 0,
      ocean: 0,
      forest_wind: 0,
    });

    assert.equal(resolveMasterVolume(undefined), 70);
    assert.equal(resolveMasterVolume(125), 100);
    assert.equal(resolveMasterVolume(0), 0);

    assert.equal(
      detectMatchingSoundscapePreset(SOUNDSCAPE_PRESETS.rainy_study.channels),
      'rainy_study'
    );
    assert.equal(
      detectMatchingSoundscapePreset({
        rain: 42,
        fireplace: 0,
        brown_noise: 0,
        ocean: 0,
        forest_wind: 0,
      }),
      'custom'
    );

    assert.equal(
      hasAudibleSoundscapeChannel(SOUNDSCAPE_PRESETS.deep_slumber.channels, 60),
      true
    );
    assert.equal(
      hasAudibleSoundscapeChannel(SOUNDSCAPE_PRESETS.deep_slumber.channels, 0),
      false
    );
    assert.equal(
      hasAudibleSoundscapeChannel(
        { rain: 0, fireplace: 0, brown_noise: 0, ocean: 0, forest_wind: 0 },
        80
      ),
      false
    );
    assert.equal(formatSleepTimerRemaining(95), '1:35');
  });

  it('triggers smooth Night Mode fade-out only when entering Night Mode while actively playing', () => {
    assert.equal(
      shouldAutoFadeOutForNightMode({
        wasNightMode: false,
        isNightMode: true,
        isPlaying: true,
        fadeOutOnNightMode: true,
      }),
      true
    );
    assert.equal(
      shouldAutoFadeOutForNightMode({
        wasNightMode: true,
        isNightMode: true,
        isPlaying: true,
        fadeOutOnNightMode: true,
      }),
      false
    );
    assert.equal(
      shouldAutoFadeOutForNightMode({
        wasNightMode: false,
        isNightMode: true,
        isPlaying: false,
        fadeOutOnNightMode: true,
      }),
      false
    );
    assert.equal(
      shouldAutoFadeOutForNightMode({
        wasNightMode: false,
        isNightMode: true,
        isPlaying: true,
        fadeOutOnNightMode: false,
      }),
      false
    );
  });

  it('generates bounded, non-silent, deterministically crossfaded loop noise buffers', () => {
    for (const kind of ['white', 'pink', 'brown', 'crackle'] as const) {
      const pcm = createCrossfadedNoiseBufferData(16000, 1.0, kind, 12345);
      assert.equal(pcm.length, 16000);
      let energy = 0;
      for (let i = 0; i < pcm.length; i++) {
        const s = pcm[i];
        assert.ok(Number.isFinite(s) && s >= -1 && s <= 1, `${kind} sample out of range: ${s}`);
        energy += s * s;
      }
      const rms = Math.sqrt(energy / pcm.length);
      assert.ok(rms > 0.001, `${kind} noise buffer should be audible (rms=${rms})`);
    }
  });
});
