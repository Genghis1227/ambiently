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
            const maxPhotosParam = parseInt(parsed.searchParams.get('maxPhotos') || '10000', 10);
            const maxPhotos = isNaN(maxPhotosParam) || maxPhotosParam <= 0 ? 10000 : maxPhotosParam;

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
              const collectedUrls = new Set<string>(html.match(regex) || []);

              let token: string | null = null;
              let albumId: string | null = null;
              let authKey: string | null = null;
              let totalAlbumCount = collectedUrls.size;

              const ds1Match = html.match(/AF_initDataCallback\(\{key: 'ds:1'[\s\S]*?data:\s*([\s\S]*?),\s*sideChannel:/);
              if (ds1Match) {
                try {
                  const ds1Data = JSON.parse(ds1Match[1]);
                  token = ds1Data[2] || null;
                  if (Array.isArray(ds1Data[3])) {
                    albumId = ds1Data[3][0] || null;
                    if (ds1Data[3][1] && title === 'Google Photos Album') {
                      title = String(ds1Data[3][1]);
                    }
                    if (typeof ds1Data[3][21] === 'number') {
                      totalAlbumCount = ds1Data[3][21];
                    }
                    authKey = ds1Data[3][19] || null;
                  }
                } catch {
                  // Fall back to initial page
                }
              }

              const maxPages = Math.ceil(maxPhotos / 300);
              let page = 1;

              while (token && albumId && page < maxPages && collectedUrls.size < maxPhotos) {
                page++;
                try {
                  const reqPayload = [albumId, token, null, authKey];
                  const payload = [[['snAcKc', JSON.stringify(reqPayload), null, 'generic']]];
                  const body = new URLSearchParams();
                  body.set('f.req', JSON.stringify(payload));

                  const rpcRes = await fetch('https://photos.google.com/_/PhotosUi/data/batchexecute', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                      'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                    body: body.toString(),
                  });

                  if (!rpcRes.ok) break;

                  const rpcText = await rpcRes.text();
                  const rpcMatches = rpcText.match(regex) || [];
                  for (const m of rpcMatches) {
                    collectedUrls.add(m);
                  }

                  const cleaned = rpcText.replace(/^\)\]\}'\s*/, '');
                  const rpcJson = JSON.parse(cleaned);
                  const innerData = JSON.parse(rpcJson[0][2]);
                  token = typeof innerData[2] === 'string' ? innerData[2] : null;
                } catch {
                  break;
                }
              }

              const uniqueBases = Array.from(collectedUrls);
              const photos = uniqueBases.map((baseUrl, idx) => ({
                id: `gphotos-${idx}-${baseUrl.slice(-12)}`,
                url: `${baseUrl}=w1920-h1080`,
                caption: `${title} (${idx + 1})`,
                source: 'gdrive',
              }));

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(
                JSON.stringify({
                  title,
                  count: photos.length,
                  totalAlbumCount: Math.max(totalAlbumCount, photos.length),
                  photos,
                })
              );
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
