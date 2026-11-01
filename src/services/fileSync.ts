// File System Access API helper to read/write state to ambiently-data.json

export interface LocalExportPayload {
  version: 1;
  exportedAt: string;
  settings: any;
  tabs: any[];
  widgets: any[];
  notes: any[];
}

let activeFileHandle: FileSystemFileHandle | null = null;

export async function openLocalFileBinding(): Promise<{ success: boolean; handle?: FileSystemFileHandle; error?: string }> {
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

export async function saveSnapshotToFile(payload: LocalExportPayload): Promise<{ success: boolean; error?: string }> {
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
