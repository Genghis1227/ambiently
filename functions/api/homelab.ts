// Cloudflare Pages Function & Node Server Handler: /functions/api/homelab.ts
// Performs read-only LAN / WAN uptime checks and Home Assistant entity state lookups.

import {
  ExternalFetchError,
  fetchExternal,
  refuseOtherSites,
} from '../_shared/fetchExternal';
import {
  MAX_HA_ENTITIES,
  MAX_HOMELAB_SERVICES,
  type HomeAssistantEntityReading,
  type HomelabApiCheckRequest,
  type HomelabApiCheckResponse,
  type HomelabServiceStatus,
} from '../../src/types/phase5Widgets';
import {
  classifyServiceProbeResult,
  formatHomeAssistantEntityReading,
  isValidHomeAssistantEntityId,
  normalizeHomelabBaseUrl,
  resolveHomeAssistantEntities,
  resolveHomelabServices,
} from '../../src/utils/homelabEngine';

interface PagesContext {
  request: Request;
}

const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const PROBE_TIMEOUT_MS = 4500;
const PROBE_MAX_BYTES = 64 * 1024;

function isLanPrivateFeedsEnabled(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.env !== 'undefined' &&
    process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS === 'true'
  );
}

function isAlwaysBlockedLoopbackOrMetadata(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || host === '::1') {
      return true;
    }
    if (/^127\./.test(host) || /^0\./.test(host) || /^169\.254\./.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isLanGatedRejection(rawUrl: string, err: unknown, lanAllowed: boolean): boolean {
  if (lanAllowed || !(err instanceof ExternalFetchError) || err.status !== 400) {
    return false;
  }
  if (isAlwaysBlockedLoopbackOrMetadata(rawUrl)) {
    return false;
  }
  return (
    err.message.includes('Private or internal network addresses') ||
    err.message.includes('Only HTTPS addresses')
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const blocked = refuseOtherSites(context.request);
  if (blocked) return blocked;
  return jsonResponse({
    ok: true,
    lanAllowed: isLanPrivateFeedsEnabled(),
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const blocked = refuseOtherSites(context.request);
  if (blocked) return blocked;

  let bodyText: string;
  try {
    bodyText = await context.request.text();
  } catch {
    return jsonResponse({ error: 'Unable to read request body.' }, 400);
  }

  if (bodyText.length > MAX_REQUEST_BODY_BYTES) {
    return jsonResponse({ error: 'Request payload is too large.' }, 413);
  }

  let parsedBody: HomelabApiCheckRequest;
  try {
    parsedBody = (bodyText ? JSON.parse(bodyText) : {}) as HomelabApiCheckRequest;
  } catch {
    return jsonResponse({ error: 'Malformed JSON body.' }, 400);
  }

  const lanAllowed = isLanPrivateFeedsEnabled();
  const services = resolveHomelabServices(parsedBody.services)
    .filter((s) => s.enabled && s.url.trim().length > 0)
    .slice(0, MAX_HOMELAB_SERVICES);

  const haBaseUrl = normalizeHomelabBaseUrl(parsedBody.homeAssistant?.baseUrl);
  const haToken =
    typeof parsedBody.homeAssistant?.accessToken === 'string'
      ? parsedBody.homeAssistant.accessToken.trim()
      : '';
  const haEntities = haBaseUrl
    ? resolveHomeAssistantEntities(parsedBody.homeAssistant?.entities)
        .filter((e) => e.enabled)
        .slice(0, MAX_HA_ENTITIES)
    : [];

  const serviceResults = await Promise.all(
    services.map(async (service): Promise<HomelabServiceStatus> => {
      const startMs = Date.now();
      try {
        const res = await fetchExternal(service.url, {
          maxBytes: PROBE_MAX_BYTES,
          timeoutMs: PROBE_TIMEOUT_MS,
          allowPrivateNetwork: true,
          maxRedirects: 3,
          headers: {
            Accept: 'application/json, text/html;q=0.8, */*;q=0.5',
            'User-Agent': 'AmbientlyHomeLabMonitor/1.0',
          },
        });
        const latencyMs = Math.max(1, Date.now() - startMs);
        const classified = classifyServiceProbeResult({
          ok: res.ok,
          status: res.status,
          latencyMs,
          bodySnippet: res.text.slice(0, 512),
        });
        return {
          id: service.id,
          name: service.name,
          preset: service.preset,
          state: classified.state,
          statusCode: res.status,
          latencyMs,
          detail: classified.detail,
        };
      } catch (err) {
        const blockedByLanGate = isLanGatedRejection(service.url, err, lanAllowed);
        return {
          id: service.id,
          name: service.name,
          preset: service.preset,
          state: 'DOWN',
          statusCode: null,
          latencyMs: null,
          blockedByLanGate,
          detail: blockedByLanGate
            ? 'Requires AMBIENTLY_ALLOW_PRIVATE_FEEDS=true on self-hosted Docker/Pi'
            : (err as Error)?.message || 'Connection failed',
        };
      }
    })
  );

  const entityResults = await Promise.all(
    haEntities.map(async (target): Promise<HomeAssistantEntityReading> => {
      if (!isValidHomeAssistantEntityId(target.entityId)) {
        return {
          id: target.id,
          entityId: target.entityId,
          label: target.label || target.entityId,
          state: 'error',
          formattedValue: 'Invalid ID',
          tone: 'alert',
          iconHint: target.iconHint,
          error: 'Invalid Home Assistant entity_id',
        };
      }

      const entityUrl = `${haBaseUrl}/api/states/${encodeURIComponent(target.entityId)}`;
      try {
        const res = await fetchExternal(entityUrl, {
          maxBytes: PROBE_MAX_BYTES,
          timeoutMs: PROBE_TIMEOUT_MS,
          allowPrivateNetwork: true,
          // Never follow redirects when sending an Authorization bearer token
          maxRedirects: 0,
          headers: {
            Accept: 'application/json',
            ...(haToken ? { Authorization: `Bearer ${haToken}` } : {}),
            'User-Agent': 'AmbientlyHomeAssistantGlance/1.0',
          },
        });

        if (res.status === 401 || res.status === 403) {
          return {
            id: target.id,
            entityId: target.entityId,
            label: target.label || target.entityId,
            state: 'error',
            formattedValue: 'Auth Error',
            tone: 'alert',
            iconHint: target.iconHint,
            error: 'Unauthorized (check HA token)',
          };
        }

        if (res.status === 404) {
          return {
            id: target.id,
            entityId: target.entityId,
            label: target.label || target.entityId,
            state: 'error',
            formattedValue: 'Not Found',
            tone: 'warn',
            iconHint: target.iconHint,
            error: `Entity ${target.entityId} not found`,
          };
        }

        if (!res.ok) {
          return {
            id: target.id,
            entityId: target.entityId,
            label: target.label || target.entityId,
            state: 'error',
            formattedValue: `HTTP ${res.status}`,
            tone: 'alert',
            iconHint: target.iconHint,
            error: `Home Assistant returned HTTP ${res.status}`,
          };
        }

        const parsed = JSON.parse(res.text) as {
          state?: unknown;
          attributes?: Record<string, unknown>;
          last_updated?: unknown;
        };
        return formatHomeAssistantEntityReading(target, parsed);
      } catch (err) {
        const blockedByLanGate = isLanGatedRejection(entityUrl, err, lanAllowed);
        return {
          id: target.id,
          entityId: target.entityId,
          label: target.label || target.entityId,
          state: 'error',
          formattedValue: blockedByLanGate ? 'LAN Locked' : 'Offline',
          tone: 'neutral',
          iconHint: target.iconHint,
          blockedByLanGate,
          error: blockedByLanGate
            ? 'Requires AMBIENTLY_ALLOW_PRIVATE_FEEDS=true on self-hosted Docker/Pi'
            : (err as Error)?.message || 'Home Assistant unreachable',
        };
      }
    })
  );

  const responsePayload: HomelabApiCheckResponse = {
    lanAllowed,
    checkedAt: new Date().toISOString(),
    services: serviceResults,
    entities: entityResults,
  };

  return jsonResponse(responsePayload);
}
