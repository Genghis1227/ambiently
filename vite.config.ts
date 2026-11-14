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
          const match = (req.url || '').match(/^(?:\/functions)?\/api\/(ical|rss|gphotos|gdrive|reader|web-proxy|metadata)(?:\?|$)/);
          if (!match || req.method !== 'GET') return next();
          try {
            const mod = await server.ssrLoadModule(`/functions/api/${match[1]}.ts`);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (typeof value === 'string') headers.set(key, value);
            }
            const request = new Request(new URL(req.url!, `http://${req.headers.host || 'localhost'}`), { headers });
            const response: Response = await mod.onRequestGet({ request });
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
        // The app's own scripts and styles are built into assets/, so they must be cached for the app to
        // open offline. Only the donation pictures from public/assets are left out.
        globIgnores: ['**/og-banner.png', 'assets/{paypal,venmo,zelle}.*', 'assets/vendor-heif-*.js', 'config.js'],
        // Never intercept /api/*, /functions/*, or runtime /config.js requests
        // with the SPA index.html navigation fallback.
        navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/config\.js$/],
        runtimeCaching: [
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
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('ical.js')) return 'vendor-ical';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('dexie')) return 'vendor-db';
            if (id.includes('libheif-js')) return 'vendor-heif';
          }
        },
      },
    },
  },
});
