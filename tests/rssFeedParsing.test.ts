import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as rssHandler } from '../functions/api/rss';
import { resetApiRateLimitsForTests, setGuardedFetch } from '../functions/_shared/fetchExternal';
import { fetchRssFeed, clearFeedMemoryCaches } from '../src/services/feeds';
import {
  decodeHtmlEntities,
  decodeXmlEntities,
  stripHtmlToText,
  truncateAtWordBoundary,
} from '../src/utils/htmlEntities';

function computeRssCacheKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

describe('HTML & XML entity decoding helpers (src/utils/htmlEntities.ts)', () => {
  it('decodes single-pass XML entities without expanding double-escaped HTML entities', () => {
    assert.equal(decodeXmlEntities('&lt;p&gt;that&amp;rsquo;s great&lt;/p&gt;'), '<p>that&rsquo;s great</p>');
    assert.equal(decodeXmlEntities('?a=1&amp;b=2'), '?a=1&b=2');
    assert.equal(decodeXmlEntities('&boom;'), '&boom;');
    assert.equal(decodeXmlEntities('&#99999999; &#xFFFFFF; &#x1F680;'), '&#99999999; &#xFFFFFF; 🚀');
  });

  it('strips HTML tags cleanly, preserves block spacing and escaped code tags, and decodes typographic entities', () => {
    const cleaned = stripHtmlToText(
      '<p>There is a tired, cynical myth that&rsquo;s been making the rounds: &ldquo;Nice guys finish last.&rdquo;</p><p>Check <em>word</em>! 3 &lt; 5 &amp; good</p>'
    );
    assert.equal(
      cleaned,
      'There is a tired, cynical myth that’s been making the rounds: “Nice guys finish last.” Check word! 3 < 5 & good'
    );

    const withCdata = stripHtmlToText(
      '<p>Learn about &lt;p&gt; tags &rsquo;ok&lsquo;</p><script>alert(1)</script><style>body{}</style><p>Next</p>'
    );
    assert.equal(withCdata, 'Learn about <p> tags ’ok‘ Next');
  });

  it('safely handles out-of-range numeric entities and astral Unicode code points including uppercase #X', () => {
    assert.equal(
      decodeHtmlEntities('&#99999999; &#xFFFFFF; &#x1F680; &#X1F680; &Prime; &prime;'),
      '&#99999999; &#xFFFFFF; 🚀 🚀 ″ ′'
    );
    assert.equal(decodeXmlEntities('&#X1F680; &amp;'), '🚀 &');
  });

  it('does not truncate prose after inequality expressions like x<y or </3 emoticons', () => {
    assert.equal(
      stripHtmlToText('<p>When x<y, the algorithm finishes immediately and returns early.</p>'),
      'When x<y, the algorithm finishes immediately and returns early.'
    );
    assert.equal(
      stripHtmlToText('<p>I </3 rainy Mondays when commuting to work.</p>'),
      'I </3 rainy Mondays when commuting to work.'
    );
  });

  it('truncates long descriptions cleanly at word boundaries with ellipsis', () => {
    const sample =
      'There is a tired, cynical myth that’s been making the rounds for years: “Nice guys finish last.” In a world that often mistakes volume for impact and aggression for leadership, choosing kindness without sacrificing boundaries is a genuinely durable advantage over the long run.';
    const truncated = truncateAtWordBoundary(sample, 160);
    assert.ok(truncated.length <= 161);
    assert.ok(truncated.endsWith('…'));
    assert.ok(!truncated.includes('aggressi…'), `expected clean word boundary, got: ${truncated}`);
  });
});

