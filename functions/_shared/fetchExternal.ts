// Shared by the calendar, RSS and photo functions. They fetch an address that a user typed, so:
// - every address is checked before it is fetched, including each redirect, since a public page can
//   redirect to a private one
// - the wait and the size of the answer are capped, so one huge or slow feed can't tie up the function
// - requests from other websites are refused, so other sites can't use these functions for their visitors
// This module exports no request handler, so Pages doesn't make it a route.

export class ExternalFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Names that only mean something inside a home or office network
const PRIVATE_NAME_ENDINGS = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'localdomain', 'home.arpa'];

// IPv4 ranges that aren't on the public internet: "this network", private, carrier-grade NAT, loopback,
// link-local (including cloud metadata), protocol assignments, documentation, benchmarking, multicast
// and reserved
const PRIVATE_IPV4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15],
  [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  const value = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  return PRIVATE_IPV4.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
}

/** Throws unless the address is HTTPS on the public internet (and, if given, one of allowedHosts). */
export function checkPublicHttpsUrl(raw: string, allowedHosts?: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExternalFetchError('Malformed URL.', 400);
  }
  if (url.protocol !== 'https:') {
    throw new ExternalFetchError('Only HTTPS addresses are allowed.', 400);
  }

  // The URL parser has already turned forms like 2130706433 or 0x7f.1 into dotted IPv4
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (allowedHosts && !allowedHosts.includes(host)) {
    throw new ExternalFetchError(`Only ${allowedHosts.join(', ')} addresses are allowed.`, 400);
  }
  if (host.startsWith('[')) {
    throw new ExternalFetchError('IP addresses are not allowed. Use the server name instead.', 400);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIpv4(host)) {
      throw new ExternalFetchError('Private or internal network addresses are not allowed.', 400);
    }
  } else if (!host.includes('.') || PRIVATE_NAME_ENDINGS.some((end) => host === end || host.endsWith(`.${end}`))) {
    throw new ExternalFetchError('Private or internal network addresses are not allowed.', 400);
  }
  return url;
}

/** A 403 response if the request came from another website, otherwise null. */
export function refuseOtherSites(request: Request): Response | null {
  // Browsers send Sec-Fetch-Site. "same-site" covers the owner's other subdomains, and requests
  // without it (older browsers, scripts) are let through.
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return new Response(JSON.stringify({ error: 'Requests from other websites are not allowed.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }
  return null;
}

export interface ExternalFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedHosts?: string[];
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

export interface ExternalFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  url: string; // the address the answer finally came from
  text: string; // empty unless ok
}

async function readCapped(res: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const tooBig = () =>
    new ExternalFetchError(`The answer is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`, 502);
  const declared = Number(res.headers.get('Content-Length'));
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw tooBig();
  }
  if (!res.body) return '';

  const reader = res.body.getReader();
  // Stop reading when time runs out, even if this runtime doesn't end the body on abort
  const stop = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', stop);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error('aborted');
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooBig();
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', stop);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Fetches an address a user chose, following redirects only to addresses that pass the same check. */
export async function fetchExternal(rawUrl: string, options: ExternalFetchOptions): Promise<ExternalFetchResult> {
  const { maxBytes, timeoutMs = 10_000, maxRedirects = 5, allowedHosts } = options;
  let url = checkPublicHttpsUrl(rawUrl, allowedHosts);
  let method = options.method || 'GET';
  let body = options.body;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetch(url.toString(), {
        method,
        body,
        headers: options.headers,
        redirect: 'manual',
        signal: controller.signal,
      });

      const location = res.headers.get('Location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        if (hop >= maxRedirects) {
          throw new ExternalFetchError('Too many redirects.', 502);
        }
        try {
          url = checkPublicHttpsUrl(new URL(location, url).toString(), allowedHosts);
        } catch (err) {
          throw new ExternalFetchError(`Redirected to an address that isn't allowed: ${(err as Error).message}`, 502);
        }
        // Like a browser, follow a redirect with a plain GET
        method = 'GET';
        body = undefined;
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        return { ok: false, status: res.status, statusText: res.statusText, url: url.toString(), text: '' };
      }
      const text = await readCapped(res, maxBytes, controller.signal);
      return { ok: true, status: res.status, statusText: res.statusText, url: url.toString(), text };
    }
  } catch (err) {
    if (err instanceof ExternalFetchError) throw err;
    if (controller.signal.aborted) {
      throw new ExternalFetchError(`No answer within ${Math.round(timeoutMs / 1000)} seconds.`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** The JSON error response for an ExternalFetchError, or null for any other error. */
export function externalFetchErrorResponse(err: unknown): Response | null {
  if (!(err instanceof ExternalFetchError)) return null;
  return new Response(JSON.stringify({ error: err.message }), {
    status: err.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}
