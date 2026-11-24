// Cloudflare Pages Function: /functions/api/rss.ts
// Proxies and parses XML RSS / Atom feeds into normalized JSON articles

import { XMLParser } from 'fast-xml-parser';
import { fetchExternal, externalFetchErrorResponse, refuseOtherSites } from '../_shared/fetchExternal';
import { sanitizeExternalHttpUrl } from '../../src/utils/urlSecurity';
import {
  decodeHtmlEntities,
  decodeXmlEntities,
  stripHtmlToText,
  truncateAtWordBoundary,
} from '../../src/utils/htmlEntities';

interface PagesContext {
  request: Request;
}

function extractCdataPart(cdata: unknown): string {
  if (cdata === null || cdata === undefined) return '';
  if (typeof cdata === 'string') return cdata;
  if (typeof cdata === 'number' || typeof cdata === 'boolean') return String(cdata);
  if (Array.isArray(cdata)) {
    return cdata.map(extractCdataPart).filter(Boolean).join(' ');
  }
  if (typeof cdata === 'object') {
    const record = cdata as Record<string, unknown>;
    if ('#text' in record && record['#text'] !== undefined && record['#text'] !== null) {
      return String(record['#text']);
    }
  }
  return '';
}

const MAX_XML_WALK_DEPTH = 16;

// Normalizes fast-xml-parser nodes (plain text, typed objects like <title type="html"> or <div xmlns="...">,
// CDATA wrappers, numbers, and arrays) while keeping processEntities: false so DOCTYPE entities are never expanded.
function extractXmlText(value: unknown, depth = 0): string {
  if (depth > MAX_XML_WALK_DEPTH || value === null || value === undefined) return '';
  if (typeof value === 'string') return decodeXmlEntities(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => extractXmlText(item, depth + 1))
      .filter((part) => part.trim().length > 0)
      .join(' ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    if ('#text' in record && record['#text'] !== undefined && record['#text'] !== null) {
      const textVal = record['#text'];
      const textPart = Array.isArray(textVal)
        ? textVal.map((t) => extractXmlText(t, depth + 1)).filter((p) => p.trim().length > 0).join(' ')
        : decodeXmlEntities(String(textVal));
      if (textPart.trim().length > 0) parts.push(textPart);
    }
    if ('__cdata' in record && record.__cdata !== undefined && record.__cdata !== null) {
      const cdataPart = extractCdataPart(record.__cdata);
      if (cdataPart.trim().length > 0) parts.push(cdataPart);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('@_') || key === '#text' || key === '__cdata') continue;
      const childText = extractXmlText(child, depth + 1);
      if (childText.trim().length > 0) parts.push(childText);
    }
    return parts.join(' ');
  }
  return '';
}

function getAtomNodeType(node: unknown): string {
  const rawType =
    node && typeof node === 'object' ? (node as Record<string, unknown>)['@_type'] : undefined;
  return typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
}

function hasDirectCdata(node: unknown): boolean {
  return Boolean(node && typeof node === 'object' && '__cdata' in (node as Record<string, unknown>));
}

function extractFeedTitle(node: unknown): string {
  const raw = extractXmlText(node);
  if (!raw) return '';
  const nodeType = getAtomNodeType(node);
  if (nodeType === 'html') {
    return stripHtmlToText(raw);
  }
  return decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
}

function extractFeedBodyText(node: unknown): string {
  const raw = extractXmlText(node);
  if (!raw) return '';
  const nodeType = getAtomNodeType(node);
  if (nodeType === 'xhtml' && !hasDirectCdata(node)) {
    return decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  }
  return stripHtmlToText(raw);
}

function extractSingleLinkRaw(node: unknown): string {
  if (typeof node === 'string') return decodeXmlEntities(node);
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record['@_href'] === 'string') {
      return decodeXmlEntities(record['@_href']);
    }
  }
  return extractXmlText(node);
}

