import { create } from 'zustand';
import { db, DEFAULT_CALENDAR_EVENTS_SNAPSHOT } from '../services/db';
import { nextMonotonicIso } from '../services/syncMerge';
import {
  MAX_DELETED_CALENDAR_EVENT_TOMBSTONES,
  MAX_LOCAL_CALENDAR_EVENTS,
  type CalendarEventsSnapshot,
  type LocalFamilyEvent,
} from '../types/calendarEvents';
import {
  calendarEventsContentEqual,
  mergeCalendarEventsSnapshots,
  sanitizeCalendarEventsSnapshot,
  sanitizeLocalFamilyEvent,
} from '../utils/calendarEventsEngine';

let calendarPersistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let calendarPersistListener: (() => void) | null = null;

export function registerCalendarEventsPersistListener(listener: () => void): void {
  calendarPersistListener = listener;
}

async function persistCalendarEventsSnapshot(snapshot: CalendarEventsSnapshot): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await db.calendarEvents.put(snapshot);
    } catch (err) {
      console.warn('Failed to persist local family calendar events to IndexedDB:', err);
    }
  }

  if (calendarPersistDebounceTimer) {
    clearTimeout(calendarPersistDebounceTimer);
  }
  calendarPersistDebounceTimer = setTimeout(() => {
    try {
      calendarPersistListener?.();
    } catch {
      // Ignore if offline or unauthenticated
    }
  }, 150);
}

function generateLocalEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fam-evt-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `fam-evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export type AddLocalFamilyEventInput = Omit<LocalFamilyEvent, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateLocalFamilyEventInput = Partial<Omit<LocalFamilyEvent, 'id' | 'createdAt' | 'updatedAt'>>;

interface CalendarEventsStoreState {
  isInitialized: boolean;
  snapshot: CalendarEventsSnapshot;
  events: LocalFamilyEvent[];

  initCalendarEventsStore: () => Promise<void>;
  addEvent: (input: AddLocalFamilyEventInput) => Promise<LocalFamilyEvent | null>;
  updateEvent: (eventId: string, updates: UpdateLocalFamilyEventInput) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  applyRemoteCalendarEventsSnapshot: (incoming: CalendarEventsSnapshot) => Promise<void>;
  resetForBoardSwitch: () => void;
}

export const useCalendarEventsStore = create<CalendarEventsStoreState>((set, get) => {
  const commitState = (
    nextSnapshot: CalendarEventsSnapshot,
    extra?: Partial<CalendarEventsStoreState>
  ) => {
    const clean = sanitizeCalendarEventsSnapshot(nextSnapshot);
    set({
      ...extra,
      snapshot: clean,
      events: clean.events,
    });
  };

  return {
    isInitialized: false,
    snapshot: DEFAULT_CALENDAR_EVENTS_SNAPSHOT,
    events: DEFAULT_CALENDAR_EVENTS_SNAPSHOT.events,

    initCalendarEventsStore: async () => {
      try {
        if (typeof indexedDB === 'undefined') {
          commitState(DEFAULT_CALENDAR_EVENTS_SNAPSHOT, { isInitialized: true });
          return;
        }
        const stored = await db.calendarEvents.get('household_calendar_events');
        if (stored) {
          commitState(stored, { isInitialized: true });
          return;
        }
        await db.calendarEvents.put(DEFAULT_CALENDAR_EVENTS_SNAPSHOT);
        commitState(DEFAULT_CALENDAR_EVENTS_SNAPSHOT, { isInitialized: true });
      } catch (err) {
        console.warn('Failed to initialize calendarEvents store from IndexedDB:', err);
        commitState(DEFAULT_CALENDAR_EVENTS_SNAPSHOT, { isInitialized: true });
      }
    },

    addEvent: async (input) => {
      const current = get().snapshot;
      if (current.events.length >= MAX_LOCAL_CALENDAR_EVENTS) return null;
      const nowIso = nextMonotonicIso(current.updated_at);
      const created = sanitizeLocalFamilyEvent({
        ...input,
        id: generateLocalEventId(),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (!created) return null;

      const nextSnapshot = sanitizeCalendarEventsSnapshot({
        id: 'household_calendar_events',
        events: [...current.events, created],
        deletedEventIds: (current.deletedEventIds || []).filter((id) => id !== created.id),
        updated_at: nowIso,
      });
      commitState(nextSnapshot, { isInitialized: true });
      await persistCalendarEventsSnapshot(nextSnapshot);
      return created;
    },

    updateEvent: async (eventId, updates) => {
      const current = get().snapshot;
      const existing = current.events.find((e) => e.id === eventId);
      if (!existing) return;

      const nowIso = nextMonotonicIso(current.updated_at);
      const updated = sanitizeLocalFamilyEvent({
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nowIso,
      });
      if (!updated) return;

      const nextSnapshot = sanitizeCalendarEventsSnapshot({
        ...current,
        id: 'household_calendar_events',
        events: current.events.map((e) => (e.id === eventId ? updated : e)),
        updated_at: nowIso,
      });
      commitState(nextSnapshot, { isInitialized: true });
      await persistCalendarEventsSnapshot(nextSnapshot);
    },

    deleteEvent: async (eventId) => {
      const current = get().snapshot;
      if (!current.events.some((e) => e.id === eventId)) return;

      const nowIso = nextMonotonicIso(current.updated_at);
      const nextEvents = current.events.filter((e) => e.id !== eventId);
      const deletedEventIds = Array.from(
        new Set([...(current.deletedEventIds || []), eventId])
      ).slice(-MAX_DELETED_CALENDAR_EVENT_TOMBSTONES);

      const nextSnapshot = sanitizeCalendarEventsSnapshot({
        id: 'household_calendar_events',
        events: nextEvents,
        deletedEventIds,
        updated_at: nowIso,
      });
      commitState(nextSnapshot, { isInitialized: true });
      await persistCalendarEventsSnapshot(nextSnapshot);
    },

    applyRemoteCalendarEventsSnapshot: async (incoming) => {
      const storedLocal = get().isInitialized
        ? get().snapshot
        : typeof indexedDB !== 'undefined'
          ? await db.calendarEvents.get('household_calendar_events').catch(() => undefined)
          : undefined;
      const local = storedLocal || incoming;
      const merged = mergeCalendarEventsSnapshots(local, incoming);

      if (!calendarEventsContentEqual(merged, incoming)) {
        const latestKnown =
          (Date.parse(local.updated_at || '') || 0) > (Date.parse(incoming.updated_at || '') || 0)
            ? local.updated_at
            : incoming.updated_at;
        const toShare: CalendarEventsSnapshot = {
          ...merged,
          updated_at: nextMonotonicIso(latestKnown),
        };
        commitState(toShare, { isInitialized: true });
        await persistCalendarEventsSnapshot(toShare);
        return;
      }

      commitState(merged, { isInitialized: true });
      if (typeof indexedDB !== 'undefined') {
        try {
          await db.calendarEvents.put(merged);
        } catch (err) {
          console.warn('Failed to persist merged calendar events snapshot to IndexedDB:', err);
        }
      }
    },

    resetForBoardSwitch: () => {
      commitState(DEFAULT_CALENDAR_EVENTS_SNAPSHOT, { isInitialized: false });
    },
  };
});