describe('/api/rss XML parsing, HTML stripping & security (functions/api/rss.ts)', () => {
  it('strips Hugo-style XML-escaped HTML tags, decodes &rsquo;/&ldquo;, decodes link &amp;, and truncates at word boundaries', async () => {
    const hugoXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <title>Tony&amp;rsquo;s Tipbits</title>
          <item>
            <title>The &lt;p&gt; tag</title>
            <link>https://example.org/posts/kindness/?utm_source=rss&amp;ref=ambiently</link>
            <guid>https://example.org/posts/kindness/?a=1&amp;b=2</guid>
            <pubDate>Sun, 16 Nov 2026 10:00:00 GMT</pubDate>
            <description>&lt;p&gt;There is a tired, cynical myth that&amp;rsquo;s been making the rounds for years: &amp;ldquo;Nice guys finish last.&amp;rdquo;&lt;/p&gt; &lt;p&gt;In a world that often mistakes volume for impact and aggression for conviction, choosing steady kindness, clear boundaries, and thoughtful collaboration creates stronger outcomes.&lt;/p&gt;</description>
          </item>
        </channel>
      </rss>`;

    setGuardedFetch({
      publicOnly: async () =>
        new Response(hugoXml, {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
        }),
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });

    try {
      const res = await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/hugo.xml')
        ),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Cache-Control'), 'private, max-age=600');

      const data = (await res.json()) as {
        title: string;
        items: { id: string; title: string; link: string; description: string }[];
      };
      assert.equal(data.title, 'Tony’s Tipbits');
      assert.equal(data.items.length, 1);
      assert.equal(data.items[0].title, 'The <p> tag');
      assert.equal(data.items[0].link, 'https://example.org/posts/kindness/?utm_source=rss&ref=ambiently');
      assert.equal(data.items[0].id, 'https://example.org/posts/kindness/?a=1&b=2');
      assert.ok(!data.items[0].description.includes('<p>'), 'should strip wrapper <p> tags');
      assert.ok(!data.items[0].description.includes('</p>'), 'should strip wrapper </p> tags');
      assert.ok(!data.items[0].description.includes('&rsquo;'), 'should decode &rsquo;');
      assert.ok(data.items[0].description.includes('that’s been making the rounds'));
      assert.ok(data.items[0].description.includes('“Nice guys finish last.” In a world'));
      assert.ok(data.items[0].description.length <= 281);
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });

  it('handles CDATA blocks cleanly while stripping HTML wrappers and preserving escaped code prose', async () => {
    const cdataXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <title><![CDATA[Dev & Code]]></title>
          <item>
            <title><![CDATA[Understanding <p> wrappers]]></title>
            <link>https://example.org/cdata-post</link>
            <description><![CDATA[<p>Learn about &lt;p&gt; tags &rsquo;ok&lsquo;</p><script>alert(1)</script><style>body{}</style><p>Next</p>]]></description>
          </item>
        </channel>
      </rss>`;

    setGuardedFetch({
      publicOnly: async () =>
        new Response(cdataXml, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } }),
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });

    try {
      const res = await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/cdata.xml')
        ),
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as {
        title: string;
        items: { title: string; description: string }[];
      };
      assert.equal(data.title, 'Dev & Code');
      assert.equal(data.items[0].title, 'Understanding <p> wrappers');
      assert.equal(data.items[0].description, 'Learn about <p> tags ’ok‘ Next');
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });

  it('handles Atom typed HTML titles, XML-escaped link attributes, DOCTYPE blocking, and refresh=1 Cache-Control', async () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
      <!DOCTYPE lolz [<!ENTITY boom "EXPANDED_SECRET">]>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="html">&lt;strong&gt;Atom&lt;/strong&gt; &amp;amp; News</title>
        <entry>
          <title type="html">&lt;em&gt;Hello&lt;/em&gt; &amp;amp; World &boom;</title>
          <link rel="enclosure" href="https://example.org/audio.mp3" />
          <link rel="alternate" href="https://example.org/atom?x=1&amp;y=2" />
          <id>atom-1</id>
          <updated>2026-11-20T12:00:00Z</updated>
          <summary type="html">&lt;p&gt;Astral &#x1F680; &amp;amp; invalid &#99999999; &#xFFFFFF; check.&lt;/p&gt;</summary>
        </entry>
      </feed>`;

    setGuardedFetch({
      publicOnly: async () =>
        new Response(atomXml, { status: 200, headers: { 'Content-Type': 'application/atom+xml' } }),
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });

    try {
      const res = await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/atom.xml') + '&refresh=1'
        ),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Cache-Control'), 'private, no-store');

      const data = (await res.json()) as {
        title: string;
        items: { title: string; link: string; description: string }[];
      };
      assert.ok(!JSON.stringify(data).includes('EXPANDED_SECRET'));
      assert.equal(data.title, 'Atom & News');
      assert.equal(data.items[0].title, 'Hello & World &boom;');
      assert.equal(data.items[0].link, 'https://example.org/atom?x=1&y=2');
      assert.equal(data.items[0].description, 'Astral 🚀 & invalid &#99999999; &#xFFFFFF; check.');
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });

  it('extracts Atom type="xhtml" bodies, defaults missing rel to alternate, resolves relative links, and parses RSS 1.0 RDF', async () => {
    const xhtmlAtom = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Less: <em>&lt;p&gt;</em></div></title>
        <entry>
          <title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>XHTML</b> World</div></title>
          <link rel="enclosure" href="https://example.org/cover.jpg" />
          <link href="/posts/123?a=1&amp;b=2" />
          <id>xhtml-1</id>
          <summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>First paragraph.</p><p>Second paragraph.</p></div></summary>
        </entry>
      </feed>`;

    const rdfXml = `<?xml version="1.0" encoding="utf-8"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel>
          <title>RDF Journal</title>
        </channel>
        <item>
          <title>RDF Entry</title>
          <link>https://example.org/rdf-item</link>
          <dc:date>2026-11-20T09:00:00Z</dc:date>
          <description>&lt;p&gt;Body inside RDF.&lt;/p&gt;</description>
        </item>
      </rdf:RDF>`;

    setGuardedFetch({
      publicOnly: async (u) => {
        if (u.includes('rdf.xml')) {
          return new Response(rdfXml, { status: 200, headers: { 'Content-Type': 'application/rdf+xml' } });
        }
        return new Response(xhtmlAtom, { status: 200, headers: { 'Content-Type': 'application/atom+xml' } });
      },
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });

    try {
      const atomRes = await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/atom-xhtml.xml')
        ),
      });
      assert.equal(atomRes.status, 200);
      const atomJson = (await atomRes.json()) as {
        title: string;
        items: { title: string; link: string; description: string }[];
      };
      assert.equal(atomJson.title, 'Less: <p>');
      assert.equal(atomJson.items[0].title, 'Hello XHTML World');
      assert.equal(atomJson.items[0].link, 'https://example.org/posts/123?a=1&b=2');
      assert.equal(atomJson.items[0].description, 'First paragraph. Second paragraph.');

      const rdfRes = await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/rdf.xml')
        ),
      });
      assert.equal(rdfRes.status, 200);
      const rdfJson = (await rdfRes.json()) as {
        title: string;
        items: { title: string; link: string; pubDate: string; description: string }[];
      };
      assert.equal(rdfJson.title, 'RDF Journal');
      assert.equal(rdfJson.items[0].title, 'RDF Entry');
      assert.equal(rdfJson.items[0].pubDate, '2026-11-20T09:00:00Z');
      assert.equal(rdfJson.items[0].description, 'Body inside RDF.');
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });

  it('preserves http:// scheme for local/LAN RSS feeds while upgrading public http:// hosts', async () => {
    const requestedUrls: string[] = [];
    const origAllowPrivate = process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
    process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = 'true';
    setGuardedFetch({
      publicOnly: async (u) => {
        requestedUrls.push(u);
        return new Response('<rss><channel><title>Public</title></channel></rss>', {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        });
      },
      privateAllowed: async (u) => {
        requestedUrls.push(u);
        return new Response('<rss><channel><title>LAN Feed</title></channel></rss>', {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        });
      },
    });

    try {
      await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('http://192.168.1.50:8080/feed.xml')
        ),
      });
      await rssHandler({
        request: new Request(
          'https://ambiently.example/api/rss?url=' + encodeURIComponent('http://example.org/public.xml')
        ),
      });
      assert.equal(requestedUrls[0], 'http://192.168.1.50:8080/feed.xml');
      assert.equal(requestedUrls[1], 'https://example.org/public.xml');
    } finally {
      if (origAllowPrivate === undefined) {
        delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
      } else {
        process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = origAllowPrivate;
      }
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });
});

