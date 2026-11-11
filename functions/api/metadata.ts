import {
  externalFetchErrorResponse,
  fetchExternal,
  refuseOtherSites,
} from '../_shared/fetchExternal';

const MAX_METADATA_BYTES = 2 * 1024 * 1024; // 2 MB HTML cap (supports rich recipe pages with large JSON-LD blocks)

export interface ExtractedRecipeMetadata {
  title: string;
  image?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients: string[];
  instructions: string[];
}

export interface ExtractedUrlMetadata {
  title: string;
  imageUrl?: string;
  rawPrice?: number;
  sourceUrl: string;
  siteName: string;
  recipe?: ExtractedRecipeMetadata;
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;|&apos;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&deg;/gi, '°')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&frac12;/gi, '1/2')
    .replace(/&frac14;/gi, '1/4')
    .replace(/&frac34;/gi, '3/4')
    .replace(/&frac13;/gi, '1/3')
    .replace(/&frac23;/gi, '2/3')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .trim();
}

function stripHtmlAndDecode(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function resolveHttpUrl(rawUrl: string | undefined, baseUrl: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = decodeHtmlEntities(rawUrl.trim());
  if (!trimmed) return undefined;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol === 'https:' || resolved.protocol === 'http:') {
      return resolved.toString();
    }
  } catch {
    // Ignore malformed URL
  }
  return undefined;
}

function extractImageFromSchemaValue(imageVal: unknown, baseUrl: string): string | undefined {
  if (!imageVal) return undefined;
  if (typeof imageVal === 'string') {
    return resolveHttpUrl(imageVal, baseUrl);
  }
  if (Array.isArray(imageVal)) {
    for (const item of imageVal) {
      const found = extractImageFromSchemaValue(item, baseUrl);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof imageVal === 'object') {
    const obj = imageVal as Record<string, unknown>;
    if (typeof obj.url === 'string') {
      return resolveHttpUrl(obj.url, baseUrl);
    }
    if (typeof obj.contentUrl === 'string') {
      return resolveHttpUrl(obj.contentUrl, baseUrl);
    }
  }
  return undefined;
}

/**
 * Formats ISO-8601 durations (e.g. "PT15M", "PT1H30M", "P0DT0H45M") into readable labels,
 * passing already human-readable strings through cleanly.
 */
export function formatIsoDuration(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;

  const isoMatch = str.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
  );
  if (!isoMatch) {
    return stripHtmlAndDecode(str) || undefined;
  }

  const days = isoMatch[1] ? parseFloat(isoMatch[1]) : 0;
  const hours = isoMatch[2] ? parseFloat(isoMatch[2]) : 0;
  const minutes = isoMatch[3] ? Math.round(parseFloat(isoMatch[3])) : 0;
  const seconds = isoMatch[4] ? Math.round(parseFloat(isoMatch[4])) : 0;

  const totalHours = days * 24 + hours;
  const parts: string[] = [];

  if (totalHours > 0) {
    const wholeHrs = Math.floor(totalHours);
    const remMinsFromHrs = Math.round((totalHours - wholeHrs) * 60);
    const combinedMins = minutes + remMinsFromHrs;
    if (wholeHrs > 0) {
      parts.push(`${wholeHrs} ${wholeHrs === 1 ? 'hr' : 'hrs'}`);
    }
    if (combinedMins > 0) {
      parts.push(`${combinedMins} ${combinedMins === 1 ? 'min' : 'mins'}`);
    }
  } else if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'min' : 'mins'}`);
  } else if (seconds > 0) {
    parts.push(`${seconds} sec`);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

function extractServings(recipeYield: unknown): string | undefined {
  if (recipeYield === null || recipeYield === undefined) return undefined;
  if (typeof recipeYield === 'number') {
    return Number.isFinite(recipeYield) && recipeYield > 0 ? String(recipeYield) : undefined;
  }
  if (typeof recipeYield === 'string') {
    const cleaned = stripHtmlAndDecode(recipeYield);
    return cleaned || undefined;
  }
  if (Array.isArray(recipeYield)) {
    const strings = recipeYield
      .map((item) => (item !== null && item !== undefined ? stripHtmlAndDecode(String(item)) : ''))
      .filter(Boolean);
    if (strings.length === 0) return undefined;
    // Prefer a descriptive string like "4 servings" over bare "4" when both exist (e.g. Yoast/WPRM)
    const descriptive = strings.find((s) => /[a-z]/i.test(s));
    return descriptive || strings[0];
  }
  return undefined;
}

function flattenRecipeInstructions(rawInstructions: unknown): string[] {
  const steps: string[] = [];

  const pushCleanText = (raw: string) => {
    const decoded = stripHtmlAndDecode(raw);
    if (!decoded) return;
    const lines = decoded
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:step\s*\d+\s*[:.-]?|\d+\s*[.)])\s*/i, '').trim())
      .filter(Boolean);
    for (const line of lines) {
      steps.push(line);
    }
  };

  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      pushCleanText(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      // HowToSection or ItemList with nested itemListElement / steps
      if (Array.isArray(obj.itemListElement)) {
        visit(obj.itemListElement);
        return;
      }
      if (Array.isArray(obj.steps)) {
        visit(obj.steps);
        return;
      }
      // HowToStep
      if (typeof obj.text === 'string' && obj.text.trim()) {
        pushCleanText(obj.text);
        return;
      }
      if (typeof obj.description === 'string' && obj.description.trim()) {
        pushCleanText(obj.description);
        return;
      }
      if (typeof obj.name === 'string' && obj.name.trim()) {
        pushCleanText(obj.name);
      }
    }
  };

  visit(rawInstructions);
  return steps;
}

function hasSchemaType(nodeType: unknown, targetType: string): boolean {
  const targetLower = targetType.toLowerCase();
  const matchesSingle = (val: unknown): boolean => {
    if (typeof val !== 'string') return false;
    const cleaned = val
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/schema\.org\//, '');
    return cleaned === targetLower;
  };

  if (Array.isArray(nodeType)) {
    return nodeType.some(matchesSingle);
  }
  return matchesSingle(nodeType);
}

function extractMetaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern1 = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    );
    const m1 = html.match(pattern1);
    if (m1?.[1]?.trim()) {
      return decodeHtmlEntities(m1[1]);
    }

    const pattern2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`,
      'i'
    );
    const m2 = html.match(pattern2);
    if (m2?.[1]?.trim()) {
      return decodeHtmlEntities(m2[1]);
    }
  }
  return undefined;
}

