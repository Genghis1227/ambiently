// Cloudflare Pages Function: /functions/api/gphotos.ts
// Resolves and parses Google Photos shared album links into direct high-resolution photo URLs

interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const shareUrl = url.searchParams.get('url');

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

    // Extract Album Title from og:title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    let title = titleMatch ? titleMatch[1].replace(/·.*$/, '').trim() : 'Google Photos Album';
    if (!title || title.toLowerCase() === 'google photos') {
      title = 'Google Photos Album';
    }

    // Extract all unique high-res Google Photos CDN URLs
    // Google Photos stores image links formatted as: https://lh3.googleusercontent.com/pw/...
    const regex = /https:\/\/lh3\.googleusercontent\.com\/pw\/[a-zA-Z0-9_-]+/g;
    const rawMatches = html.match(regex) || [];
    const uniqueBases = Array.from(new Set(rawMatches));

    const photos = uniqueBases.map((baseUrl, idx) => ({
      id: `gphotos-${idx}-${baseUrl.slice(-12)}`,
      url: `${baseUrl}=w1920-h1080`,
      caption: `${title} (${idx + 1})`,
      source: 'gdrive' as const,
    }));

    return new Response(JSON.stringify({ title, count: photos.length, photos }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1-hour edge cache
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Google Photos parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
