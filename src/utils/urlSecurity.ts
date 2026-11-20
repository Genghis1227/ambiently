const SAFE_RASTER_DATA_URL_RE =
  /^data:image\/(?:jpeg|jpg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i;

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Accepts strictly `http://` or `https://` URLs with no ASCII control characters,
 * returning the normalized URL string or `null` for unsafe/malformed schemes.
 */
export function sanitizeExternalHttpUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || hasControlCharacters(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validates and escapes an image URL for safe interpolation inside CSS `url("...")`.
 * Allows only `https:`, `http:`, `blob:`, and bounded raster base64 `data:image/*` URLs.
 */
export function safeCssBackgroundUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || hasControlCharacters(trimmed)) return null;

  let safeCandidate: string;
  if (/^data:/i.test(trimmed)) {
    if (!SAFE_RASTER_DATA_URL_RE.test(trimmed)) {
      return null;
    }
    safeCandidate = trimmed;
  } else {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.protocol !== 'https:' &&
        parsed.protocol !== 'http:' &&
        parsed.protocol !== 'blob:'
      ) {
        return null;
      }
      safeCandidate = parsed.toString();
    } catch {
      return null;
    }
  }

  const escaped = safeCandidate.replace(/["'()\\]/g, (ch) => `\\${ch}`);
  return `url("${escaped}")`;
}
