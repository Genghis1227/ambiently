import { db } from '../services/db';
import type { WifiLocalVaultCredentials, WifiSecurityType } from '../types/phase2Widgets';

export const WIFI_VAULT_KEY_PREFIX = 'wifi-cred:';
export const WIFI_VAULT_UPDATED_EVENT = 'ambiently_wifi_vault_updated';

const memoryFallbackVault = new Map<string, string>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function notifyVaultUpdated(widgetId: string): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WIFI_VAULT_UPDATED_EVENT, { detail: { widgetId } }));
  }
}

function normalizeSecurity(raw: unknown): WifiSecurityType {
  if (raw === 'WEP' || raw === 'nopass') return raw;
  return 'WPA';
}

function normalizeVaultCredentials(raw: unknown): WifiLocalVaultCredentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<WifiLocalVaultCredentials>;
  const cleanSsid = typeof candidate.ssid === 'string' ? candidate.ssid.trim() : '';
  if (!cleanSsid) return null;
  const security = normalizeSecurity(candidate.security);
  return {
    ssid: cleanSsid,
    password: security === 'nopass' ? '' : typeof candidate.password === 'string' ? candidate.password : '',
    security,
    hiddenNetwork: Boolean(candidate.hiddenNetwork),
  };
}

export function getWifiVaultKey(widgetId: string): string {
  return `${WIFI_VAULT_KEY_PREFIX}${widgetId}`;
}

/** Escapes special ZXing Wi-Fi QR fields (`\`, `;`, `,`, `"`, `:`). */
export function escapeWifiQrField(raw: string): string {
  return raw.replace(/([\\;,":])/g, '\\$1');
}

export interface WifiQrPayloadParams {
  ssid: string;
  password?: string;
  security?: WifiSecurityType;
  hiddenNetwork?: boolean;
}

/** Builds a standard `WIFI:` QR string scannable by iOS and Android camera apps. */
export function buildWifiQrPayload({
  ssid,
  password = '',
  security = 'WPA',
  hiddenNetwork = false,
}: WifiQrPayloadParams): string {
  const cleanSsid = ssid.trim();
  const escapedSsid = escapeWifiQrField(cleanSsid);
  const hiddenPart = hiddenNetwork ? 'H:true;' : '';

  if (security === 'nopass') {
    return `WIFI:T:nopass;S:${escapedSsid};${hiddenPart};`;
  }

  const escapedPass = escapeWifiQrField(password);
  return `WIFI:T:${security};S:${escapedSsid};P:${escapedPass};${hiddenPart};`;
}

export async function saveWifiCredentialsToVault(
  widgetId: string,
  creds: WifiLocalVaultCredentials
): Promise<void> {
  const cleanCreds = normalizeVaultCredentials(creds);
  if (!cleanCreds) {
    await deleteWifiCredentialsFromVault(widgetId);
    return;
  }

  const key = getWifiVaultKey(widgetId);
  const serialized = JSON.stringify(cleanCreds);

  if (!hasIndexedDb()) {
    memoryFallbackVault.set(key, serialized);
    notifyVaultUpdated(widgetId);
    return;
  }

  await db.vault.put({
    key,
    value: serialized,
    description: 'Device-local Wi-Fi QR credentials (never synced to cloud)',
    updated_at: new Date().toISOString(),
  });
  notifyVaultUpdated(widgetId);
}

export async function loadWifiCredentialsFromVault(
  widgetId: string
): Promise<WifiLocalVaultCredentials | null> {
  const key = getWifiVaultKey(widgetId);
  let rawValue: string | null = null;

  if (!hasIndexedDb()) {
    rawValue = memoryFallbackVault.get(key) ?? null;
  } else {
    try {
      const entry = await db.vault.get(key);
      rawValue = entry ? entry.value : null;
    } catch {
      return null;
    }
  }

  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return normalizeVaultCredentials(parsed);
  } catch {
    return null;
  }
}

export async function deleteWifiCredentialsFromVault(widgetId: string): Promise<void> {
  const key = getWifiVaultKey(widgetId);
  if (!hasIndexedDb()) {
    memoryFallbackVault.delete(key);
    notifyVaultUpdated(widgetId);
    return;
  }
  try {
    await db.vault.delete(key);
  } catch {
    // ignore storage errors
  }
  notifyVaultUpdated(widgetId);
}
