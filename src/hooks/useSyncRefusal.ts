import { useSyncExternalStore } from 'react';
import { getSyncRefusal, subscribeSyncRefusal, type SyncRefusal } from '../services/syncRefusal';

/** The cloud's refusal of this board's changes because the board is full, or null. */
export function useSyncRefusal(): SyncRefusal | null {
  return useSyncExternalStore(subscribeSyncRefusal, getSyncRefusal);
}