describe('fetchRssFeed client cache versioning & forceRefresh (src/services/feeds.ts)', () => {
  it('ignores legacy localStorage cache entries without v=2, writes v=2, and passes refresh=1 on forceRefresh', async () => {
    const feedUrl = 'https://example.org/cache-test-feed.xml';
    const cacheKey = `ambiently_rss_cache_${computeRssCacheKey(feedUrl)}`;
    const storageMap = new Map<string, string>();
    storageMap.set(
      cacheKey,
      JSON.stringify({
        timestamp: Date.now(),
        title: 'Stale Feed',
        items: [{ id: 'old', title: 'Old', link: '', pubDate: '', description: '<p>stale</p>' }],
      })
    );

    const mockLocalStorage = {
      get length() {
        return storageMap.size;
      },
      key(index: number) {
        return Array.from(storageMap.keys())[index] ?? null;
      },
      getItem(k: string) {
        return storageMap.get(k) ?? null;
      },
      setItem(k: string, v: string) {
        storageMap.set(k, v);
      },
      removeItem(k: string) {
        storageMap.delete(k);
      },
      clear() {
        storageMap.clear();
      },
    };

    const requests: { url: string; init?: RequestInit }[] = [];
    const origFetch = globalThis.fetch;
    const origWindow = (globalThis as { window?: unknown }).window;
    const origLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

    (globalThis as { window?: unknown }).window = { localStorage: mockLocalStorage };
    (globalThis as { localStorage?: unknown }).localStorage = mockLocalStorage;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          title: 'Fresh Feed',
          items: [
            {
              id: 'fresh-1',
              title: 'Fresh Item',
              link: 'https://example.org/fresh',
              pubDate: '2026-11-20T00:00:00Z',
              description: 'Clean snippet without tags',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const firstResult = await fetchRssFeed(feedUrl, false);
      assert.equal(firstResult.title, 'Fresh Feed');
      assert.equal(firstResult.items[0].description, 'Clean snippet without tags');
      assert.equal(requests.length, 1);
      assert.ok(requests[0].url.includes('&v=2'));
      assert.ok(!requests[0].url.includes('&refresh=1'));

      const storedAfterFetch = JSON.parse(storageMap.get(cacheKey) || '{}') as { v?: number };
      assert.equal(storedAfterFetch.v, 2);

      // Cached read within TTL should not refetch when forceRefresh is false
      const cachedResult = await fetchRssFeed(feedUrl, false);
      assert.equal(cachedResult.title, 'Fresh Feed');
      assert.equal(requests.length, 1);

      // Manual refresh must send v=2, refresh=1, and cache: 'no-store'
      await fetchRssFeed(feedUrl, true);
      assert.equal(requests.length, 2);
      assert.ok(requests[1].url.includes('&v=2'));
      assert.ok(requests[1].url.includes('&refresh=1'));
      assert.equal(requests[1].init?.cache, 'no-store');

      // Cold-boot LRU pruning: clearing in-memory caches and fetching another feed must NOT wipe existing v=2 cache for other canvases
      clearFeedMemoryCaches();
      const secondFeedUrl = 'http://192.168.1.50:8080/lan-feed.xml';
      await fetchRssFeed(secondFeedUrl, false);
      assert.equal(requests.length, 3);
      assert.ok(requests[2].url.includes(encodeURIComponent('http://192.168.1.50:8080/lan-feed.xml')));
      assert.ok(storageMap.has(cacheKey), 'existing v=2 cache from another canvas must survive cold-boot write');
    } finally {
      globalThis.fetch = origFetch;
      if (origWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = origWindow;
      }
      if (origLocalStorage === undefined) {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      } else {
        (globalThis as { localStorage?: unknown }).localStorage = origLocalStorage;
      }
    }
  });
});
