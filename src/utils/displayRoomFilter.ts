import { useEffect, useState } from 'react';
import type { DashboardTab } from '../types/dashboard';

export const DISPLAY_ROOM_PREFS_STORAGE_KEY = 'ambiently_display_room_prefs_v1';
export const DISPLAY_ROOM_PREFS_UPDATED_EVENT = 'ambiently_display_room_prefs_changed';

export interface DisplayRoomPreferences {
  roomName: string;
  localHomeTabId: string | null;
  hiddenTabIds: string[];
  followCanvasSchedule: boolean;
}

export const DEFAULT_DISPLAY_ROOM_PREFS: DisplayRoomPreferences = {
  roomName: '',
  localHomeTabId: null,
  hiddenTabIds: [],
  followCanvasSchedule: true,
};

const memoryPrefsByBoard = new Map<string, DisplayRoomPreferences>();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function resolveDisplayRoomBoardKey(boardKey?: string | null): string {
  const cleanExplicit = typeof boardKey === 'string' ? boardKey.trim() : '';
  if (cleanExplicit) return cleanExplicit;
  if (hasLocalStorage()) {
    try {
      const stored = (localStorage.getItem('ambiently_local_board') || '').trim();
      if (stored) return stored;
    } catch {
      // Ignore storage access failures in restricted environments
    }
  }
  return '__local__';
}

function normalizeDisplayRoomPreferences(raw: unknown): DisplayRoomPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_DISPLAY_ROOM_PREFS, hiddenTabIds: [] };
  }
  const candidate = raw as Partial<DisplayRoomPreferences>;
  const hiddenSet = new Set<string>();
  if (Array.isArray(candidate.hiddenTabIds)) {
    for (const id of candidate.hiddenTabIds) {
      if (typeof id === 'string' && id.trim()) {
        hiddenSet.add(id.trim());
      }
    }
  }
  const localHomeTabId =
    typeof candidate.localHomeTabId === 'string' && candidate.localHomeTabId.trim()
      ? candidate.localHomeTabId.trim()
      : null;

  return {
    roomName: typeof candidate.roomName === 'string' ? candidate.roomName.slice(0, 60) : '',
    localHomeTabId,
    hiddenTabIds: [...hiddenSet],
    followCanvasSchedule: candidate.followCanvasSchedule !== false,
  };
}

