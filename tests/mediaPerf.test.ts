import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIA_CACHE_NAME,
  MAX_CLOUD_INLINE_DATA_URL_CHARS,
  deriveGiphyMp4Url,
  deriveGiphyWebpUrl,
  isCacheableExternalMediaUrl,
  isGiphyCdnHost,
  resolveOptimizedImageMedia,
  resolveOrWarmCachedMedia,
  sanitizeWidgetConfigForCloud,
} from '../src/utils/mediaOptimization';
import { createSharedClockTicker } from '../src/utils/sharedClock';

describe('mediaOptimization helpers', () => {
  let restoreMocks: (() => void) | null = null;

  afterEach(() => {
    restoreMocks?.();
    restoreMocks = null;
  });

  it('matches only static GIPHY and Wikimedia HTTPS media hosts', () => {
    assert.equal(isGiphyCdnHost('media.giphy.com'), true);
    assert.equal(isGiphyCdnHost('media2.giphy.com'), true);
    assert.equal(isGiphyCdnHost('i.giphy.com'), true);
    assert.equal(isGiphyCdnHost('api.giphy.com'), false);
    assert.equal(isGiphyCdnHost('evil-giphy.com'), false);

    assert.equal(
      isCacheableExternalMediaUrl('https://media.giphy.com/media/abc/giphy.gif'),
      true
    );
    assert.equal(
      isCacheableExternalMediaUrl('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg'),
      true
    );
    assert.equal(
      isCacheableExternalMediaUrl('https://api.giphy.com/v1/gifs/trending?api_key=123'),
      false
    );
    assert.equal(
      isCacheableExternalMediaUrl('http://media.giphy.com/media/abc/giphy.gif'),
      false
    );
    assert.equal(
      isCacheableExternalMediaUrl('https://plex.direct:32400/library/parts/1/file.jpg?X-Plex-Token=abc'),
      false
    );
  });

  it('derives .webp and .mp4 URLs from GIPHY CDN .gif URLs while preserving query strings', () => {
    assert.equal(
      deriveGiphyWebpUrl('https://media2.giphy.com/media/xyz123/giphy.gif?cid=test&rid=giphy.gif'),
      'https://media2.giphy.com/media/xyz123/giphy.webp?cid=test&rid=giphy.gif'
    );
    assert.equal(
      deriveGiphyMp4Url('https://i.giphy.com/media/xyz123/200.GIF?foo=bar'),
      'https://i.giphy.com/media/xyz123/200.mp4?foo=bar'
    );
    assert.equal(deriveGiphyWebpUrl('https://api.giphy.com/v1/gifs/search.gif'), null);
    assert.equal(deriveGiphyMp4Url('https://media.giphy.com/media/xyz/giphy.png'), null);
  });

  it('resolves MP4 video for opaque GIPHY GIFs and animated WebP with preserved alpha for stickers & legacy GIFs', () => {
    // 1. Explicit GIPHY GIF with MP4 stream
    const gifMedia = resolveOptimizedImageMedia({
      url: 'https://media.giphy.com/media/abc/giphy.webp',
      mp4Url: 'https://media.giphy.com/media/abc/giphy.mp4',
      mediaSource: 'giphy_gif',
    });
    assert.equal(gifMedia.videoUrl, 'https://media.giphy.com/media/abc/giphy.mp4');
    assert.equal(gifMedia.optimizedImgUrl, 'https://media.giphy.com/media/abc/giphy.webp');
    assert.equal(gifMedia.isAnimated, true);

    // 2. Transparent GIPHY sticker MUST NOT use MP4 (no alpha channel)
    const stickerMedia = resolveOptimizedImageMedia({
      url: 'https://media.giphy.com/media/st1/giphy.gif',
      mp4Url: 'https://media.giphy.com/media/st1/giphy.mp4',
      mediaSource: 'giphy_sticker',
    });
    assert.equal(stickerMedia.videoUrl, null);
    assert.equal(stickerMedia.optimizedImgUrl, 'https://media.giphy.com/media/st1/giphy.webp');
    assert.equal(stickerMedia.fallbackImgUrl, 'https://media.giphy.com/media/st1/giphy.gif');

    // 3. Legacy GIPHY .gif without mediaSource upgrades safely to animated .webp (not MP4)
    const legacyMedia = resolveOptimizedImageMedia({
      url: 'https://media.giphy.com/media/legacy1/giphy.gif',
    });
    assert.equal(legacyMedia.videoUrl, null);
    assert.equal(legacyMedia.optimizedImgUrl, 'https://media.giphy.com/media/legacy1/giphy.webp');
    assert.equal(legacyMedia.fallbackImgUrl, 'https://media.giphy.com/media/legacy1/giphy.gif');
    assert.equal(legacyMedia.isAnimated, true);

    // 4. Direct custom MP4/WebM URL
    const directMp4 = resolveOptimizedImageMedia({
      url: 'https://cdn.example.com/clip.mp4',
      mediaSource: 'custom',
    });
    assert.equal(directMp4.videoUrl, 'https://cdn.example.com/clip.mp4');
    assert.equal(directMp4.optimizedImgUrl, '');
  });

  it('strips customPhotos and oversized inline Data URLs before cloud sync while keeping vault/https URLs', () => {
    const oversizedDataUrl = `data:image/gif;base64,${'A'.repeat(MAX_CLOUD_INLINE_DATA_URL_CHARS + 50)}`;
    const cleanedBig = sanitizeWidgetConfigForCloud({
      url: oversizedDataUrl,
      title: 'Giant GIF',
      customPhotos: [{ id: 'p1' }],
      transparentBg: true,
    });
    assert.equal('customPhotos' in cleanedBig, false);
    assert.equal('url' in cleanedBig, false);
    assert.equal(cleanedBig.title, 'Giant GIF');
    assert.equal(cleanedBig.transparentBg, true);

    const cleanedNormal = sanitizeWidgetConfigForCloud({
      url: 'vault://local-media:123-abc',
      mp4Url: 'https://media.giphy.com/media/abc/giphy.mp4',
      customPhotos: [],
    });
    assert.equal(cleanedNormal.url, 'vault://local-media:123-abc');
    assert.equal(cleanedNormal.mp4Url, 'https://media.giphy.com/media/abc/giphy.mp4');
    assert.equal('customPhotos' in cleanedNormal, false);
  });

  it('warms CacheStorage cleanly with CORS/omit and returns cached blob ObjectURLs on hits', async () => {
    const cacheEntries = new Map<string, Response>();
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const originalCaches = (globalThis as any).caches;
    const originalFetch = globalThis.fetch;

    let releaseWarmFetch: (() => void) | null = null;
    const warmFinished = new Promise<void>((resolve) => {
      releaseWarmFetch = resolve;
    });

    (globalThis as any).caches = {
      async open(name: string) {
        assert.equal(name, MEDIA_CACHE_NAME);
        return {
          async match(req: Request | string) {
            const key = typeof req === 'string' ? req : req.url;
            return cacheEntries.get(key);
          },
          async put(req: Request | string, res: Response) {
            const key = typeof req === 'string' ? req : req.url;
            cacheEntries.set(key, res);
            releaseWarmFetch?.();
          },
          async keys() {
            return Array.from(cacheEntries.keys()).map((u) => new Request(u));
          },
          async delete(req: Request | string) {
            const key = typeof req === 'string' ? req : req.url;
            return cacheEntries.delete(key);
          },
        };
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push({ url, init });
      return new Response(new Uint8Array([0, 1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      });
    }) as typeof fetch;

    restoreMocks = () => {
      if (originalCaches === undefined) {
        delete (globalThis as any).caches;
      } else {
        (globalThis as any).caches = originalCaches;
      }
      globalThis.fetch = originalFetch;
    };

    const mediaUrl = 'https://media.giphy.com/media/warmtest/giphy.mp4';
    const first = await resolveOrWarmCachedMedia(mediaUrl);
    assert.equal(first, null);

    await warmFinished;
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].init?.mode, 'cors');
    assert.equal(fetchCalls[0].init?.credentials, 'omit');

    const hitUrl = await resolveOrWarmCachedMedia(mediaUrl);
    assert.ok(hitUrl && hitUrl.startsWith('blob:'));
    URL.revokeObjectURL(hitUrl);
    assert.equal(fetchCalls.length, 1);
  });
});

