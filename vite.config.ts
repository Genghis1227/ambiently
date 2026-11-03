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
      name: 'cloudflare-dev-functions',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/functions/api/gphotos')) {
            const parsed = new URL(req.url, 'http://localhost');
            const shareUrl = parsed.searchParams.get('url');
            if (!shareUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
              return;
            }

            try {
              const fetchRes = await fetch(shareUrl, {
                redirect: 'follow',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
              });

              if (!fetchRes.ok) {
                res.statusCode = fetchRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Failed to fetch: ${fetchRes.statusText}` }));
                return;
              }

              const html = await fetchRes.text();
              const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
              let title = titleMatch ? titleMatch[1].replace(/·.*$/, '').trim() : 'Google Photos Album';
              if (!title || title.toLowerCase() === 'google photos') {
                title = 'Google Photos Album';
              }

              const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_-]+/g;
              const matches = Array.from(new Set(html.match(regex) || []));
              const photos = matches.map((baseUrl, idx) => ({
                id: `gphotos-${idx}-${baseUrl.slice(-12)}`,
                url: `${baseUrl}=w1920-h1080`,
                caption: `${title} (${idx + 1})`,
                source: 'gdrive',
              }));

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ title, count: photos.length, photos }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          next();
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'logo.png',
        'og-banner.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-192.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'Ambiently Smart Display',
        short_name: 'Ambiently',
        description: 'Ambient smart-display & dashboard command center (dashboard.trinhism.com)',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,jpg,jpeg}'],
      },
    }),
  ],
});
