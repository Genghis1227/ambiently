import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cachePhotosLocally, PHOTO_CACHE_NAME, type PhotoItem } from '../src/services/photos';

interface MockCacheStore {
  entries: Map<string, Response>;
}

function installMockCacheAndFetch(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>
) {
  const store: MockCacheStore = { entries: new Map() };
  const originalCaches = (globalThis as any).caches;
  const originalFetch = globalThis.fetch;

  (globalThis as any).caches = {
    async open(name: string) {
      assert.equal(name, PHOTO_CACHE_NAME);
      return {
        async match(reqOrUrl: Request | string) {
          const key = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
          return store.entries.get(key);
        },
        async put(reqOrUrl: Request | string, res: Response) {
          const key = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
          store.entries.set(key, res);
        },
        async keys() {
          return Array.from(store.entries.keys()).map((u) => new Request(u));
        },
        async delete(reqOrUrl: Request | string) {
          const key = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
          return store.entries.delete(key);
        },
      };
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return fetchImpl(url, init);
  }) as typeof fetch;

  return {
    store,
    restore() {
      if (originalCaches === undefined) {
        delete (globalThis as any).caches;
      } else {
        (globalThis as any).caches = originalCaches;
      }
      globalThis.fetch = originalFetch;
    },
  };
}

describe('Offline Photo Cache (cachePhotosLocally)', () => {
  let restoreFn: (() => void) | null = null;

  beforeEach(() => {
    restoreFn = null;
  });

  afterEach(() => {
    restoreFn?.();
  });

  it('fetches HTTPS photos with CORS (credentials omitted), normalizes Google Photos URLs, and skips Plex / non-HTTPS / error / opaque responses', async () => {
    const seenCalls: Array<{ url: string; init?: RequestInit }> = [];
    const { store, restore } = installMockCacheAndFetch(async (url, init) => {
      seenCalls.push({ url, init });
      if (url.includes('fail-404')) {
        return new Response('Not found', { status: 404 });
      }
      if (url.includes('opaque-host')) {
        const res = new Response('img');
        Object.defineProperty(res, 'type', { value: 'opaque' });
        return res;
      }
      return new Response('jpeg-bytes', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    });
    restoreFn = restore;

    const photos: PhotoItem[] = [
      { id: '1', url: 'https://images.unsplash.com/photo-valid-1', source: 'curated' },
      { id: '2', url: 'https://lh3.googleusercontent.com/abc123=w1920-h1080', source: 'web' },
      { id: '3', url: 'https://plex.direct:32400/photo/:/transcode?url=1', source: 'plex' },
      { id: '4', url: 'blob:https://dashboard.trinhism.com/local-1', source: 'local' },
      { id: '5', url: 'http://insecure.example.com/pic.jpg', source: 'web' },
      { id: '6', url: 'https://cdn.example.com/fail-404.jpg', source: 'web' },
      { id: '7', url: 'https://opaque-host.example.com/pic.jpg', source: 'web' },
    ];

    await cachePhotosLocally(photos);

    // Every network call must use CORS mode and omit credentials
    assert.equal(seenCalls.length, 4);
    for (const call of seenCalls) {
      assert.equal(call.init?.mode, 'cors');
      assert.equal(call.init?.credentials, 'omit');
    }

    // Only valid 200 non-opaque HTTPS responses are stored; Google Photos normalized to =w1920
    assert.deepEqual(Array.from(store.entries.keys()), [
      'https://images.unsplash.com/photo-valid-1',
      'https://lh3.googleusercontent.com/abc123=w1920',
    ]);
  });

  it('deduplicates concurrent fetches for the same URL and prunes oldest entries past 50', async () => {
    let fetchCount = 0;
    const { store, restore } = installMockCacheAndFetch(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response('ok', { status: 200 });
    });
    restoreFn = restore;

    const samePhoto: PhotoItem = {
      id: 'dup',
      url: 'https://images.unsplash.com/photo-concurrent',
      source: 'curated',
    };

    await Promise.all([cachePhotosLocally([samePhoto]), cachePhotosLocally([samePhoto])]);
    assert.equal(fetchCount, 1);

    // Populate 55 unique photos across two batches (30 + 25) and verify cache caps at 50
    const batchA: PhotoItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `a-${i}`,
      url: `https://images.unsplash.com/photo-batch-a-${i}`,
      source: 'curated',
    }));
    const batchB: PhotoItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: `b-${i}`,
      url: `https://images.unsplash.com/photo-batch-b-${i}`,
      source: 'curated',
    }));

    await cachePhotosLocally(batchA);
    await cachePhotosLocally(batchB);

    assert.equal(store.entries.size, 50);
    // Oldest entries (concurrent + first 5 of batchA) should have been pruned
    assert.equal(store.entries.has('https://images.unsplash.com/photo-concurrent'), false);
    assert.equal(store.entries.has('https://images.unsplash.com/photo-batch-b-24'), true);
  });
});
