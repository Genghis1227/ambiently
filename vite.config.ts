import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Runs the real Cloudflare Pages Functions in functions/api during `npm run dev`, so development
      // gets the same address checks and results as the deployed site
      name: 'cloudflare-dev-functions',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const match = (req.url || '').match(
            /^(?:\/functions)?\/api\/(ical|rss|gphotos|gdrive|reader|web-proxy|metadata|finance|sports|discovery|homelab)(?:\?|$)/
          );
          const method = (req.method || 'GET').toUpperCase();
          if (!match) return next();
          if (method !== 'GET' && !(method === 'POST' && match[1] === 'homelab')) {
            return next();
          }
          try {
            const mod = await server.ssrLoadModule(`/functions/api/${match[1]}.ts`);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') headers.set(key, value);
            }
            let bodyBytes: Uint8Array | undefined;
            if (method === 'POST') {
              const chunks: Buffer[] = [];
              let total = 0;
              for await (const chunk of req) {
                const buf = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
                total += buf.byteLength;
                if (total > 64 * 1024) {
                  res.statusCode = 413;
                  res.end(JSON.stringify({ error: 'Payload Too Large' }));
                  return;
                }
                chunks.push(buf);
              }
              bodyBytes = new Uint8Array(Buffer.concat(chunks));
            }
            const request = new Request(
              new URL(req.url!, `http://${req.headers.host || 'localhost'}`),
              {
                method,
                headers,
                ...(bodyBytes ? { body: bodyBytes as unknown as BodyInit } : {}),
              }
            );
            const handler =
              method === 'POST' && typeof mod.onRequestPost === 'function'
                ? mod.onRequestPost
                : mod.onRequestGet;
            const response: Response = await handler({ request });
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (err) {
            next(err);
          }
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'logo.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'icon-maskable-192.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'Ambiently Smart Display',
        short_name: 'Ambiently',
        description:
          'Self-hosted, offline-first smart display and digital family calendar for wall monitors or tablets. Sync iCal calendars, Google Photos, Plex, weather, RSS news, and sticky notes.',
        theme_color: '#090d16',
        background_color: '#090d16',
        display: 'fullscreen',
        orientation: 'any',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The app's own scripts, core widgets, and styles are precached for instant offline boot; heavy
        // setup/settings/HEIF chunks are cached on first open instead of bloating initial kiosk install.
        globIgnores: [
          '**/og-banner.png',
          'assets/{paypal,venmo,zelle}.*',
          'assets/vendor-heif-*.js',
          'assets/ChangelogModal-*.js',
          'assets/{WidgetSettingsModal,SettingsModal,AddWidgetModal,PhotoSourcesModal,MediaSearchModal,CalendarUrlGuideModal}-*.js',
          'assets/Phase*WidgetSettingsPanel*-*.js',
          'config.js',
        ],
        // Never intercept /api/*, /functions/*, or runtime /config.js requests
        // with the SPA index.html navigation fallback.
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/config\.js$/],
        runtimeCaching: [
          {
            // Cache lazy-excluded immutable hashed chunks on first demand rather than eager precache
            urlPattern: ({ url }) =>
              url.origin === (globalThis as unknown as { location: { origin: string } }).location.origin &&
              /^\/assets\/(ChangelogModal|vendor-heif|WidgetSettingsModal|SettingsModal|AddWidgetModal|PhotoSourcesModal|MediaSearchModal|CalendarUrlGuideModal|Phase[0-9]WidgetSettingsPanels?)-[a-zA-Z0-9_-]+\.js$/.test(
                url.pathname
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ambiently-lazy-chunks-v1',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 30 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Bounded CacheFirst store for static external GIF/MP4/WebP/image CDN assets (GIPHY, Wikimedia).
            // Never caches Plex tokens or dynamic API calls.
            urlPattern: ({ request, url }) =>
              url.protocol === 'https:' &&
              (/(^|\.)giphy\.com$/i.test(url.hostname) || url.hostname === 'upload.wikimedia.org') &&
              !url.hostname.toLowerCase().startsWith('api.') &&
              (request.destination === 'image' ||
                request.destination === 'video' ||
                /\.(gif|webp|mp4|webm|png|jpe?g)(\?|$)/i.test(url.pathname)),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ambiently-media-cache-v1',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 14 * 24 * 60 * 60,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Photos from external HTTPS hosts load from the network as usual. Only when that fails
            // (the screen is offline) is the copy saved in ambiently-photo-cache-v1 returned.
            urlPattern: ({ request, url }) =>
              request.destination === 'image' &&
              url.protocol === 'https:' &&
              url.origin !== (globalThis as unknown as { location: { origin: string } }).location.origin,
            handler: async ({ request }) => {
              try {
                return await fetch(request);
              } catch (err) {
                // Written out in full because Workbox serializes this function into sw.js as text
                const storage = (globalThis as unknown as {
                  caches: {
                    open(name: string): Promise<{
                      match(req: Request | string): Promise<Response | undefined>;
                      keys(): Promise<readonly Request[]>;
                    }>;
                  };
                }).caches;
                const cache = await storage.open('ambiently-photo-cache-v1');
                const exact = await cache.match(request.url);
                if (exact) return exact;
                if (request.url.includes('googleusercontent.com')) {
                  const base = request.url.replace(/=(w\d+.*|s\d+.*)$/, '');
                  const keys = await cache.keys();
                  for (const key of keys) {
                    if (key.url.replace(/=(w\d+.*|s\d+.*)$/, '') === base) {
                      const variant = await cache.match(key);
                      if (variant) return variant;
                    }
                  }
                }
                throw err;
              }
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 3500,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/')) {
            if (
              normalizedId.includes('/react-dom/') ||
              normalizedId.includes('/react/') ||
              normalizedId.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalizedId.includes('/ical.js/')) return 'vendor-ical';
            if (normalizedId.includes('/@supabase/')) return 'vendor-supabase';
            if (normalizedId.includes('/lucide-react/')) return 'vendor-icons';
            if (normalizedId.includes('/dexie/')) return 'vendor-db';
            if (normalizedId.includes('/libheif-js/')) return 'vendor-heif';
          }
        },
      },
    },
  },
});
