/**
 * Shared XML/HTML entity decoding, HTML tag stripping, and snippet truncation helpers.
 */

const XML_NAMED_ENTITIES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

const HTML_NAMED_ENTITIES = new Map<string, string>([
  ['quot', '"'],
  ['apos', "'"],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['nbsp', ' '],
  ['ensp', ' '],
  ['emsp', ' '],
  ['thinsp', ' '],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['sbquo', '‚'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['bdquo', '„'],
  ['laquo', '«'],
  ['raquo', '»'],
  ['lsaquo', '‹'],
  ['rsaquo', '›'],
  ['prime', '′'],
  ['Prime', '″'],
  ['hellip', '…'],
  ['mdash', '—'],
  ['ndash', '–'],
  ['minus', '−'],
  ['bull', '•'],
  ['middot', '·'],
  ['shy', ''],
  ['copy', '©'],
  ['reg', '®'],
  ['trade', '™'],
  ['deg', '°'],
  ['times', '×'],
  ['divide', '÷'],
  ['plusmn', '±'],
  ['sect', '§'],
  ['para', '¶'],
  ['euro', '€'],
  ['pound', '£'],
  ['yen', '¥'],
  ['cent', '¢'],
  ['frac12', '½'],
  ['frac14', '¼'],
  ['frac34', '¾'],
]);

/** Returns true when `code` is a valid Unicode scalar value safe for `String.fromCodePoint`. */
export function isValidCodePoint(code: number): boolean {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
}

function decodeNumericReference(dec: string | undefined, hex: string | undefined, fullMatch: string): string {
  const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? '', 16);
  return isValidCodePoint(code) ? String.fromCodePoint(code) : fullMatch;
}

/**
 * Decodes only XML 1.0 built-in entities (`amp`, `lt`, `gt`, `quot`, `apos`) and valid
 * numeric character references in a single pass.
 *
 * Used to normalize raw XML text nodes when `fast-xml-parser` runs with `processEntities: false`
 * so double-escaped HTML entities (e.g. `&amp;rsquo;`, `&amp;lt;p&amp;gt;`) collapse only once
 * and custom DTD entities remain unexpanded.
 */
export function decodeXmlEntities(str: string): string {
  if (!str) return '';
  return str.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (match, dec, hex, name) => {
    if (name !== undefined) {
      return XML_NAMED_ENTITIES.get(name) ?? match;
    }
    return decodeNumericReference(dec, hex, match);
  });
}

/**
 * Decodes common HTML named entities and valid decimal/hex numeric references in a single pass.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]+));/g, (match, dec, hex, name) => {
    if (name !== undefined) {
      const exact = HTML_NAMED_ENTITIES.get(name);
      if (exact !== undefined) return exact;
      const lower = HTML_NAMED_ENTITIES.get(name.toLowerCase());
      return lower !== undefined ? lower : match;
    }
    return decodeNumericReference(dec, hex, match);
  });
}

/**
 * Strips HTML markup to normalized plain text while preserving spacing between blocks and
 * decoding HTML entities after tag removal so escaped tags like `&lt;p&gt;` in prose survive.
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  const withoutDangerous = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const withoutTags = withoutDangerous
    .replace(
      /<br\s*\/?>|<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|section|article|header|footer|aside|figure|figcaption|hr)\b[^>]*>/gi,
      ' '
    )
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*?)?\/?>/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<\?[^>]*\?>/g, '')
    .replace(/<(?:\/[a-zA-Z][a-zA-Z0-9:-]*|[a-zA-Z][a-zA-Z0-9:-]*\s+[^<>]*)$/g, '');

  return decodeHtmlEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/**
 * Truncates plain text at a word boundary when possible and appends an ellipsis (`…`).
 */
export function truncateAtWordBoundary(text: string, maxLength = 280): string {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return '…';

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.6)) {
    const trimmed = sliced.slice(0, lastSpace).replace(/[,;:\-\s]+$/, '');
    if (trimmed.length > 0) {
      return `${trimmed}…`;
    }
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
