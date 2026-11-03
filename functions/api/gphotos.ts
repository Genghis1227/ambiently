// Cloudflare Pages Function: /functions/api/gphotos.ts
// Resolves and parses Google Photos shared album links into direct high-resolution photo URLs
// Supports deep pagination via Google Photos batchexecute RPC to accommodate large albums (e.g. 7,000+ photos)

interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const shareUrl = url.searchParams.get('url');
  // Optional maxPhotos parameter (defaults to 10000 to cover large albums)
  const maxPhotosParam = parseInt(url.searchParams.get('maxPhotos') || '10000', 10);
  const maxPhotos = isNaN(maxPhotosParam) || maxPhotosParam <= 0 ? 10000 : maxPhotosParam;

  if (!shareUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
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
      return new Response(
        JSON.stringify({ error: `Failed to fetch Google Photos page: ${fetchRes.statusText}` }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const html = await fetchRes.text();

    // 1. Extract Album Title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    let title = titleMatch ? titleMatch[1].replace(/·.*$/, '').trim() : 'Google Photos Album';
    if (!title || title.toLowerCase() === 'google photos') {
      title = 'Google Photos Album';
    }

    // 2. Extract initial photos from HTML
    const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_-]+/g;
    const initialMatches = html.match(regex) || [];
    const collectedUrls = new Set<string>(initialMatches);

    // 3. Extract pagination token, albumId, authKey, and total album count from AF_initDataCallback 'ds:1'
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

    // 4. Paginate using Google Photos batchexecute RPC if more photos exist and user requested them
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
        break; // Stop pagination gracefully on error
      }
    }

    const uniqueBases = Array.from(collectedUrls);
    const photos = uniqueBases.map((baseUrl, idx) => ({
      id: `gphotos-${idx}-${baseUrl.slice(-12)}`,
      url: `${baseUrl}=w1920-h1080`,
      caption: `${title} (${idx + 1})`,
      source: 'gdrive' as const,
    }));

    return new Response(
      JSON.stringify({
        title,
        count: photos.length,
        totalAlbumCount: Math.max(totalAlbumCount, photos.length),
        photos,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // 1-hour edge cache
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Google Photos parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