function readAllStoredRoomPrefs(): Record<string, DisplayRoomPreferences> {
  if (!hasLocalStorage()) {
    const obj: Record<string, DisplayRoomPreferences> = {};
    for (const [k, v] of memoryPrefsByBoard.entries()) {
      obj[k] = v;
    }
    return obj;
  }
  try {
    const raw = localStorage.getItem(DISPLAY_ROOM_PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, DisplayRoomPreferences> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      out[k] = normalizeDisplayRoomPreferences(v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAllStoredRoomPrefs(map: Record<string, DisplayRoomPreferences>): void {
  if (!hasLocalStorage()) {
    memoryPrefsByBoard.clear();
    for (const [k, v] of Object.entries(map)) {
      memoryPrefsByBoard.set(k, v);
    }
    return;
  }
  try {
    localStorage.setItem(DISPLAY_ROOM_PREFS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors on restricted kiosk storage
  }
}

function notifyDisplayRoomPrefsChanged(boardKey: string): void {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DISPLAY_ROOM_PREFS_UPDATED_EVENT, { detail: { boardKey } })
    );
  }
}

export function readDisplayRoomPreferences(boardKey?: string | null): DisplayRoomPreferences {
  const key = resolveDisplayRoomBoardKey(boardKey);
  const all = readAllStoredRoomPrefs();
  if (Object.hasOwn(all, key)) {
    return normalizeDisplayRoomPreferences(all[key]);
  }
  if (key !== '__local__' && Object.hasOwn(all, '__local__')) {
    return normalizeDisplayRoomPreferences(all.__local__);
  }
  return { ...DEFAULT_DISPLAY_ROOM_PREFS, hiddenTabIds: [] };
}

export function writeDisplayRoomPreferences(
  patch: Partial<DisplayRoomPreferences>,
  boardKey?: string | null
): DisplayRoomPreferences {
  const key = resolveDisplayRoomBoardKey(boardKey);
  const current = readDisplayRoomPreferences(key);
  const next = normalizeDisplayRoomPreferences({
    ...current,
    ...patch,
  });
  const all = readAllStoredRoomPrefs();
  all[key] = next;
  writeAllStoredRoomPrefs(all);
  notifyDisplayRoomPrefsChanged(key);
  return next;
}

export function resetDisplayRoomPreferences(boardKey?: string | null): void {
  const key = resolveDisplayRoomBoardKey(boardKey);
  const all = readAllStoredRoomPrefs();
  delete all[key];
  if (key !== '__local__') {
    delete all.__local__;
  }
  writeAllStoredRoomPrefs(all);
  notifyDisplayRoomPrefsChanged(key);
}

export function clearAllDisplayRoomPreferencesForTests(): void {
  memoryPrefsByBoard.clear();
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(DISPLAY_ROOM_PREFS_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

export function hasCustomDisplayRoomPreferences(prefs: DisplayRoomPreferences): boolean {
  return (
    prefs.roomName.trim().length > 0 ||
    prefs.localHomeTabId !== null ||
    prefs.hiddenTabIds.length > 0 ||
    prefs.followCanvasSchedule === false
  );
}

export function useDisplayRoomPreferences(boardKey?: string | null): DisplayRoomPreferences {
  const resolvedKey = resolveDisplayRoomBoardKey(boardKey);
  const [state, setState] = useState<{ key: string; prefs: DisplayRoomPreferences }>(() => ({
    key: resolvedKey,
    prefs: readDisplayRoomPreferences(resolvedKey),
  }));

  useEffect(() => {
    const onChange = () => {
      setState({ key: resolvedKey, prefs: readDisplayRoomPreferences(resolvedKey) });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(DISPLAY_ROOM_PREFS_UPDATED_EVENT, onChange);
      window.addEventListener('storage', onChange);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(DISPLAY_ROOM_PREFS_UPDATED_EVENT, onChange);
        window.removeEventListener('storage', onChange);
      }
    };
  }, [resolvedKey]);

  return state.key === resolvedKey ? state.prefs : readDisplayRoomPreferences(resolvedKey);
}

/**
 * Returns non-deleted canvases visible on this specific room display.
 * Always keeps at least one canvas visible whenever the household has at least one enabled tab.
 */
export function resolveDisplayVisibleTabs(
  tabs: DashboardTab[],
  prefs: DisplayRoomPreferences
): DashboardTab[] {
  const householdEnabled = tabs.filter(
    (t) => !t.deleted_at && (t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false)
  );
  if (householdEnabled.length === 0) return [];

  const hiddenSet = new Set(prefs.hiddenTabIds);
  const filtered = householdEnabled.filter((t) => !hiddenSet.has(t.id));
  if (filtered.length > 0) {
    return filtered;
  }

  // Safety invariant: never leave a display with 0 canvases if household has enabled boards
  const fallback =
    (prefs.localHomeTabId
      ? householdEnabled.find((t) => t.id === prefs.localHomeTabId)
      : undefined) ||
    householdEnabled.find((t) => t.isHome) ||
    householdEnabled[0];
  return fallback ? [fallback] : [];
}

/**
 * Resolves this screen's default Home canvas: device-local override first, then household isHome,
 * then first visible canvas.
 */
export function resolveDisplayHomeTab(
  visibleTabs: DashboardTab[],
  allTabs: DashboardTab[],
  prefs: DisplayRoomPreferences
): DashboardTab | undefined {
  if (prefs.localHomeTabId) {
    const localMatch = visibleTabs.find((t) => t.id === prefs.localHomeTabId);
    if (localMatch) return localMatch;
  }
  return (
    visibleTabs.find((t) => t.isHome) ||
    visibleTabs[0] ||
    allTabs.find((t) => !t.deleted_at) ||
    allTabs[0]
  );
}
