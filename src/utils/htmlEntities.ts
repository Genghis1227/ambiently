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

const BLOCK_LEVEL_HTML_TAGS = new Set([
  'br', 'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'tr', 'td', 'th', 'section', 'article', 'header',
  'footer', 'aside', 'figure', 'figcaption', 'hr',
]);

function stripCaseInsensitiveTagBlocks(input: string, tagName: string): string {
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}`;
  const lower = input.toLowerCase();
  let out = '';
  let pos = 0;

  while (pos < input.length) {
    const start = lower.indexOf(openToken, pos);
    if (start === -1) {
      out += input.slice(pos);
      break;
    }
    const boundary = lower[start + openToken.length];
    if (boundary && !/[\s/>]/.test(boundary)) {
      out += input.slice(pos, start + openToken.length);
      pos = start + openToken.length;
      continue;
    }
    out += input.slice(pos, start);
    const openEnd = input.indexOf('>', start + openToken.length);
    if (openEnd === -1) break;
    const closeStart = lower.indexOf(closeToken, openEnd + 1);
    if (closeStart === -1) break;
    const closeEnd = input.indexOf('>', closeStart + closeToken.length);
    if (closeEnd === -1) break;
    out += ' ';
    pos = closeEnd + 1;
  }
  return out;
}

function stripHtmlCommentsLinear(input: string): string {
  let out = '';
  let pos = 0;
  while (pos < input.length) {
    const start = input.indexOf('<!--', pos);
    if (start === -1) {
      out += input.slice(pos);
      break;
    }
    out += input.slice(pos, start);
    const end = input.indexOf('-->', start + 4);
    if (end === -1) break;
    out += ' ';
    pos = end + 3;
  }
  return out;
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameChar(code: number): boolean {
  return (
    isAsciiLetter(code) ||
    (code >= 48 && code <= 57) ||
    code === 58 || // :
    code === 45 // -
  );
}

function stripHtmlTagsLinear(input: string): string {
  let out = '';
  let pos = 0;
  const len = input.length;

  while (pos < len) {
    const lt = input.indexOf('<', pos);
    if (lt === -1) {
      out += input.slice(pos);
      break;
    }
    out += input.slice(pos, lt);
    if (lt + 1 >= len) {
      out += '<';
      break;
    }

    const nextCode = input.charCodeAt(lt + 1);
    if (nextCode === 33 /* ! */) {
      const gt = input.indexOf('>', lt + 2);
      const nextLt = input.indexOf('<', lt + 2);
      if (gt !== -1 && (nextLt === -1 || gt < nextLt)) {
        pos = gt + 1;
        continue;
      }
      out += '<';
      pos = lt + 1;
      continue;
    }

    if (nextCode === 63 /* ? */) {
      const closePi = input.indexOf('?>', lt + 2);
      const nextLt = input.indexOf('<', lt + 2);
      if (closePi !== -1 && (nextLt === -1 || closePi < nextLt)) {
        pos = closePi + 2;
        continue;
      }
      out += '<';
      pos = lt + 1;
      continue;
    }

    let nameStart = lt + 1;
    let isClosing = false;
    if (nextCode === 47 /* / */) {
      isClosing = true;
      nameStart += 1;
    }
    if (nameStart >= len || !isAsciiLetter(input.charCodeAt(nameStart))) {
      out += '<';
      pos = lt + 1;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (nameEnd < len && isTagNameChar(input.charCodeAt(nameEnd))) {
      nameEnd += 1;
    }
    const tagName = input.slice(nameStart, nameEnd).toLowerCase();

    if (nameEnd >= len) {
      // Truncate unclosed trailing closing/open tag without attributes at EOF
      break;
    }

    const sep = input[nameEnd];
    if (sep !== '>' && sep !== '/' && !/\s/.test(sep)) {
      out += '<';
      pos = lt + 1;
      continue;
    }

    let scan = nameEnd;
    let foundClose = -1;
    let hitNestedLt = false;
    while (scan < len) {
      const ch = input[scan];
      if (ch === '>') {
        foundClose = scan;
        break;
      }
      if (ch === '<') {
        hitNestedLt = true;
        break;
      }
      scan += 1;
    }

    if (hitNestedLt) {
      out += '<';
      pos = lt + 1;
      continue;
    }

    if (foundClose === -1) {
      // Unclosed tag running to EOF (drops trailing open HTML fragment linearly)
      if (!isClosing && /\s/.test(sep)) break;
      out += '<';
      pos = lt + 1;
      continue;
    }

    if (BLOCK_LEVEL_HTML_TAGS.has(tagName)) {
      out += ' ';
    }
    pos = foundClose + 1;
  }

  return out;
}

/**
 * Strips HTML markup to normalized plain text in guaranteed linear time while preserving spacing
 * between blocks and decoding HTML entities after tag removal so escaped tags like `&lt;p&gt;` survive.
 */
export function stripHtmlToText(html: string): string {
  if (!html) return '';
  const withoutScripts = stripCaseInsensitiveTagBlocks(html, 'script');
  const withoutStyles = stripCaseInsensitiveTagBlocks(withoutScripts, 'style');
  const withoutComments = stripHtmlCommentsLinear(withoutStyles);
  const withoutTags = stripHtmlTagsLinear(withoutComments);

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
