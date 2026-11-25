import { db } from '../services/db';
import type { HomelabLocalVaultCredentials } from '../types/phase5Widgets';

export const HOMELAB_VAULT_KEY_PREFIX = 'homelab-cred:';
export const SHARED_HOMELAB_VAULT_KEY = 'homelab-cred:__shared_ha__';
export const HOMELAB_VAULT_UPDATED_EVENT = 'ambiently_homelab_vault_updated';

const memoryFallbackVault = new Map<string, string>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function notifyHomelabVaultUpdated(widgetId: string): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOMELAB_VAULT_UPDATED_EVENT, { detail: { widgetId } }));
  }
}

export function extractHomelabOrigin(rawUrl: string | undefined | null): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeHomelabCredentials(raw: unknown): HomelabLocalVaultCredentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<HomelabLocalVaultCredentials>;
  const haAccessToken =
    typeof candidate.haAccessToken === 'string' ? candidate.haAccessToken.trim() : '';
  if (!haAccessToken) return null;
  const boundOrigin = extractHomelabOrigin(candidate.boundOrigin);
  return boundOrigin ? { haAccessToken, boundOrigin } : { haAccessToken };
}

export function resolveBoundHomelabToken(
  creds: HomelabLocalVaultCredentials | null,
  currentBaseUrl: string | undefined | null
): { token: string; originMismatch: boolean } {
  if (!creds?.haAccessToken) {
    return { token: '', originMismatch: false };
  }
  const targetOrigin = extractHomelabOrigin(currentBaseUrl);
  if (!targetOrigin) {
    return { token: '', originMismatch: false };
  }
  if (!creds.boundOrigin || creds.boundOrigin !== targetOrigin) {
    return { token: '', originMismatch: true };
  }
  return { token: creds.haAccessToken, originMismatch: false };
}

export function getHomelabVaultKey(widgetId: string): string {
  return `${HOMELAB_VAULT_KEY_PREFIX}${widgetId}`;
}

export async function saveHomelabCredentialsToVault(
  widgetId: string,
  creds: HomelabLocalVaultCredentials
): Promise<void> {
  const cleanCreds = normalizeHomelabCredentials(creds);
  if (!cleanCreds) {
    await deleteHomelabCredentialsFromVault(widgetId);
    return;
  }

  const key = getHomelabVaultKey(widgetId);
  const serialized = JSON.stringify(cleanCreds);

  if (!hasIndexedDb()) {
    memoryFallbackVault.set(key, serialized);
    if (cleanCreds.boundOrigin) {
      memoryFallbackVault.set(SHARED_HOMELAB_VAULT_KEY, serialized);
    }
    notifyHomelabVaultUpdated(widgetId);
    return;
  }

  await db.vault.put({
    key,
    value: serialized,
    description: 'Device-local Home Assistant access token (never synced to cloud)',
    updated_at: new Date().toISOString(),
  });
  if (cleanCreds.boundOrigin) {
    await db.vault.put({
      key: SHARED_HOMELAB_VAULT_KEY,
      value: serialized,
      description: 'Shared device-local Home Assistant token (never synced to cloud)',
      updated_at: new Date().toISOString(),
    });
  }
  notifyHomelabVaultUpdated(widgetId);
}

export async function loadHomelabCredentialsWithSharedFallback(
  widgetId: string,
  targetBaseUrl?: string | null
): Promise<HomelabLocalVaultCredentials | null> {
  const own = await loadHomelabCredentialsFromVault(widgetId);
  if (own) return own;

  const targetOrigin = extractHomelabOrigin(targetBaseUrl);
  if (!targetOrigin) return null;

  let rawShared: string | null = null;
  if (!hasIndexedDb()) {
    rawShared = memoryFallbackVault.get(SHARED_HOMELAB_VAULT_KEY) ?? null;
  } else {
    try {
      const entry = await db.vault.get(SHARED_HOMELAB_VAULT_KEY);
      rawShared = entry ? entry.value : null;
    } catch {
      return null;
    }
  }
  if (!rawShared) return null;
  try {
    const parsed = normalizeHomelabCredentials(JSON.parse(rawShared));
    if (parsed && parsed.boundOrigin === targetOrigin) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function loadHomelabCredentialsFromVault(
  widgetId: string
): Promise<HomelabLocalVaultCredentials | null> {
  const key = getHomelabVaultKey(widgetId);
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
    return normalizeHomelabCredentials(parsed);
  } catch {
    return null;
  }
}

export async function deleteHomelabCredentialsFromVault(widgetId: string): Promise<void> {
  const key = getHomelabVaultKey(widgetId);
  memoryFallbackVault.delete(key);
  if (hasIndexedDb()) {
    await db.vault.delete(key).catch(() => {});
  }
  notifyHomelabVaultUpdated(widgetId);
}