function extractLinkUrl(linkNode: unknown, baseUrl?: string): string {
  let raw = '';
  if (Array.isArray(linkNode)) {
    const alternate = linkNode.find((l) => {
      if (!l || typeof l !== 'object') return false;
      const rel = (l as Record<string, unknown>)['@_rel'];
      return rel === undefined || rel === '' || String(rel).trim().toLowerCase() === 'alternate';
    });
    raw = extractSingleLinkRaw(alternate ?? linkNode[0]);
  } else {
    raw = extractSingleLinkRaw(linkNode);
  }
  let resolved = raw.trim();
  if (resolved && baseUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(resolved)) {
    try {
      resolved = new URL(resolved, baseUrl).href;
    } catch {
      // Keep original so sanitizeExternalHttpUrl rejects invalid URLs
    }
  }
  return sanitizeExternalHttpUrl(resolved) || '';
}

function isLikelyLocalOrPrivateHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || !host.includes('.')) return true;
    if (
      host.endsWith('.local') ||
      host.endsWith('.lan') ||
      host.endsWith('.home') ||
      host.endsWith('.internal') ||
      host.endsWith('.intranet') ||
      host.endsWith('.localdomain') ||
      host.endsWith('.arpa')
    ) {
      return true;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
    if (host.startsWith('[') || host.includes(':')) return true;
    return false;
  } catch {
    return false;
  }
}

const XHTML_BLOCK_TAGS = new Set([
  'p',
  'div',
  'br',
  'li',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'hr',
]);

function collectOrderedNodeText(nodes: unknown, depth = 0): string {
  if (depth > MAX_XML_WALK_DEPTH || !Array.isArray(nodes)) return '';
  let out = '';
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    if (typeof record['#text'] === 'string') {
      out += decodeXmlEntities(record['#text']);
    }
    if (record.__cdata !== undefined && record.__cdata !== null) {
      out += extractCdataPart(record.__cdata);
    }
    for (const [key, val] of Object.entries(record)) {
      if (key === '#text' || key === '__cdata' || key === ':@' || key.startsWith('?')) continue;
      const lowerTag = key.toLowerCase();
      if (lowerTag === 'script' || lowerTag === 'style') continue;
      const inner = collectOrderedNodeText(val, depth + 1);
      if (XHTML_BLOCK_TAGS.has(lowerTag)) {
        out += ` ${inner} `;
      } else {
        out += inner;
      }
    }
  }
  return out;
}

