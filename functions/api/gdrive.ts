// Cloudflare Pages Function: /functions/api/gdrive.ts
// Resolves and parses Google Drive public shared folders into direct high-resolution photo URLs

interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const rawUrl = url.searchParams.get('url') || url.searchParams.get('folderId');

  if (!rawUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" or "folderId" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Extract folder ID
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
      return new Response(
        JSON.stringify({
          error:
            'Google Drive folder requires sign-in. In Google Drive, please right-click the folder, select Share, and change General Access to "Anyone with the link" (Viewer).',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch Google Drive folder: ${fetchRes.statusText}` }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const html = await fetchRes.text();

    // Extract folder title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    let title = titleMatch ? titleMatch[1].trim() : 'Google Drive Folder';
    if (!title || title.toLowerCase() === 'google drive') {
      title = 'Google Drive Folder';
    }

    // Match file entries in embeddedfolderview DOM
    const entryRegex = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?class="flip-entry-title">([^<]+)<\/div>/g;
    const photos = [];
    const seenFileIds = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = entryRegex.exec(html)) !== null) {
      const fileId = m[1];
      const filename = m[2].trim();

      if (seenFileIds.has(fileId)) continue;
      seenFileIds.add(fileId);

      // Filter out video files, zip archives, and documents for photo frames
      const isNonImage = /\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|pdf|zip|tar|gz|rar|docx?|xlsx?|pptx?|txt)$/i.test(filename);
      if (!isNonImage) {
        photos.push({
          id: `gdrive-${fileId}`,
          url: `https://lh3.googleusercontent.com/d/${fileId}=w1920-h1080`,
          caption: filename.replace(/\.[^/.]+$/, ''),
          source: 'gdrive' as const,
        });
      }
    }

    return new Response(
      JSON.stringify({
        title,
        count: photos.length,
        totalAlbumCount: photos.length,
        photos,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Google Drive parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
