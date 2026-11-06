// Local JSON Backup, File System Access API & Universal Export/Restore helper
import { useState, useEffect } from 'react';
import { db } from './db';
import type { AppSettings, DashboardTab, DashboardWidget, StickyNoteItem } from '../types/dashboard';

export interface LocalExportPayload {
  version: 1;
  exportedAt: string;
  settings: AppSettings;
  tabs: DashboardTab[];
  widgets: DashboardWidget[];
  notes: StickyNoteItem[];
}

export type FileSyncStatus = 'connected' | 'needs_permission' | 'unbound' | 'unsupported';

export interface FileSyncState {
  status: FileSyncStatus;
  fileName: string | null;
  lastSyncedAt: string | null;
  error?: string;
}

// In-memory active file handle
let activeFileHandle: FileSystemFileHandle | null = null;
let isWriting = false;
let pendingPayload: LocalExportPayload | null = null;

// IndexedDB storage keys for persistent FileSystemFileHandle across browser reloads
const IDB_SYNC_DB = 'ambiently_file_sync';
const IDB_SYNC_STORE = 'handles';
const IDB_SYNC_KEY = 'active_backup_handle';

function getHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(IDB_SYNC_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_SYNC_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeFileHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await getHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_SYNC_STORE, 'readwrite');
      tx.objectStore(IDB_SYNC_STORE).put(handle, IDB_SYNC_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to persist file handle in IndexedDB:', err);
  }
}

