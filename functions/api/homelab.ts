// Cloudflare Pages Function & Node Server Handler: /functions/api/homelab.ts
// Performs read-only LAN / WAN uptime checks, opt-in allowlisted Home Assistant service controls,
// LAN-gated camera snapshots, and Home Assistant media_player state + artwork lookups.

import {
  ExternalFetchError,
  encodeBytesToBase64,
  fetchExternal,
  refuseOtherSites,
} from '../_shared/fetchExternal';
import {
  MAX_HA_ENTITIES,
  MAX_HOMELAB_CAMERAS,
  MAX_HOMELAB_SERVICES,
  type HaMediaPlayerRequest,
  type HaMediaPlayerResponse,
  type HomeAssistantEntityReading,
  type HomeAssistantEntityTarget,
  type HomelabApiCheckRequest,
  type HomelabApiCheckResponse,
  type HomelabApiPostPayload,
  type HomelabCameraSnapshot,
  type HomelabServiceActionRequest,
  type HomelabServiceStatus,
} from '../../src/types/phase5Widgets';
import {
  classifyServiceProbeResult,
  formatHomeAssistantEntityReading,
  isValidHomeAssistantCameraEntityId,
  isValidHomeAssistantEntityId,
  normalizeHomelabBaseUrl,
  resolveAllowedHaServiceCall,
  resolveHomeAssistantEntities,
  resolveHomelabCameras,
  resolveHomelabServices,
} from '../../src/utils/homelabEngine';

interface PagesContext {
  request: Request;
}

const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const PROBE_TIMEOUT_MS = 4500;
const PROBE_MAX_BYTES = 64 * 1024;
const MAX_CAMERA_SNAPSHOT_BYTES = 1536 * 1024; // 1.5 MB cap per camera snapshot
const MAX_MEDIA_ARTWORK_BYTES = 1024 * 1024; // 1 MB cap per media player artwork
const SAFE_RASTER_IMAGE_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif)\b/i;

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

function normalizeSafeRasterDataUrl(contentType: string | undefined, bytes: Uint8Array | undefined): string | null {
  if (!bytes || bytes.byteLength === 0) return null;
  const cleanType = (contentType || '').split(';')[0].trim().toLowerCase();
  if (!SAFE_RASTER_IMAGE_MIME_RE.test(cleanType)) {
    return null;
  }
  return `data:${cleanType};base64,${encodeBytesToBase64(bytes)}`;
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

async function handleHaServiceCall(
  request: Request,
  body: HomelabServiceActionRequest,
  lanAllowed: boolean
): Promise<Response> {
  const rateLimited = refuseOtherSites(request, {
    maxRequestsPerMinute: 30,
    bucket: '/api/homelab:service',
  });
  if (rateLimited) return rateLimited;

  const baseUrl = normalizeHomelabBaseUrl(body.baseUrl);
  if (!/^https?:\/\//i.test(baseUrl)) {
    return jsonResponse({ ok: false, error: 'Valid Home Assistant URL is required.' }, 400);
  }
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (!accessToken) {
    return jsonResponse({ ok: false, error: 'Device-local Home Assistant token is required.' }, 401);
  }

  const entityId = typeof body.entityId === 'string' ? body.entityId.trim().toLowerCase() : '';
  const serviceCall = resolveAllowedHaServiceCall(entityId, body.action);
  if (!serviceCall) {
    return jsonResponse(
      { ok: false, error: 'Service action is not permitted for this entity.' },
      400
    );
  }

  const serviceUrl = `${baseUrl}/api/services/${encodeURIComponent(serviceCall.domain)}/${encodeURIComponent(serviceCall.service)}`;
  const stateUrl = `${baseUrl}/api/states/${encodeURIComponent(entityId)}`;

  const callBody: Record<string, unknown> = { entity_id: entityId };
  if (
    serviceCall.service === 'volume_mute' &&
    body.serviceData &&
    typeof body.serviceData.is_volume_muted === 'boolean'
  ) {
    callBody.is_volume_muted = body.serviceData.is_volume_muted;
  }

  try {
    const actionRes = await fetchExternal(serviceUrl, {
      method: 'POST',
      body: JSON.stringify(callBody),
      maxBytes: PROBE_MAX_BYTES,
      timeoutMs: PROBE_TIMEOUT_MS,
      allowPrivateNetwork: true,
      maxRedirects: 0,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'AmbientlyHomeAssistantControl/1.0',
      },
    });

    if (!actionRes.ok) {
      return jsonResponse(
        { ok: false, error: `Home Assistant returned HTTP ${actionRes.status}` },
        actionRes.status === 401 || actionRes.status === 403 ? 403 : 502
      );
    }

    const stateRes = await fetchExternal(stateUrl, {
      maxBytes: PROBE_MAX_BYTES,
      timeoutMs: PROBE_TIMEOUT_MS,
      allowPrivateNetwork: true,
      maxRedirects: 0,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'AmbientlyHomeAssistantGlance/1.0',
      },
    });

    const targetMeta: HomeAssistantEntityTarget = {
      id: body.targetConfig?.id || entityId,
      entityId,
      label: body.targetConfig?.label,
      unitOverride: body.targetConfig?.unitOverride,
      iconHint: body.targetConfig?.iconHint,
      enabled: true,
      allowControl: true,
      requirePin: body.targetConfig?.requirePin,
    };

    if (!stateRes.ok) {
      return jsonResponse({ ok: true });
    }
    const parsedState = JSON.parse(stateRes.text) as {
      state?: unknown;
      attributes?: Record<string, unknown>;
      last_updated?: unknown;
    };
    return jsonResponse({
      ok: true,
      entity: formatHomeAssistantEntityReading(targetMeta, parsedState),
    });
  } catch (err) {
    const blockedByLanGate = isLanGatedRejection(serviceUrl, err, lanAllowed);
    return jsonResponse(
      {
        ok: false,
        blockedByLanGate,
        error: blockedByLanGate
          ? 'Requires AMBIENTLY_ALLOW_PRIVATE_FEEDS=true on self-hosted Docker/Pi'
          : (err as Error)?.message || 'Home Assistant action failed',
      },
      blockedByLanGate ? 400 : 502
    );
  }
}

