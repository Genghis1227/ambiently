// Local JSON Backup, File System Access API & Universal Export/Restore helper
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

let activeFileHandle: FileSystemFileHandle | null = null;

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

// 4. Chromium Real-Time Auto-Sync File Binding
export async function openLocalFileBinding(): Promise<{
  success: boolean;
  handle?: FileSystemFileHandle;
  error?: string;
}> {
  try {
    if (!('showSaveFilePicker' in window)) {
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
    return { success: true, handle };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'User cancelled file selection.' };
    }
    return { success: false, error: err.message };
  }
}

export async function saveSnapshotToFile(
  payload: LocalExportPayload
): Promise<{ success: boolean; error?: string }> {
  if (!activeFileHandle) {
    return { success: false, error: 'No active local file bound.' };
  }

  try {
    const writable = await (activeFileHandle as any).createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function hasActiveLocalFile(): boolean {
  return activeFileHandle !== null;
}
