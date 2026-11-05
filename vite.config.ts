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
          if (req.url && (req.url.startsWith('/api/gphotos') || req.url.startsWith('/functions/api/gphotos'))) {
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

          if (req.url && (req.url.startsWith('/api/gdrive') || req.url.startsWith('/functions/api/gdrive'))) {
            const parsed = new URL(req.url, 'http://localhost');
            const rawUrl = parsed.searchParams.get('url') || parsed.searchParams.get('folderId');
            if (!rawUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing "url" or "folderId" query parameter' }));
              return;
            }

            let folderId = rawUrl.trim();
            const folderMatch = folderId.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?)?folders\/([a-zA-Z0-9_-]+)/);
            if (folderMatch && folderMatch[1]) {
              folderId = folderMatch[1];
            } else {
              const idParamMatch = folderId.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (idParamMatch && idParamMatch[1]) {
                folderId = idParamMatch[1];
              }
            }

            try {
              const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`;
              const fetchRes = await fetch(embeddedUrl, {
                redirect: 'follow',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
              });

              if (fetchRes.status === 401 || fetchRes.url.includes('accounts.google.com/ServiceLogin')) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    error:
                      'Google Drive folder requires sign-in. In Google Drive, please right-click the folder, select Share, and change General Access to "Anyone with the link" (Viewer).',
                  })
                );
                return;
              }

              if (!fetchRes.ok) {
                res.statusCode = fetchRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Failed to fetch Google Drive folder: ${fetchRes.statusText}` }));
                return;
              }

              const html = await fetchRes.text();
              const titleMatch = html.match(/<title>([^<]+)<\/title>/);
              let title = titleMatch ? titleMatch[1].trim() : 'Google Drive Folder';
              if (!title || title.toLowerCase() === 'google drive') {
                title = 'Google Drive Folder';
              }

              const entryRegex = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?class="flip-entry-title">([^<]+)<\/div>/g;
              const photos = [];
              const seenFileIds = new Set();
              let m;

              while ((m = entryRegex.exec(html)) !== null) {
                const fileId = m[1];
                const filename = m[2].trim();

                if (seenFileIds.has(fileId)) continue;
                seenFileIds.add(fileId);

                const isNonImage = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|pdf|zip|tar|gz|rar|docx?|xlsx?|pptx?|txt)$/i.test(filename);
                if (!isNonImage) {
                  photos.push({
                    id: `gdrive-${fileId}`,
                    url: `https://lh3.googleusercontent.com/d/${fileId}=w1920-h1080`,
                    caption: filename.replace(/\.[^/.]+$/, ''),
                    source: 'gdrive',
                  });
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(
                JSON.stringify({
                  title,
                  count: photos.length,
                  totalAlbumCount: photos.length,
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

          if (req.url && (req.url.startsWith('/api/ical') || req.url.startsWith('/functions/api/ical'))) {
            const parsed = new URL(req.url, 'http://localhost');
            const icsUrl = parsed.searchParams.get('url');

            if (!icsUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
              return;
            }

            let normalizedUrl = icsUrl.trim();
            if (normalizedUrl.startsWith('webcal://')) {
              normalizedUrl = 'https://' + normalizedUrl.slice(9);
            } else if (normalizedUrl.startsWith('webcals://')) {
              normalizedUrl = 'https://' + normalizedUrl.slice(10);
            }

            try {
              const fetchRes = await fetch(normalizedUrl, {
                headers: {
                  'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
                  Accept: 'text/calendar, text/plain, */*',
                },
              });

              if (!fetchRes.ok) {
                res.statusCode = fetchRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Failed to fetch calendar feed: ${fetchRes.statusText}` }));
                return;
              }

              const icsText = await fetchRes.text();
              const icalMod = await import('ical.js');
              const ICAL = (icalMod as any).default || icalMod;
              const jcalData = ICAL.parse(icsText);
              const comp = new ICAL.Component(jcalData);
              const vevents = comp.getAllSubcomponents('vevent');

              const now = new Date();
              const rangeStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
              const rangeEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
              const parsedEvents: any[] = [];

              for (const v of vevents) {
                try {
                  const event = new ICAL.Event(v);
                  if (!event.startDate) continue;
                  const isAllDay = Boolean(event.startDate.isDate);

                  if (event.isRecurring()) {
                    const iter = event.iterator();
                    let nextTime: any;
                    let count = 0;
                    while ((nextTime = iter.next()) && count < 300) {
                      count++;
                      const occ = event.getOccurrenceDetails(nextTime);
                      const occStart = occ.startDate.toJSDate();
                      if (occStart > rangeEnd) break;
                      if (occStart >= rangeStart) {
                        let startStr: string;
                        let endStr: string | null = null;
                        if (isAllDay) {
                          startStr = `${String(occ.startDate.year).padStart(4, '0')}-${String(occ.startDate.month).padStart(2, '0')}-${String(occ.startDate.day).padStart(2, '0')}T00:00:00`;
                          if (occ.endDate) {
                            endStr = `${String(occ.endDate.year).padStart(4, '0')}-${String(occ.endDate.month).padStart(2, '0')}-${String(occ.endDate.day).padStart(2, '0')}T00:00:00`;
                          }
                        } else {
                          startStr = occStart.toISOString();
                          endStr = occ.endDate ? occ.endDate.toJSDate().toISOString() : null;
                        }
                        parsedEvents.push({
                          uid: `${event.uid || Math.random().toString()}-${occ.startDate.toICALString()}`,
                          summary: event.summary || 'Untitled Event',
                          description: event.description || '',
                          location: event.location || '',
                          start: startStr,
                          end: endStr,
                          isAllDay,
                        });
                      }
                    }
                  } else {
                    const evtDate = event.startDate.toJSDate();
                    if (evtDate >= rangeStart && evtDate <= rangeEnd) {
                      let startStr: string;
                      let endStr: string | null = null;
                      if (isAllDay) {
                        startStr = `${String(event.startDate.year).padStart(4, '0')}-${String(event.startDate.month).padStart(2, '0')}-${String(event.startDate.day).padStart(2, '0')}T00:00:00`;
                        if (event.endDate) {
                          endStr = `${String(event.endDate.year).padStart(4, '0')}-${String(event.endDate.month).padStart(2, '0')}-${String(event.endDate.day).padStart(2, '0')}T00:00:00`;
                        }
                      } else {
                        startStr = evtDate.toISOString();
                        endStr = event.endDate ? event.endDate.toJSDate().toISOString() : null;
                      }
                      parsedEvents.push({
                        uid: event.uid || Math.random().toString(),
                        summary: event.summary || 'Untitled Event',
                        description: event.description || '',
                        location: event.location || '',
                        start: startStr,
                        end: endStr,
                        isAllDay,
                      });
                    }
                  }
                } catch {
                  // Skip single malformed event
                }
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ events: parsedEvents, total: parsedEvents.length }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          if (req.url && (req.url.startsWith('/api/rss') || req.url.startsWith('/functions/api/rss'))) {
            const parsed = new URL(req.url, 'http://localhost');
            const feedUrl = parsed.searchParams.get('url');

            if (!feedUrl) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
              return;
            }

            try {
              const fetchRes = await fetch(feedUrl, {
                headers: {
                  'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
                  Accept: 'application/rss+xml, application/xml, text/xml, */*',
                },
              });

              if (!fetchRes.ok) {
                res.statusCode = fetchRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Failed to fetch RSS feed: ${fetchRes.statusText}` }));
                return;
              }

              const xmlText = await fetchRes.text();
              const { XMLParser } = await import('fast-xml-parser');
              const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
              });
              const parsedXml = parser.parse(xmlText);

              const decodeHtmlEntities = (str: string) => {
                if (!str) return '';
                return str
                  .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
                  .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                  .replace(/&quot;/g, '"')
                  .replace(/&apos;/g, "'")
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&copy;/g, '©')
                  .replace(/&reg;/g, '®')
                  .replace(/&mdash;/g, '—')
                  .replace(/&ndash;/g, '–')
                  .replace(/&hellip;/g, '…')
                  .replace(/&bull;/g, '•')
                  .trim();
              };

              let rawItems: any[] = [];
              let feedTitle = 'RSS Feed';

              if (parsedXml.rss && parsedXml.rss.channel) {
                feedTitle = decodeHtmlEntities(parsedXml.rss.channel.title || feedTitle);
                rawItems = Array.isArray(parsedXml.rss.channel.item)
                  ? parsedXml.rss.channel.item
                  : parsedXml.rss.channel.item
                  ? [parsedXml.rss.channel.item]
                  : [];
              } else if (parsedXml.feed && parsedXml.feed.entry) {
                feedTitle = decodeHtmlEntities(parsedXml.feed.title || feedTitle);
                rawItems = Array.isArray(parsedXml.feed.entry)
                  ? parsedXml.feed.entry
                  : [parsedXml.feed.entry];
              }

              const items = rawItems.slice(0, 25).map((item: any, idx: number) => {
                const title = decodeHtmlEntities(
                  typeof item.title === 'string' ? item.title : item.title?.['#text'] || 'Untitled'
                );
                const link = typeof item.link === 'string' ? item.link : item.link?.['@_href'] || '';
                const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
                const rawDesc =
                  typeof item.description === 'string'
                    ? item.description.replace(/<[^>]*>?/gm, '').slice(0, 200)
                    : typeof item.summary === 'string'
                    ? item.summary.replace(/<[^>]*>?/gm, '').slice(0, 200)
                    : '';
                const description = decodeHtmlEntities(rawDesc);

                return {
                  id: item.guid?.['#text'] || item.id || `item-${idx}`,
                  title,
                  link,
                  pubDate,
                  description,
                };
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ title: feedTitle, items }));
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
