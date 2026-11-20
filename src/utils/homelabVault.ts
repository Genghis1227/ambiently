import { db } from '../services/db';
import type { HomelabLocalVaultCredentials } from '../types/phase5Widgets';

export const HOMELAB_VAULT_KEY_PREFIX = 'homelab-cred:';
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

function normalizeHomelabCredentials(raw: unknown): HomelabLocalVaultCredentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<HomelabLocalVaultCredentials>;
  const haAccessToken =
    typeof candidate.haAccessToken === 'string' ? candidate.haAccessToken.trim() : '';
  if (!haAccessToken) return null;
  return { haAccessToken };
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
    notifyHomelabVaultUpdated(widgetId);
    return;
  }

  await db.vault.put({
    key,
    value: serialized,
    description: 'Device-local Home Assistant access token (never synced to cloud)',
    updated_at: new Date().toISOString(),
  });
  notifyHomelabVaultUpdated(widgetId);
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