function parsePriceAmount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num <= 0 || num > 100000) return undefined;
  return Number(num.toFixed(2));
}

function extractJsonLdEntities(
  html: string,
  baseUrl: string
): {
  product: { title?: string; imageUrl?: string; price?: number };
  recipe?: ExtractedRecipeMetadata;
} {
  const product: { title?: string; imageUrl?: string; price?: number } = {};
  let recipe: ExtractedRecipeMetadata | undefined;

  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const inspectNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) inspectNode(child);
      return;
    }

    const obj = node as Record<string, unknown>;

    if (Array.isArray(obj['@graph'])) {
      for (const graphNode of obj['@graph']) inspectNode(graphNode);
    }
    if (obj.mainEntity && typeof obj.mainEntity === 'object') {
      inspectNode(obj.mainEntity);
    }

    const nodeType = obj['@type'];

    // 1. Schema.org Recipe detection
    if (!recipe && hasSchemaType(nodeType, 'Recipe')) {
      const rawName = typeof obj.name === 'string' ? stripHtmlAndDecode(obj.name) : '';
      const rawIngredients = Array.isArray(obj.recipeIngredient)
        ? obj.recipeIngredient
        : Array.isArray(obj.ingredients)
          ? obj.ingredients
          : [];
      const ingredients = rawIngredients
        .map((item) => (typeof item === 'string' ? stripHtmlAndDecode(item) : ''))
        .filter(Boolean);

      const instructions = flattenRecipeInstructions(obj.recipeInstructions);
      const image = extractImageFromSchemaValue(obj.image, baseUrl);
      const servings = extractServings(obj.recipeYield);
      const prepTime = formatIsoDuration(obj.prepTime);
      const cookTime =
        formatIsoDuration(obj.cookTime) ??
        (!prepTime ? formatIsoDuration(obj.totalTime) : undefined);

      recipe = {
        title: rawName,
        ...(image ? { image } : {}),
        ...(servings ? { servings } : {}),
        ...(prepTime ? { prepTime } : {}),
        ...(cookTime ? { cookTime } : {}),
        ingredients,
        instructions,
      };
    }

    // 2. Schema.org Product detection
    if (hasSchemaType(nodeType, 'Product') || /Product/i.test(String(nodeType || ''))) {
      if (!product.title && typeof obj.name === 'string') {
        product.title = stripHtmlAndDecode(obj.name);
      }
      if (!product.imageUrl) {
        product.imageUrl = extractImageFromSchemaValue(obj.image, baseUrl);
      }
      if (product.price === undefined && obj.offers) {
        const offersList = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
        for (const offer of offersList) {
          if (!offer || typeof offer !== 'object') continue;
          const offerObj = offer as Record<string, unknown>;
          const rawP = offerObj.price ?? offerObj.lowPrice ?? offerObj.highPrice;
          if (rawP !== undefined && rawP !== null) {
            const parsed = parsePriceAmount(String(rawP));
            if (parsed !== undefined) {
              product.price = parsed;
              break;
            }
          }
        }
      }
    }
  };

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawBlock = match[1]
      .trim()
      .replace(/^<!--/, '')
      .replace(/-->$/, '')
      .trim();
    if (!rawBlock) continue;
    try {
      const parsed = JSON.parse(rawBlock);
      inspectNode(parsed);
    } catch {
      // Some sites concatenate or append trailing semicolons inside ld+json tags
      const trimmedSemi = rawBlock.replace(/;+\s*$/, '');
      try {
        const parsed = JSON.parse(trimmedSemi);
        inspectNode(parsed);
      } catch {
        // Ignore malformed JSON-LD blocks
      }
    }
  }

  return { product, recipe };
}

