import { useEffect, useState } from 'react';
import { db } from '../services/db';
import type { DashboardWidget } from '../types/dashboard';
import { MAX_UPLOAD_BYTES, VAULT_MEDIA_PREFIX } from './mediaOptimization';

const MAX_STATIC_IMAGE_DIMENSION = 1600;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read uploaded file.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read uploaded file.'));
    reader.readAsDataURL(file);
  });
}

function optimizeStaticRasterDataUrl(rawDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve(rawDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          resolve(rawDataUrl);
          return;
        }

        const scale = Math.min(1, MAX_STATIC_IMAGE_DIMENSION / Math.max(naturalWidth, naturalHeight));
        const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
        const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const compressed = canvas.toDataURL('image/webp', 0.85);
        resolve(compressed && compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(5, commaIdx);
    const body = dataUrl.slice(commaIdx + 1);
    const semiIdx = header.indexOf(';');
    const mimeType = (semiIdx === -1 ? header : header.slice(0, semiIdx)) || 'application/octet-stream';
    const isBase64 = header.includes(';base64');

    if (isBase64) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }

    return new Blob([decodeURIComponent(body)], { type: mimeType });
  } catch {
    return null;
  }
}

/**
 * Persists an uploaded image/GIF into device-local IndexedDB (db.vault) so multi-MB Base64 strings
 * never bloat Zustand state, IndexedDB widget rows, or Cloud Sync payloads.
 */
export async function storeUploadedMediaInVault(
  file: File
): Promise<{ vaultUrl: string; title: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds the 10 MB upload limit.');
  }

  let dataUrl = await readFileAsDataUrl(file);
  if (file.type === 'image/jpeg' || file.type === 'image/png') {
    dataUrl = await optimizeStaticRasterDataUrl(dataUrl);
  }

  const key = `local-media:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.vault.put({
    key,
    value: dataUrl,
    description: file.name,
    updated_at: new Date().toISOString(),
  });

  return {
    vaultUrl: `vault://${key}`,
    title: file.name.replace(/\.[^/.]+$/, '') || 'Uploaded Image',
  };
}

/**
 * Resolves `vault://local-media:*` references into Blob ObjectURLs and revokes them cleanly on unmount.
 */
export function useVaultMediaUrl(rawUrl: string): {
  resolvedUrl: string;
  isLoading: boolean;
  isMissing: boolean;
} {
  const trimmed = rawUrl.trim();
  const isVaultUrl = trimmed.startsWith(VAULT_MEDIA_PREFIX);
  const [state, setState] = useState<{
    source: string;
    resolvedUrl: string;
    isLoading: boolean;
    isMissing: boolean;
  }>(() => ({
    source: trimmed,
    resolvedUrl: isVaultUrl ? '' : trimmed,
    isLoading: isVaultUrl,
    isMissing: false,
  }));

  useEffect(() => {
    if (!isVaultUrl) {
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;
    const vaultKey = trimmed.slice('vault://'.length);

    void db.vault
      .get(vaultKey)
      .then((entry) => {
        if (cancelled) return;
        if (!entry?.value) {
          setState({ source: trimmed, resolvedUrl: '', isLoading: false, isMissing: true });
          return;
        }

        const blob = dataUrlToBlob(entry.value);
        if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          createdObjectUrl = URL.createObjectURL(blob);
          setState({
            source: trimmed,
            resolvedUrl: createdObjectUrl,
            isLoading: false,
            isMissing: false,
          });
          return;
        }

        setState({ source: trimmed, resolvedUrl: entry.value, isLoading: false, isMissing: false });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ source: trimmed, resolvedUrl: '', isLoading: false, isMissing: true });
        }
      });

    return () => {
      cancelled = true;
      if (createdObjectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [isVaultUrl, trimmed]);

  if (!isVaultUrl) {
    return { resolvedUrl: trimmed, isLoading: false, isMissing: false };
  }

  if (state.source !== trimmed) {
    return { resolvedUrl: '', isLoading: true, isMissing: false };
  }

  return {
    resolvedUrl: state.resolvedUrl,
    isLoading: state.isLoading,
    isMissing: state.isMissing,
  };
}

/**
 * Collects device-local uploaded media payloads referenced by active canvas widgets for JSON backup export.
 */
export async function collectVaultMediaMap(
  widgets: DashboardWidget[]
): Promise<Record<string, string>> {
  const keys = Array.from(
    new Set(
      widgets
        .map((w) => w.config?.url)
        .filter((u): u is string => typeof u === 'string' && u.startsWith(VAULT_MEDIA_PREFIX))
        .map((u) => u.slice('vault://'.length))
    )
  );
  if (keys.length === 0) return {};

  const rows = await db.vault.bulkGet(keys);
  const map: Record<string, string> = {};
  rows.forEach((row, idx) => {
    if (row?.value) {
      map[keys[idx]] = row.value;
    }
  });
  return map;
}

/**
 * Restores uploaded media entries from a JSON backup into local IndexedDB (db.vault).
 */
export async function restoreVaultMediaMap(localMedia?: Record<string, string>): Promise<void> {
  if (!localMedia || typeof localMedia !== 'object') return;
  const now = new Date().toISOString();
  const entries = Object.entries(localMedia)
    .filter(([key, value]) => key.startsWith('local-media:') && typeof value === 'string' && value.length > 0)
    .map(([key, value]) => ({
      key,
      value,
      description: 'Restored local media upload',
      updated_at: now,
    }));

  if (entries.length > 0) {
    await db.vault.bulkPut(entries);
  }
}
