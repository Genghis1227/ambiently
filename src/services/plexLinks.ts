// Plex photo links are saved without the Plex token. Saved links sync to the shared board, where
// every household member and device can read them, and a Plex token opens the whole server. Each
// device keeps its own server tokens (see plex.ts) and adds one only when it shows a photo.

// Matches one X-Plex-Token query parameter and the separator before it. The second group is the
// "&" after it, if another parameter follows.
const TOKEN_PARAM = /([?&])x-plex-token=[^&#]*(&?)/gi;

/** Removes every X-Plex-Token parameter from a link and leaves the rest of it as it was. */
export function stripPlexToken(url: string): string {
  let current = url;
  for (;;) {
    const next = current.replace(TOKEN_PARAM, (_match, separator: string, following: string) =>
      following ? separator : ''
    );
    if (next === current) return current;
    current = next;
  }
}

/** Returns a copy of any settings or config value with X-Plex-Token removed from every string in it. */
export function stripPlexTokens<T>(value: T): T {
  if (typeof value === 'string') {
    return (/x-plex-token=/i.test(value) ? stripPlexToken(value) : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripPlexTokens(item)) as T;
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = stripPlexTokens(item);
    }
    return copy as T;
  }
  return value;
}

export function plexOrigin(uri: string): string | null {
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

/**
 * Adds this device's token for the link's Plex server. Links to any other address come back
 * unchanged, so a token is only ever sent to the server it belongs to. A token already in the link
 * (saved by an older version) is replaced, so a link keeps working after the token is changed.
 */
export function addPlexToken(url: string, serverTokens: Record<string, string>): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  const origin = plexOrigin(url);
  const token = origin ? serverTokens[origin] : undefined;
  if (!token) return url;

  const clean = stripPlexToken(url);
  const hashAt = clean.indexOf('#');
  const base = hashAt >= 0 ? clean.slice(0, hashAt) : clean;
  const hash = hashAt >= 0 ? clean.slice(hashAt) : '';
  return `${base}${base.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token)}${hash}`;
}

interface PlexServerTokenSource {
  accessToken?: string;
  connections?: { uri: string }[];
}

/** Maps every connection address of every server to the token for that server. */
export function serverTokensFrom(
  servers: PlexServerTokenSource[],
  accountToken: string
): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const server of servers) {
    const token = server.accessToken || accountToken;
    if (!token) continue;
    for (const connection of server.connections || []) {
      const origin = plexOrigin(connection.uri);
      if (origin) tokens[origin] = token;
    }
  }
  return tokens;
}
