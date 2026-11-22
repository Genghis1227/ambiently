export const LOCAL_CALENDAR_ID = '__ambiently_family_events__';
export const LOCAL_CALENDAR_NAME = 'Family Events';
export const CALENDAR_EVENTS_CLOUD_ROW_ID = '__ambiently_calendar_events__';
export const MAX_LOCAL_CALENDAR_EVENTS = 250;
export const MAX_DELETED_CALENDAR_EVENT_TOMBSTONES = 250;

export const LOCAL_EVENT_COLORS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Rose
  '#06b6d4', // Cyan
] as const;

export interface LocalFamilyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (inclusive)
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  isAllDay: boolean;
  color: string;
  profileIds?: string[];
  location?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventsSnapshot {
  id: 'household_calendar_events';
  events: LocalFamilyEvent[];
  deletedEventIds: string[];
  updated_at: string;
}
