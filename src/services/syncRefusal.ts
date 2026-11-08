// Whether the cloud is refusing some of this board's changes because the board is full, so the app
// can say so instead of only logging it. pushToCloud sets and clears it.

export interface SyncRefusal {
  message: string;
}

let current: SyncRefusal | null = null;
const listeners = new Set<() => void>();

export function getSyncRefusal(): SyncRefusal | null {
  return current;
}

export function subscribeSyncRefusal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setSyncRefusal(next: SyncRefusal | null): void {
  // Keep the same object while the message is the same, so a hidden notice stays hidden
  if (current?.message === next?.message) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** True for the database's "this board is full" refusal (see "Board Size Limits" in supabase/schema.sql). */
export function isBoardFullError(err: unknown): err is { code: string; message: string } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'board_full';
}