export async function getStoredFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    if (!('indexedDB' in window)) return null;
    const db = await getHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_SYNC_STORE, 'readonly');
      const req = tx.objectStore(IDB_SYNC_STORE).get(IDB_SYNC_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearStoredFileHandle(): Promise<void> {
  try {
    if (!('indexedDB' in window)) return;
    const db = await getHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_SYNC_STORE, 'readwrite');
      tx.objectStore(IDB_SYNC_STORE).delete(IDB_SYNC_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore error
  }
}

// Reactive status subscription system
let currentFileSyncState: FileSyncState = {
  status: typeof window !== 'undefined' && 'showSaveFilePicker' in window ? 'unbound' : 'unsupported',
  fileName: null,
  lastSyncedAt: null,
};

const listeners = new Set<(state: FileSyncState) => void>();

function updateFileSyncState(partial: Partial<FileSyncState>) {
  currentFileSyncState = { ...currentFileSyncState, ...partial };
  listeners.forEach((l) => l(currentFileSyncState));
}

export function getFileSyncState(): FileSyncState {
  return currentFileSyncState;
}

export function subscribeFileSync(listener: (state: FileSyncState) => void): () => void {
  listeners.add(listener);
  listener(currentFileSyncState);
  return () => {
    listeners.delete(listener);
  };
}

export function useFileSync(): FileSyncState {
  const [state, setState] = useState<FileSyncState>(getFileSyncState());
  useEffect(() => {
    return subscribeFileSync(setState);
  }, []);
  return state;
}

// 1. Universal One-Click Download Backup (.json) - Works on ALL browsers and mobile devices
export function downloadBackupFile(
  settings: AppSettings,
  tabs: DashboardTab[],
  widgets: DashboardWidget[],
  notes: StickyNoteItem[]
): void {
  const payload: LocalExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    tabs,
    widgets,
    notes,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `ambiently-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 2. Universal File Upload & Validation for Restore (.json)
export async function parseAndValidateBackup(
  file: File
): Promise<{ success: boolean; data?: LocalExportPayload; error?: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid JSON file.' };
    }

    if (!Array.isArray(data.tabs) || !Array.isArray(data.widgets) || !Array.isArray(data.notes)) {
      return {
        success: false,
        error: 'Incompatible backup format: missing tabs, widgets, or notes collections.',
      };
    }

    return { success: true, data: data as LocalExportPayload };
  } catch (err: any) {
    return { success: false, error: `Failed to parse file: ${err.message}` };
  }
}

// 3. Destructively restore backup payload into local IndexedDB
export async function restoreBackupToDatabase(
  payload: LocalExportPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Restore Settings
    if (payload.settings) {
      await db.settings.put(payload.settings);
    }

    // 2. Replace Tabs
    await db.tabs.clear();
    if (payload.tabs.length > 0) {
      await db.tabs.bulkAdd(payload.tabs);
    }

    // 3. Replace Widgets
    await db.widgets.clear();
    if (payload.widgets.length > 0) {
      await db.widgets.bulkAdd(payload.widgets);
    }

    // 4. Replace Notes
    await db.notes.clear();
    if (payload.notes.length > 0) {
      await db.notes.bulkAdd(payload.notes);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// 4. Chromium Real-Time Auto-Sync File Binding with Session Persistence
export async function checkFileBindingStatus(): Promise<FileSyncState> {
  if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
    updateFileSyncState({ status: 'unsupported', fileName: null });
    return currentFileSyncState;
  }

  if (activeFileHandle) {
    updateFileSyncState({ status: 'connected', fileName: activeFileHandle.name });
    return currentFileSyncState;
  }

  const stored = await getStoredFileHandle();
  if (!stored) {
    updateFileSyncState({ status: 'unbound', fileName: null });
    return currentFileSyncState;
  }

  try {
    // queryPermission is silent and does not prompt the user
    const perm = await (stored as any).queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      activeFileHandle = stored;
      updateFileSyncState({ status: 'connected', fileName: stored.name, error: undefined });
    } else {
      updateFileSyncState({ status: 'needs_permission', fileName: stored.name });
    }
  } catch {
    updateFileSyncState({ status: 'unbound', fileName: null });
  }

  return currentFileSyncState;
}

export async function reconnectStoredFile(): Promise<{
  success: boolean;
  handle?: FileSystemFileHandle;
  error?: string;
}> {
  const stored = await getStoredFileHandle();
  if (!stored) {
    return { success: false, error: 'No previously linked file found.' };
  }

  try {
    // requestPermission must be called from a user gesture
    const perm = await (stored as any).requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      activeFileHandle = stored;
      updateFileSyncState({ status: 'connected', fileName: stored.name, error: undefined });
      return { success: true, handle: stored };
    } else {
      updateFileSyncState({ status: 'needs_permission', fileName: stored.name });
      return { success: false, error: 'Permission was not granted to write to the file.' };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function openLocalFileBinding(): Promise<{
  success: boolean;
  handle?: FileSystemFileHandle;
  error?: string;
}> {
  try {
    if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
      updateFileSyncState({ status: 'unsupported' });
      return { success: false, error: 'File System Access API is not supported on this browser.' };
    }

    const handle = await (window as any).showSaveFilePicker({
      suggestedName: 'ambiently-data.json',
      types: [
        {
          description: 'Ambiently JSON Backup',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    activeFileHandle = handle;
    await storeFileHandle(handle);
    updateFileSyncState({ status: 'connected', fileName: handle.name, error: undefined });
    return { success: true, handle };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'User cancelled file selection.' };
    }
    return { success: false, error: err.message };
  }
}

export async function disconnectLocalFile(): Promise<void> {
  activeFileHandle = null;
  await clearStoredFileHandle();
  updateFileSyncState({ status: 'unbound', fileName: null, lastSyncedAt: null, error: undefined });
}

// 5. Safe, Queued File Write Stream
export async function saveSnapshotToFile(
  payload: LocalExportPayload
): Promise<{ success: boolean; error?: string }> {
  if (!activeFileHandle) {
    return { success: false, error: 'No active local file bound.' };
  }

  // If a write is currently in-flight, coalesce payload into pending queue
  if (isWriting) {
    pendingPayload = payload;
    return { success: true };
  }

  isWriting = true;
  try {
    const writable = await (activeFileHandle as any).createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    const now = new Date().toISOString();
    updateFileSyncState({ lastSyncedAt: now, error: undefined });
    return { success: true };
  } catch (err: any) {
    updateFileSyncState({ error: err.message });
    return { success: false, error: err.message };
  } finally {
    isWriting = false;
    // Process any queued payload that arrived during the write
    if (pendingPayload) {
      const next = pendingPayload;
      pendingPayload = null;
      saveSnapshotToFile(next).catch(() => {});
    }
  }
}

export function hasActiveLocalFile(): boolean {
  return activeFileHandle !== null;
}
