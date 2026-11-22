import type { CalendarEvent } from '../services/feeds';
import {
  LOCAL_CALENDAR_ID,
  LOCAL_CALENDAR_NAME,
  LOCAL_EVENT_COLORS,
  MAX_DELETED_CALENDAR_EVENT_TOMBSTONES,
  MAX_LOCAL_CALENDAR_EVENTS,
  type CalendarEventsSnapshot,
  type LocalFamilyEvent,
} from '../types/calendarEvents';
import type { HouseholdProfile } from '../types/profiles';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays, 0, 0, 0, 0);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function combineDateAndTimeToIso(dateKey: string, timeHm: string): string | null {
  if (!DATE_KEY_RE.test(dateKey) || !TIME_HM_RE.test(timeHm)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = timeHm.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/**
 * Validates and normalizes a persisted LocalFamilyEvent entry. Returns null for corrupt entries.
 */
export function sanitizeLocalFamilyEvent(raw: unknown): LocalFamilyEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<LocalFamilyEvent>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const title = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 120) : '';
  const date = typeof candidate.date === 'string' ? candidate.date.trim() : '';
  if (!id || !title || !DATE_KEY_RE.test(date)) return null;

  const isAllDay = candidate.isAllDay !== false;
  const rawEndDate = typeof candidate.endDate === 'string' ? candidate.endDate.trim() : '';
  const endDate =
    rawEndDate && DATE_KEY_RE.test(rawEndDate) && rawEndDate >= date ? rawEndDate : undefined;

  const rawStartTime = typeof candidate.startTime === 'string' ? candidate.startTime.trim() : '';
  const startTime = !isAllDay && TIME_HM_RE.test(rawStartTime) ? rawStartTime : undefined;

  const rawEndTime = typeof candidate.endTime === 'string' ? candidate.endTime.trim() : '';
  const endTime = !isAllDay && TIME_HM_RE.test(rawEndTime) ? rawEndTime : undefined;

  const rawColor = typeof candidate.color === 'string' ? candidate.color.trim() : '';
  const color = HEX_COLOR_RE.test(rawColor) ? rawColor : LOCAL_EVENT_COLORS[0];

  const profileIds = Array.isArray(candidate.profileIds)
    ? Array.from(
        new Set(
          candidate.profileIds
            .filter((pid): pid is string => typeof pid === 'string' && pid.trim().length > 0)
            .map((pid) => pid.trim())
        )
      )
    : undefined;

  const location =
    typeof candidate.location === 'string' && candidate.location.trim()
      ? candidate.location.trim().slice(0, 160)
      : undefined;
  const notes =
    typeof candidate.notes === 'string' && candidate.notes.trim()
      ? candidate.notes.trim().slice(0, 500)
      : undefined;

  const createdAt =
    typeof candidate.createdAt === 'string' && candidate.createdAt.trim()
      ? candidate.createdAt
      : EPOCH_ISO;
  const updatedAt =
    typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
      ? candidate.updatedAt
      : createdAt;

  return {
    id,
    title,
    date,
    ...(endDate && endDate !== date ? { endDate } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    isAllDay,
    color,
    ...(profileIds && profileIds.length > 0 ? { profileIds } : {}),
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Normalizes and deduplicates a CalendarEventsSnapshot bounded by `MAX_LOCAL_CALENDAR_EVENTS`.
 */
export function sanitizeCalendarEventsSnapshot(
  snapshot: Partial<CalendarEventsSnapshot> | undefined
): CalendarEventsSnapshot {
  const byId = new Map<string, LocalFamilyEvent>();
  if (Array.isArray(snapshot?.events)) {
    for (const raw of snapshot.events) {
      const clean = sanitizeLocalFamilyEvent(raw);
      if (!clean) continue;
      const existing = byId.get(clean.id);
      if (!existing || Date.parse(clean.updatedAt) >= Date.parse(existing.updatedAt)) {
        byId.set(clean.id, clean);
      }
    }
  }

  const events = Array.from(byId.values())
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, MAX_LOCAL_CALENDAR_EVENTS);

  const presentIds = new Set(events.map((e) => e.id));
  const deletedEventIds = Array.isArray(snapshot?.deletedEventIds)
    ? Array.from(
        new Set(
          snapshot.deletedEventIds.filter(
            (id): id is string => typeof id === 'string' && id.length > 0 && !presentIds.has(id)
          )
        )
      ).slice(-MAX_DELETED_CALENDAR_EVENT_TOMBSTONES)
    : [];

  return {
    id: 'household_calendar_events',
    events,
    deletedEventIds,
    updated_at:
      typeof snapshot?.updated_at === 'string' && snapshot.updated_at.trim()
        ? snapshot.updated_at
        : EPOCH_ISO,
  };
}

/**
 * Merges two CalendarEventsSnapshots using per-event timestamps and deletion tombstones so events
 * added on either device survive sync while deletions stay respected.
 */
export function mergeCalendarEventsSnapshots(
  localRaw: CalendarEventsSnapshot,
  incomingRaw: CalendarEventsSnapshot
): CalendarEventsSnapshot {
  const local = sanitizeCalendarEventsSnapshot(localRaw);
  const incoming = sanitizeCalendarEventsSnapshot(incomingRaw);

  const localTime = Date.parse(local.updated_at || '') || 0;
  const remoteTime = Date.parse(incoming.updated_at || '') || 0;

  if (localTime <= 0 && remoteTime > 0) return incoming;
  if (remoteTime <= 0 && localTime > 0) return local;

  const incomingWins = remoteTime >= localTime;
  const winner = incomingWins ? incoming : local;
  const loser = incomingWins ? local : incoming;
  const loserTime = Date.parse(loser.updated_at || '') || 0;

  const winnerDeletedSet = new Set(winner.deletedEventIds || []);
  const loserDeletedSet = new Set(loser.deletedEventIds || []);
  const loserById = new Map(loser.events.map((evt) => [evt.id, evt]));

  const merged: LocalFamilyEvent[] = [];
  const seenIds = new Set<string>();

  for (const evt of winner.events) {
    const evtTime = Date.parse(evt.updatedAt || winner.updated_at || '') || 0;
    if (loserDeletedSet.has(evt.id) && evtTime < loserTime) {
      continue;
    }
    const other = loserById.get(evt.id);
    if (other && (Date.parse(other.updatedAt || '') || 0) > evtTime) {
      merged.push(other);
    } else {
      merged.push(evt);
    }
    seenIds.add(evt.id);
  }

  for (const evt of loser.events) {
    if (seenIds.has(evt.id) || winnerDeletedSet.has(evt.id)) continue;
    merged.push(evt);
    seenIds.add(evt.id);
  }

  const finalEvents = merged
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, MAX_LOCAL_CALENDAR_EVENTS);
  const presentIds = new Set(finalEvents.map((e) => e.id));

  const mergedDeletedIds = Array.from(
    new Set([...(winner.deletedEventIds || []), ...(loser.deletedEventIds || [])])
  )
    .filter((id) => !presentIds.has(id))
    .slice(-MAX_DELETED_CALENDAR_EVENT_TOMBSTONES);

  return {
    id: 'household_calendar_events',
    events: finalEvents,
    deletedEventIds: mergedDeletedIds,
    updated_at: incomingWins ? incoming.updated_at : local.updated_at,
  };
}

/**
 * Returns true when two snapshots contain identical normalized events and tombstones.
 */
export function calendarEventsContentEqual(
  a: CalendarEventsSnapshot,
  b: CalendarEventsSnapshot
): boolean {
  const serialize = (snap: CalendarEventsSnapshot) => {
    const clean = sanitizeCalendarEventsSnapshot(snap);
    return JSON.stringify({
      events: clean.events,
      deleted: [...clean.deletedEventIds].sort(),
    });
  };
  return serialize(a) === serialize(b);
}

/**
 * Converts LocalFamilyEvent records into standard `CalendarEvent` objects compatible with
 * Agenda, 3-Day, Weekly, Monthly, and Timeline views (computing RFC 5545 exclusive DTEND for multi-day all-day events).
 */
export function localFamilyEventsToCalendarEvents(
  events: LocalFamilyEvent[],
  profiles: HouseholdProfile[]
): CalendarEvent[] {
  const profileMap = new Map(profiles.filter((p) => !p.deletedAt).map((p) => [p.id, p]));
  const result: CalendarEvent[] = [];

  for (const evt of events) {
    const validProfileIds = (evt.profileIds || []).filter((pid) => profileMap.has(pid));

    if (evt.isAllDay) {
      const exclusiveEnd =
        evt.endDate && evt.endDate > evt.date ? addDaysToDateKey(evt.endDate, 1) : undefined;
      result.push({
        uid: `local-evt-${evt.id}`,
        calendarId: LOCAL_CALENDAR_ID,
        calendarName: LOCAL_CALENDAR_NAME,
        color: evt.color || LOCAL_EVENT_COLORS[0],
        summary: evt.title,
        description: evt.notes,
        location: evt.location,
        start: evt.date,
        ...(exclusiveEnd ? { end: exclusiveEnd } : {}),
        isAllDay: true,
        localEventId: evt.id,
        ...(validProfileIds.length > 0 ? { profileIds: validProfileIds } : {}),
      });
      continue;
    }

    const startIso = combineDateAndTimeToIso(evt.date, evt.startTime || '09:00');
    if (!startIso) continue;
    const endDateKey = evt.endDate && evt.endDate >= evt.date ? evt.endDate : evt.date;
    const candidateEndIso = evt.endTime ? combineDateAndTimeToIso(endDateKey, evt.endTime) : null;
    const endIso =
      candidateEndIso && new Date(candidateEndIso).getTime() > new Date(startIso).getTime()
        ? candidateEndIso
        : undefined;

    result.push({
      uid: `local-evt-${evt.id}`,
      calendarId: LOCAL_CALENDAR_ID,
      calendarName: LOCAL_CALENDAR_NAME,
      color: evt.color || LOCAL_EVENT_COLORS[0],
      summary: evt.title,
      description: evt.notes,
      location: evt.location,
      start: startIso,
      ...(endIso ? { end: endIso } : {}),
      isAllDay: false,
      localEventId: evt.id,
      ...(validProfileIds.length > 0 ? { profileIds: validProfileIds } : {}),
    });
  }

  return result;
}

/**
 * Filters combined calendar events by optional selected source IDs and/or tagged household member ID.
 */
export function filterCalendarEvents(
  events: CalendarEvent[],
  activeCalendarIds: ReadonlySet<string> | null,
  activeProfileId: string | null
): CalendarEvent[] {
  return events.filter((evt) => {
    if (activeCalendarIds !== null && !activeCalendarIds.has(evt.calendarId)) {
      return false;
    }
    if (activeProfileId !== null) {
      if (!evt.profileIds || !evt.profileIds.includes(activeProfileId)) {
        return false;
      }
    }
    return true;
  });
}