async function handleHaMediaPlayer(
  body: HaMediaPlayerRequest,
  lanAllowed: boolean
): Promise<Response> {
  const baseUrl = normalizeHomelabBaseUrl(body.baseUrl);
  if (!/^https?:\/\//i.test(baseUrl)) {
    return jsonResponse({ ok: false, state: 'error', error: 'Valid Home Assistant URL is required.' }, 400);
  }
  const entityId = typeof body.entityId === 'string' ? body.entityId.trim().toLowerCase() : '';
  if (!entityId.startsWith('media_player.') || !isValidHomeAssistantEntityId(entityId)) {
    return jsonResponse({ ok: false, state: 'error', error: 'Valid media_player.* entity ID is required.' }, 400);
  }
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  const stateUrl = `${baseUrl}/api/states/${encodeURIComponent(entityId)}`;

  try {
    const res = await fetchExternal(stateUrl, {
      maxBytes: PROBE_MAX_BYTES,
      timeoutMs: PROBE_TIMEOUT_MS,
      allowPrivateNetwork: true,
      maxRedirects: 0,
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'User-Agent': 'AmbientlyNowPlayingHA/1.0',
      },
    });

    if (res.status === 401 || res.status === 403) {
      return jsonResponse({ ok: false, state: 'error', error: 'Unauthorized (check HA token)' });
    }
    if (res.status === 404) {
      return jsonResponse({ ok: false, state: 'error', error: `Entity ${entityId} not found` });
    }
    if (!res.ok) {
      return jsonResponse({ ok: false, state: 'error', error: `HTTP ${res.status}` });
    }

    const parsed = JSON.parse(res.text) as {
      state?: unknown;
      attributes?: Record<string, unknown>;
    };
    const rawState = String(parsed.state || 'idle').trim().toLowerCase();
    const state: HaMediaPlayerResponse['state'] =
      rawState === 'playing' ||
      rawState === 'paused' ||
      rawState === 'buffering' ||
      rawState === 'idle' ||
      rawState === 'off' ||
      rawState === 'unavailable'
        ? rawState
        : 'idle';

    const attrs = parsed.attributes && typeof parsed.attributes === 'object' ? parsed.attributes : {};
    const title = typeof attrs.media_title === 'string' ? attrs.media_title.trim() : undefined;
    const artist =
      typeof attrs.media_artist === 'string' && attrs.media_artist.trim()
        ? attrs.media_artist.trim()
        : typeof attrs.media_series_title === 'string' && attrs.media_series_title.trim()
          ? attrs.media_series_title.trim()
          : undefined;
    const album =
      typeof attrs.media_album_name === 'string' && attrs.media_album_name.trim()
        ? attrs.media_album_name.trim()
        : undefined;
    const durationNum = Number(attrs.media_duration);
    const positionNum = Number(attrs.media_position);

    let artworkDataUrl: string | undefined;
    const rawPicture = typeof attrs.entity_picture === 'string' ? attrs.entity_picture.trim() : '';
    if (
      rawPicture.startsWith('/') &&
      !rawPicture.startsWith('//') &&
      !/(^|\/)\.\.($|\/|\?)/.test(rawPicture)
    ) {
      try {
        const artRes = await fetchExternal(`${baseUrl}${rawPicture}`, {
          maxBytes: MAX_MEDIA_ARTWORK_BYTES,
          timeoutMs: PROBE_TIMEOUT_MS,
          allowPrivateNetwork: true,
          maxRedirects: 0,
          responseType: 'bytes',
          headers: {
            Accept: 'image/jpeg,image/png,image/webp,image/gif',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            'User-Agent': 'AmbientlyNowPlayingHA/1.0',
          },
        });
        if (artRes.ok) {
          artworkDataUrl = normalizeSafeRasterDataUrl(artRes.contentType, artRes.bytes) || undefined;
        }
      } catch {
        // Artwork fetch failures never fail track metadata display
      }
    }

    const payload: HaMediaPlayerResponse = {
      ok: true,
      state,
      friendlyName: typeof attrs.friendly_name === 'string' ? attrs.friendly_name.trim() : entityId,
      ...(title ? { title } : {}),
      ...(artist ? { artist } : {}),
      ...(album ? { album } : {}),
      mediaContentType:
        typeof attrs.media_content_type === 'string' ? attrs.media_content_type : undefined,
      durationSec: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : undefined,
      positionSec: Number.isFinite(positionNum) && positionNum >= 0 ? positionNum : undefined,
      positionUpdatedAt:
        typeof attrs.media_position_updated_at === 'string'
          ? attrs.media_position_updated_at
          : undefined,
      volumeLevel:
        typeof attrs.volume_level === 'number' && Number.isFinite(attrs.volume_level)
          ? attrs.volume_level
          : undefined,
      isMuted: typeof attrs.is_volume_muted === 'boolean' ? attrs.is_volume_muted : undefined,
      ...(artworkDataUrl ? { artworkDataUrl } : {}),
    };
    return jsonResponse(payload);
  } catch (err) {
    const blockedByLanGate = isLanGatedRejection(stateUrl, err, lanAllowed);
    return jsonResponse({
      ok: false,
      state: 'error',
      blockedByLanGate,
      error: blockedByLanGate
        ? 'Requires AMBIENTLY_ALLOW_PRIVATE_FEEDS=true on self-hosted Docker/Pi'
        : (err as Error)?.message || 'Home Assistant unreachable',
    });
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const blocked = refuseOtherSites(context.request, {
    maxRequestsPerMinute: 60,
    bucket: '/api/homelab',
  });
  if (blocked) return blocked;
  return jsonResponse({
    ok: true,
    lanAllowed: isLanPrivateFeedsEnabled(),
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const blocked = refuseOtherSites(context.request, {
    maxRequestsPerMinute: 60,
    bucket: '/api/homelab',
  });
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

  let parsedBody: HomelabApiPostPayload;
  try {
    parsedBody = (bodyText ? JSON.parse(bodyText) : {}) as HomelabApiPostPayload;
  } catch {
    return jsonResponse({ error: 'Malformed JSON body.' }, 400);
  }

  const lanAllowed = isLanPrivateFeedsEnabled();

  if (parsedBody && parsedBody.mode === 'ha_service') {
    return handleHaServiceCall(context.request, parsedBody, lanAllowed);
  }

  if (parsedBody && parsedBody.mode === 'ha_media_player') {
    return handleHaMediaPlayer(parsedBody, lanAllowed);
  }

  const checkBody = parsedBody as HomelabApiCheckRequest;
  const services = resolveHomelabServices(checkBody.services)
    .filter((s) => s.enabled && s.url.trim().length > 0)
    .slice(0, MAX_HOMELAB_SERVICES);

  const haBaseUrl = normalizeHomelabBaseUrl(checkBody.homeAssistant?.baseUrl);
  const haToken =
    typeof checkBody.homeAssistant?.accessToken === 'string'
      ? checkBody.homeAssistant.accessToken.trim()
      : '';
  const haEntities = haBaseUrl
    ? resolveHomeAssistantEntities(checkBody.homeAssistant?.entities)
        .filter((e) => e.enabled)
        .slice(0, MAX_HA_ENTITIES)
    : [];
  const cameras = resolveHomelabCameras(checkBody.cameras)
    .filter((c) => c.enabled)
    .slice(0, MAX_HOMELAB_CAMERAS);

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

  const cameraResults = await Promise.all(
    cameras.map(async (cam): Promise<HomelabCameraSnapshot> => {
      if (!lanAllowed) {
        return {
          id: cam.id,
          name: cam.name,
          state: 'ERROR',
          blockedByLanGate: true,
          error:
            'Camera snapshots require AMBIENTLY_ALLOW_PRIVATE_FEEDS=true on self-hosted Docker/Pi',
        };
      }

      let targetUrl = '';
      const headers: Record<string, string> = {
        Accept: 'image/jpeg,image/png,image/webp,image/gif',
        'User-Agent': 'AmbientlyHomeAssistantCamera/1.0',
      };
      let maxRedirects = 2;

      if (cam.sourceType === 'ha_entity') {
        if (!haBaseUrl || !cam.entityId || !isValidHomeAssistantCameraEntityId(cam.entityId)) {
          return {
            id: cam.id,
            name: cam.name,
            state: 'ERROR',
            error: 'Valid Home Assistant URL and camera.* entity ID required',
          };
        }
        targetUrl = `${haBaseUrl}/api/camera_proxy/${encodeURIComponent(cam.entityId)}`;
        if (haToken) {
          headers.Authorization = `Bearer ${haToken}`;
        }
        maxRedirects = 0;
      } else {
        targetUrl = (cam.snapshotUrl || '').trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
          return {
            id: cam.id,
            name: cam.name,
            state: 'ERROR',
            error: 'Invalid snapshot URL',
          };
        }
      }

      try {
        const res = await fetchExternal(targetUrl, {
          maxBytes: MAX_CAMERA_SNAPSHOT_BYTES,
          timeoutMs: PROBE_TIMEOUT_MS,
          allowPrivateNetwork: true,
          maxRedirects,
          responseType: 'bytes',
          headers,
        });

        if (!res.ok) {
          return {
            id: cam.id,
            name: cam.name,
            state: 'ERROR',
            error: `HTTP ${res.status}`,
          };
        }

        const dataUrl = normalizeSafeRasterDataUrl(res.contentType, res.bytes);
        if (!dataUrl) {
          return {
            id: cam.id,
            name: cam.name,
            state: 'ERROR',
            error: 'Snapshot response was not a supported raster image (JPEG/PNG/WebP/GIF)',
          };
        }

        return {
          id: cam.id,
          name: cam.name,
          state: 'OK',
          imageDataUrl: dataUrl,
          fetchedAt: new Date().toISOString(),
        };
      } catch (err) {
        return {
          id: cam.id,
          name: cam.name,
          state: 'ERROR',
          error: (err as Error)?.message || 'Camera snapshot failed',
        };
      }
    })
  );

  const responsePayload: HomelabApiCheckResponse = {
    lanAllowed,
    checkedAt: new Date().toISOString(),
    services: serviceResults,
    entities: entityResults,
    ...(cameraResults.length > 0 ? { cameras: cameraResults } : {}),
  };

  return jsonResponse(responsePayload);
}