/**
 * Pure HTML metadata & Schema.org Recipe/Product extractor.
 * Exported for deterministic unit testing as well as Edge invocation.
 */
export function extractMetadataFromHtml(html: string, finalUrl: string): ExtractedUrlMetadata {
  const { product, recipe } = extractJsonLdEntities(html, finalUrl);

  // 1. Extract Title (og:title -> twitter:title -> Recipe title -> Product name -> <title>)
  const ogTitle = extractMetaContent(html, ['og:title', 'twitter:title']);
  const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const fallbackTitle = titleTagMatch?.[1]
    ? decodeHtmlEntities(titleTagMatch[1].replace(/\s+/g, ' '))
    : undefined;
  const title = ogTitle || recipe?.title || product.title || fallbackTitle || '';

  // 2. Extract Image (og:image -> twitter:image -> Recipe image -> Product image)
  const rawMetaImage = extractMetaContent(html, [
    'og:image',
    'og:image:secure_url',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
  ]);
  const imageUrl =
    resolveHttpUrl(rawMetaImage, finalUrl) || recipe?.image || product.imageUrl;

  // Backfill recipe title/image from OpenGraph fallbacks if missing in JSON-LD
  const enrichedRecipe: ExtractedRecipeMetadata | undefined = recipe
    ? {
        ...recipe,
        title: recipe.title || title,
        ...(recipe.image || imageUrl ? { image: recipe.image || imageUrl } : {}),
      }
    : undefined;

  // 3. Extract Price (product:price:amount -> og:price:amount -> price -> JSON-LD offers.price)
  const metaPriceStr = extractMetaContent(html, [
    'product:price:amount',
    'og:price:amount',
    'product:price',
    'price',
    'twitter:data1',
  ]);
  const rawPrice = parsePriceAmount(metaPriceStr) ?? product.price;

  // 4. Site Name
  let defaultHostname = '';
  try {
    defaultHostname = new URL(finalUrl).hostname.replace(/^www\./i, '');
  } catch {
    defaultHostname = '';
  }
  const siteName = extractMetaContent(html, ['og:site_name']) || defaultHostname;

  return {
    title,
    ...(imageUrl ? { imageUrl } : {}),
    ...(rawPrice !== undefined ? { rawPrice } : {}),
    sourceUrl: finalUrl,
    siteName,
    ...(enrichedRecipe ? { recipe: enrichedRecipe } : {}),
  };
}

function buildJsonHeaders(request: Request, cacheControl = 'private, no-store'): HeadersInit {
  const origin = request.headers.get('Origin');
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions(context: { request: Request }): Promise<Response> {
  const crossSite = refuseOtherSites(context.request);
  if (crossSite) return crossSite;
  return new Response(null, {
    status: 204,
    headers: buildJsonHeaders(context.request, 'public, max-age=600'),
  });
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const crossSite = refuseOtherSites(context.request);
  if (crossSite) return crossSite;

  const reqUrl = new URL(context.request.url);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: buildJsonHeaders(context.request),
    });
  }

  try {
    let response = await fetchExternal(targetUrl, {
      maxBytes: MAX_METADATA_BYTES,
      timeoutMs: 9_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (
      !response.ok &&
      (response.status === 403 || response.status === 429 || response.status === 406)
    ) {
      response = await fetchExternal(targetUrl, {
        maxBytes: MAX_METADATA_BYTES,
        timeoutMs: 9_000,
        headers: {
          'User-Agent':
            'Ambiently-Display/1.0 (+https://dashboard.trinhism.com; Family Metadata & Recipe Scraper)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Target site returned ${response.status} ${response.statusText}`,
        }),
        {
          status: 502,
          headers: buildJsonHeaders(context.request),
        }
      );
    }

    const payload = extractMetadataFromHtml(response.text, response.url);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: buildJsonHeaders(context.request, 'public, max-age=600'),
    });
  } catch (err: unknown) {
    const safeResponse = externalFetchErrorResponse(err);
    if (safeResponse) return safeResponse;
    const message = err instanceof Error ? err.message : 'Failed to extract metadata';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: buildJsonHeaders(context.request),
    });
  }
}