describe('createSharedClockTicker', () => {
  it('shares one aligned timer across multiple subscribers, scales cadence, and pauses when hidden or empty', () => {
    let fakeNow = 10_250; // 750ms until next second, 9750ms until next 10s boundary
    let hidden = false;
    let nextTimerId = 1;
    let scheduledTimers = new Map<number, { delay: number; cb: () => void }>();
    let visibilityHandler: (() => void) | null = null;
    let visibilityUnsubscribed = false;

    const ticker = createSharedClockTicker({
      nowFn: () => fakeNow,
      isHiddenFn: () => hidden,
      setTimeoutFn: (cb, ms) => {
        const id = nextTimerId++;
        scheduledTimers.set(id, { delay: ms, cb });
        return id as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: (id) => {
        scheduledTimers.delete(id as unknown as number);
      },
      onVisibilitySubscribe: (onVisible) => {
        visibilityHandler = onVisible;
        visibilityUnsubscribed = false;
        return () => {
          visibilityUnsubscribed = true;
          visibilityHandler = null;
        };
      },
    });

    let tenSecTicks = 0;
    let secTicksA = 0;
    let secTicksB = 0;

    // 1. Subscribing at '10s' schedules one 10s-aligned timer
    const unsubTenSec = ticker.subscribe('10s', () => {
      tenSecTicks += 1;
    });
    assert.equal(scheduledTimers.size, 1);
    assert.equal(Array.from(scheduledTimers.values())[0].delay, 9750);

    // 2. Adding two 'second' subscribers upgrades to a single 1s-aligned timer
    const unsubSecA = ticker.subscribe('second', () => {
      secTicksA += 1;
    });
    const unsubSecB = ticker.subscribe('second', () => {
      secTicksB += 1;
    });
    assert.deepEqual(ticker.getSubscriberCounts(), { second: 2, tenSec: 1 });
    assert.equal(scheduledTimers.size, 1);
    assert.equal(Array.from(scheduledTimers.values())[0].delay, 750);

    // Fire at 11_000 (within same 10s bucket): only 'second' subscribers fire
    fakeNow = 11_000;
    const [firstTimer] = Array.from(scheduledTimers.values());
    scheduledTimers.clear();
    firstTimer.cb();
    assert.equal(secTicksA, 1);
    assert.equal(secTicksB, 1);
    assert.equal(tenSecTicks, 0);
    assert.equal(scheduledTimers.size, 1);

    // Fire at 20_000 (new 10s bucket): all subscribers fire
    fakeNow = 20_000;
    const [secondTimer] = Array.from(scheduledTimers.values());
    scheduledTimers.clear();
    secondTimer.cb();
    assert.equal(secTicksA, 2);
    assert.equal(secTicksB, 2);
    assert.equal(tenSecTicks, 1);

    // 3. Unsubscribing all 'second' listeners downgrades active timer back to 10s
    unsubSecA();
    unsubSecB();
    assert.deepEqual(ticker.getSubscriberCounts(), { second: 0, tenSec: 1 });
    assert.equal(scheduledTimers.size, 1);
    assert.equal(Array.from(scheduledTimers.values())[0].delay, 10000);

    // 4. Tab hidden stops ticking; becoming visible refreshes immediately & reschedules
    hidden = true;
    const [hiddenTimer] = Array.from(scheduledTimers.values());
    scheduledTimers.clear();
    hiddenTimer.cb();
    assert.equal(ticker.hasActiveTimer(), false);
    assert.equal(tenSecTicks, 1);

    hidden = false;
    fakeNow = 35_400;
    visibilityHandler?.();
    assert.equal(tenSecTicks, 2);
    assert.equal(ticker.getSnapshot(), 35_400);
    assert.equal(scheduledTimers.size, 1);

    // 5. Removing final listener clears timer and visibility hook
    unsubTenSec();
    assert.equal(ticker.hasActiveTimer(), false);
    assert.equal(scheduledTimers.size, 0);
    assert.equal(visibilityUnsubscribed, true);
  });
});