function getOrderedAttrType(node: Record<string, unknown>): string {
  const attrs = node[':@'] as Record<string, unknown> | undefined;
  const raw = attrs?.['@_type'];
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

interface OrderedAtomXhtmlOverrides {
  feedTitle?: string;
  entries: Map<number, { title?: string; body?: string }>;
}

function extractAtomXhtmlOverrides(xmlText: string): OrderedAtomXhtmlOverrides {
  const overrides: OrderedAtomXhtmlOverrides = { entries: new Map() };
  if (!/type\s*=\s*["']xhtml["']/i.test(xmlText)) return overrides;

  const orderedParser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: false,
    trimValues: false,
    cdataPropName: '__cdata',
  });
  const ast = orderedParser.parse(xmlText);
  if (!Array.isArray(ast)) return overrides;

  const feedWrapper = ast.find(
    (n): n is Record<string, unknown> => Boolean(n && typeof n === 'object' && 'feed' in n)
  );
  if (!feedWrapper || !Array.isArray(feedWrapper.feed)) return overrides;

  let entryIdx = 0;
  for (const child of feedWrapper.feed as Record<string, unknown>[]) {
    if (!child || typeof child !== 'object') continue;
    if ('title' in child && getOrderedAttrType(child) === 'xhtml') {
      overrides.feedTitle = decodeHtmlEntities(collectOrderedNodeText(child.title))
        .replace(/\s+/g, ' ')
        .trim();
    }
    if ('entry' in child && Array.isArray(child.entry)) {
      const entryOverride: { title?: string; body?: string } = {};
      for (const field of child.entry as Record<string, unknown>[]) {
        if (!field || typeof field !== 'object') continue;
        if ('title' in field && getOrderedAttrType(field) === 'xhtml' && entryOverride.title === undefined) {
          entryOverride.title = decodeHtmlEntities(collectOrderedNodeText(field.title))
            .replace(/\s+/g, ' ')
            .trim();
        }
        for (const bodyKey of ['summary', 'content'] as const) {
          if (bodyKey in field && getOrderedAttrType(field) === 'xhtml' && entryOverride.body === undefined) {
            const text = decodeHtmlEntities(collectOrderedNodeText(field[bodyKey]))
              .replace(/\s+/g, ' ')
              .trim();
            if (text) entryOverride.body = text;
          }
        }
      }
      if (entryOverride.title !== undefined || entryOverride.body !== undefined) {
        overrides.entries.set(entryIdx, entryOverride);
      }
      entryIdx += 1;
    }
  }
  return overrides;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const url = new URL(context.request.url);
  const feedUrl = url.searchParams.get('url');
  const bypassCache = url.searchParams.get('refresh') === '1';

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }

  let normalizedUrl = feedUrl.trim();
  // Automatically upgrade insecure http:// public hosts to https:// to prevent Cloudflare Worker redirect hangs,
  // while preserving http:// for local/LAN/private feeds.
  if (normalizedUrl.startsWith('http://') && !isLikelyLocalOrPrivateHost(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl.slice(7);
  }

  try {
    // Checks the address and every redirect, waits at most 10 seconds and reads at most 5 MB
    const fetchRes = await fetchExternal(normalizedUrl, {
      // A home-network calendar or feed server is allowed only when the self-hosted server opts in
      allowPrivateNetwork: true,
      maxBytes: 5 * 1024 * 1024,
      headers: {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch RSS feed: ${fetchRes.statusText}` }),
        {
          status: fetchRes.status,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        }
      );
    }

    const xmlText = fetchRes.text;
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      processEntities: false,
      cdataPropName: '__cdata',
    });
    const parsed = parser.parse(xmlText);

    // Support standard RSS 2.0, Atom, and RSS 1.0 (RDF) feeds
    let rawItems: any[] = [];
    let feedTitle = 'RSS Feed';
    const rdfRoot = parsed['rdf:RDF'] || parsed.RDF;
    const xhtmlOverrides = parsed.feed ? extractAtomXhtmlOverrides(xmlText) : undefined;

    if (parsed.rss && parsed.rss.channel) {
      feedTitle = extractFeedTitle(parsed.rss.channel.title) || feedTitle;
      rawItems = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];
    } else if (parsed.feed) {
      feedTitle = xhtmlOverrides?.feedTitle || extractFeedTitle(parsed.feed.title) || feedTitle;
      rawItems = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : parsed.feed.entry
        ? [parsed.feed.entry]
        : [];
    } else if (rdfRoot) {
      feedTitle = extractFeedTitle(rdfRoot.channel?.title) || feedTitle;
      rawItems = Array.isArray(rdfRoot.item)
        ? rdfRoot.item
        : rdfRoot.item
        ? [rdfRoot.item]
        : [];
    }

    const baseLinkUrl = fetchRes.url || normalizedUrl;
    const items = rawItems.slice(0, 25).map((item: any, idx: number) => {
      const entryXhtml = xhtmlOverrides?.entries.get(idx);
      const title = entryXhtml?.title || extractFeedTitle(item.title) || 'Untitled';
      const link = extractLinkUrl(item.link, baseLinkUrl);
      const pubDate =
        extractXmlText(item.pubDate).trim() ||
        extractXmlText(item.published).trim() ||
        extractXmlText(item.updated).trim() ||
        extractXmlText(item['dc:date']).trim() ||
        new Date().toISOString();
      const rawDescNode =
        (extractXmlText(item.description).trim() && item.description) ||
        (extractXmlText(item.summary).trim() && item.summary) ||
        (extractXmlText(item.content).trim() && item.content) ||
        (extractXmlText(item['content:encoded']).trim() && item['content:encoded']) ||
        '';
      const bodyText = entryXhtml?.body ?? extractFeedBodyText(rawDescNode);
      const description = truncateAtWordBoundary(bodyText, 280);
      const id = extractXmlText(item.guid).trim() || extractXmlText(item.id).trim() || `item-${idx}`;

      return {
        id,
        title,
        link,
        pubDate,
        description,
      };
    });

    return new Response(JSON.stringify({ title: feedTitle, items }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': bypassCache ? 'private, no-store' : 'private, max-age=600',
      },
    });
  } catch (err: any) {
    const fetchError = externalFetchErrorResponse(err);
    if (fetchError) return fetchError;
    return new Response(
      JSON.stringify({ error: `RSS parsing error: ${err.message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
