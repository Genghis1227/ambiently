export const MAX_ROUTINES_PER_WIDGET = 12;
export const MAX_ROUTINE_COMPLETIONS = 14;
export const MAX_EMERGENCY_CONTACTS = 6;
export const MAX_DECISION_OPTIONS = 16;
export const ROUTINES_CLOUD_ROW_ID = '__ambiently_routines_store__';

export type RoutineCadenceType =
  | 'daily'
  | 'am_pm'
  | 'weekly'
  | 'alternating_week'
  | 'every_n_days';
export type RoutinePeriodSlot = 'DAY' | 'AM' | 'PM';

export interface RoutineCompletionStamp {
  slotKey: string; // e.g. "2026-11-15", "2026-11-15:AM", "2026-11-15:PM", or pickup date key
  completedAt: string; // ISO timestamp
  profileId?: string | null; // HouseholdProfile.id or null for generic check
}

export interface RoutineItem {
  id: string;
  label: string;
  emoji?: string; // e.g. '🐕', '💊', '♻️', '🪴'
  cadence: RoutineCadenceType;
  // For 'weekly' (sorted unique weekday indices 0=Sun .. 6=Sat, minimum 1 day)
  daysOfWeek?: number[];
  // For 'every_n_days'
  intervalDays?: number; // 1..365 (default 7)
  // For 'alternating_week'
  pickupDayOfWeek?: number; // 0 (Sun) .. 6 (Sat), default 4 (Thu)
  anchorDate?: string; // 'YYYY-MM-DD' representing Week A
  weekALabel?: string; // e.g. 'Trash + Recycling'
  weekBLabel?: string; // e.g. 'Trash Only'
  // Bounded completion log (most recent 14 entries retained)
  completions?: RoutineCompletionStamp[];
  // Check-ins someone took back (most recent 14 retained), so another device's copy of the
  // same check-in doesn't bring it back when the two devices sync
  uncheckedSlots?: RoutineUncheckMark[];
  updatedAt?: string;
}

export interface RoutineUncheckMark {
  slotKey: string;
  uncheckedAt: string; // ISO timestamp
}

export interface RoutinesSnapshot {
  id: 'household_routines';
  items: RoutineItem[];
  deletedRoutineIds?: string[];
  updated_at: string;
}

export interface RoutinesWidgetConfig {
  items?: RoutineItem[];
  defaultProfileId?: string | null;
  compactMode?: boolean;
  transparentBg?: boolean;
}

export type WifiSecurityType = 'WPA' | 'WEP' | 'nopass';
export type WifiCardDisplayView = 'wifi' | 'sitter' | 'split';

export interface WifiLocalVaultCredentials {
  ssid: string;
  password: string;
  security: WifiSecurityType;
  hiddenNetwork: boolean;
}

export interface HouseSitterContact {
  id: string;
  roleLabel: string; // e.g. 'Parents', 'Vet', 'Pediatrician', 'Neighbor'
  name: string;
  phone: string;
}

export interface WifiQrWidgetConfig {
  activeView?: WifiCardDisplayView;
  homeAddress?: string;
  emergencyContacts?: HouseSitterContact[];
  sitterNotes?: string;
  autoHidePasswordSec?: number; // default 30
  transparentBg?: boolean;
}

export type DecisionMakerMode = 'wheel' | 'poll';

export interface DecisionOption {
  id: string;
  label: string;
  color?: string;
  emoji?: string;
  sourceType?: 'custom' | 'recipe' | 'profile';
  sourceId?: string;
}

export interface DecisionMakerWidgetConfig {
  mode?: DecisionMakerMode;
  prompt?: string;
  options?: DecisionOption[];
  // Map of profileId (or 'guest:<id>') -> optionId[]
  votes?: Record<string, string[]>;
  allowMultiVote?: boolean;
  removeWinnerOnSpin?: boolean;
  eliminatedOptionIds?: string[];
  lastWinnerOptionId?: string | null;
  lastSpunAt?: string | null;
  transparentBg?: boolean;
}
