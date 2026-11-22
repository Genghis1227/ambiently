import type { SupabaseClient, User, RealtimeChannel } from '@supabase/supabase-js';
import { db, DEFAULT_SETTINGS, DEFAULT_TABS, DEFAULT_WIDGETS, DEFAULT_NOTES, DEFAULT_CHORE_SNAPSHOT, DEFAULT_HOUSEHOLD_PROFILES, DEFAULT_MEAL_SNAPSHOT, DEFAULT_KANBAN_BOARDS, DEFAULT_KANBAN_SNAPSHOT, DEFAULT_ROUTINES_SNAPSHOT, DEFAULT_CALENDAR_EVENTS_SNAPSHOT } from './db';
import { clearFeedMemoryCaches } from './feeds';
import { stripPlexTokens } from './plexLinks';
import { isBoardFullError, setSyncRefusal } from './syncRefusal';
import {
  buildNoteCloudFreeformPos,
  hydrateNoteFromCloudRow,
  isPermanentlyPurgedWidget,
  keepLocalNoteFields,
  keepLocalTabFields,
  keepLocalWidgetFields,
  mergeCloudSettingsForLocal,
  resolveEffectiveSyncScopes,
  shouldAcceptCloudRow,
  shouldAcceptCloudSettings,
  shouldPushLocalRowToCloud,
  type DirtySyncScopes,
} from './syncMerge';
export { resolveEffectiveSyncScopes, type DirtySyncScopes };
import { resolveCuratedPhotos } from '../data/curatedScenery';
import {
  isSameCommonPhotoSource,
  isSameWidgetPhotoSource,
  sanitizeRestoredPhotoWidget,
} from '../utils/photoSourceIsolation';
import {
  sanitizeWidgetConfigForCloud,
  stripHomelabCredentialsFromConfig,
  stripWifiCredentialsFromConfig,
} from '../utils/mediaOptimization';
import { getWifiVaultKey } from '../utils/wifiQr';
import { getHomelabVaultKey } from '../utils/homelabVault';
import type { DashboardTab, DashboardWidget, StickyNoteItem, AppSettings } from '../types/dashboard';
import type { ChoreEngineSnapshot } from '../types/chores';
import type { HouseholdProfile } from '../types/profiles';
import type { MealPlannerSnapshot } from '../types/meals';
import type { KanbanBoard, KanbanCard, KanbanChecklistItem, KanbanColumnId, KanbanEngineSnapshot } from '../types/kanban';
import { ROUTINES_CLOUD_ROW_ID, type RoutinesSnapshot } from '../types/phase2Widgets';
import {
  CALENDAR_EVENTS_CLOUD_ROW_ID,
  type CalendarEventsSnapshot,
} from '../types/calendarEvents';
import { useChoreStore } from '../store/choreStore';
import { useProfileStore } from '../stores/useProfileStore';
import { useMealStore } from '../stores/useMealStore';
import { useKanbanStore, type KanbanRowSyncEvent } from '../stores/useKanbanStore';
import { useRoutinesStore } from '../stores/useRoutinesStore';
import { useCalendarEventsStore } from '../stores/useCalendarEventsStore';

const CHORE_ENGINE_CLOUD_ROW_ID = '__ambiently_chore_engine__';
const HOUSEHOLD_PROFILES_CLOUD_ROW_ID = '__ambiently_household_profiles__';
const MEAL_PLANNER_CLOUD_ROW_ID = '__ambiently_meal_planner__';
export const KANBAN_ENGINE_CLOUD_ROW_ID = '__ambiently_kanban_engine__';

function normalizeColumnId(col: unknown): KanbanColumnId {
  return col === 'in_progress' || col === 'done' ? col : 'todo';
}

function mapDbKanbanBoardRow(raw: any): KanbanBoard {
  return {
    id: raw.id,
    name: raw.name || 'Untitled Board',
    autoArchiveDays:
      typeof raw.auto_archive_days === 'number' && raw.auto_archive_days > 0
        ? raw.auto_archive_days
        : null,
    sortOrder: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 0,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
  };
}

function mapDbKanbanCardRow(raw: any): KanbanCard {
  const checklist: KanbanChecklistItem[] = Array.isArray(raw.checklist)
    ? raw.checklist
        .filter((item: any) => item && typeof item.id === 'string')
        .map((item: any) => ({
          id: item.id,
          text: String(item.text ?? ''),
          checked: Boolean(item.checked),
        }))
    : [];
  return {
    id: raw.id,
    boardId: raw.board_id,
    columnId: normalizeColumnId(raw.column_id),
    title: raw.title || '',
    tagColor: raw.tag_color || undefined,
    tagLabel: raw.tag_label || undefined,
    assigneeIds: Array.isArray(raw.assignee_ids) ? raw.assignee_ids : [],
    checklist,
    sortOrder: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : 0,
    isArchived: Boolean(raw.is_archived),
    completedAt: raw.completed_at || undefined,
    archivedAt: raw.archived_at || undefined,
    createdAt: raw.created_at || new Date().toISOString(),
    updatedAt: raw.updated_at || new Date().toISOString(),
  };
}

function toDbKanbanBoardRow(board: KanbanBoard, dashboardId: string, ownerId: string) {
  return {
    id: board.id,
    dashboard_id: dashboardId,
    user_id: ownerId,
    name: board.name,
    auto_archive_days: board.autoArchiveDays,
    sort_order: board.sortOrder,
    created_at: board.createdAt,
    updated_at: board.updatedAt,
  };
}

function toDbKanbanCardRow(card: KanbanCard, dashboardId: string, ownerId: string) {
  return {
    id: card.id,
    dashboard_id: dashboardId,
    user_id: ownerId,
    board_id: card.boardId,
    column_id: card.columnId,
    title: card.title,
    tag_color: card.tagColor || null,
    tag_label: card.tagLabel || null,
    assignee_ids: card.assigneeIds || [],
    checklist: card.checklist || [],
    sort_order: card.sortOrder,
    is_archived: Boolean(card.isArchived),
    completed_at: card.completedAt || null,
    archived_at: card.archivedAt || null,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  };
}

let supabaseClient: SupabaseClient | null = null;
let supabaseClientPromise: Promise<SupabaseClient | null> | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let realtimeConnectionActive = false;
let cachedDashboardTarget: {
  userId: string;
  result: { dashboardId: string; ownerId: string; isMember: boolean };
  expiresAt: number;
} | null = null;
// The board's updated_at as the cloud last returned it, compared as text to skip downloading an
// unchanged board
let lastKnownCloudUpdatedAt: string | null = null;
const TOMBSTONE_PURGE_INTERVAL_MS = 30 * 60 * 1000;
const lastTombstonePurgeAtByBoard = new Map<string, number>();

// The board this device's tabs, widgets and notes belong to. When the signed-in account moves to
// another board (accepting an invitation, leaving or being removed from one, or a different account
// signing in after "keep this board" sign-out), this device's copy is replaced by that board's rather
// than merged into it, so nothing from one board is ever uploaded to another.
const LOCAL_BOARD_KEY = 'ambiently_local_board';

function getLocalBoard(): string | null {
  try {
    return localStorage.getItem(LOCAL_BOARD_KEY);
  } catch {
    return null;
  }
}

function setLocalBoard(boardId: string): void {
  try {
    localStorage.setItem(LOCAL_BOARD_KEY, boardId);
  } catch {
    // Without storage the board can't be remembered; the next sync checks again
  }
}

// When the board's settings were last saved, as this device last saw them in the cloud. Settings are
// compared by their own time, not the board's updated_at, which also moves whenever any device saves
// a note, widget or tab.
const CLOUD_SETTINGS_AT_KEY = 'ambiently_cloud_settings_at';

function getKnownCloudSettingsAt(boardId: string): number | null {
  try {
    const [board, at] = (localStorage.getItem(CLOUD_SETTINGS_AT_KEY) || '').split('|');
    const time = Date.parse(at || '');
    return board === boardId && !Number.isNaN(time) ? time : null;
  } catch {
    return null;
  }
}

function setKnownCloudSettingsAt(boardId: string, at: string): void {
  try {
    localStorage.setItem(CLOUD_SETTINGS_AT_KEY, `${boardId}|${at}`);
  } catch {
    // Without storage the next sync reads the cloud's settings time again
  }
}

// Settings that belong to this screen, not to a board: the PIN, the kiosk locks and the display size.
// They stay when the device moves to another board.
function deviceOwnSettings(settings?: AppSettings): Partial<AppSettings> {
  if (!settings) return {};
  return {
    pinLockEnabled: settings.pinLockEnabled,
    pinHash: settings.pinHash,
    lockFullscreenKiosk: settings.lockFullscreenKiosk,
    lockCanvasEditing: settings.lockCanvasEditing,
    lockSettingsAccess: settings.lockSettingsAccess,
    settingsPinOptOut: settings.settingsPinOptOut,
    displayDensity: settings.displayDensity,
  };
}

// Removes the previous board's tabs, widgets, notes, settings, chores, profiles, meals, kanban,
// photo catalog, board-scoped device vault credentials, and private feed caches from this device
async function clearLocalBoard(): Promise<void> {
  const current = await db.settings.get('global');
  await db.transaction(
    'rw',
    [db.tabs, db.widgets, db.notes, db.settings, db.vault, db.chores, db.profiles, db.meals, db.kanbanBoards, db.kanbanCards, db.kanban, db.routines, db.calendarEvents],
    async () => {
      const vaultKeys = (await db.vault.toCollection().primaryKeys()) as string[];
      const boardScopedVaultKeys = vaultKeys.filter(
        (k) =>
          k.startsWith('wifi-cred:') ||
          k.startsWith('homelab-cred:') ||
          k.startsWith('local-media:')
      );
      await Promise.all([
        db.tabs.clear(),
        db.widgets.clear(),
        db.notes.clear(),
        db.chores.clear(),
        db.profiles.clear(),
        db.meals.clear(),
        db.kanbanBoards.clear(),
        db.kanbanCards.clear(),
        db.kanban.clear(),
        db.routines.clear(),
        db.calendarEvents.clear(),
        ...(boardScopedVaultKeys.length > 0 ? [db.vault.bulkDelete(boardScopedVaultKeys)] : []),
      ]);
      await db.settings.put({ ...DEFAULT_SETTINGS, ...deviceOwnSettings(current) });
      await db.chores.put(DEFAULT_CHORE_SNAPSHOT);
      await db.profiles.bulkPut(DEFAULT_HOUSEHOLD_PROFILES);
      await db.meals.put(DEFAULT_MEAL_SNAPSHOT);
      await db.kanbanBoards.bulkPut(DEFAULT_KANBAN_BOARDS);
      await db.kanban.put(DEFAULT_KANBAN_SNAPSHOT);
      await db.routines.put(DEFAULT_ROUTINES_SNAPSHOT);
      await db.calendarEvents.put(DEFAULT_CALENDAR_EVENTS_SNAPSHOT);
    }
  );

  useProfileStore.getState().resetForBoardSwitch();
  useChoreStore.getState().resetForBoardSwitch();
  useMealStore.getState().resetForBoardSwitch();
  useKanbanStore.getState().resetForBoardSwitch();
  useRoutinesStore.getState().resetForBoardSwitch();
  useCalendarEventsStore.getState().resetForBoardSwitch();
  clearFeedMemoryCaches();

  if (typeof localStorage !== 'undefined') {
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('ambiently_cal_url_') ||
            key.startsWith('ambiently_cal_cache_') ||
            key.startsWith('ambiently_cal_ok_') ||
            key.startsWith('ambiently_homelab_status_v1_') ||
            key.startsWith('ambiently_rss_cache_'))
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }
}

export function isRealtimeConnected(): boolean {
  return realtimeConnectionActive;
}

export function invalidateDashboardIdCache(): void {
  cachedDashboardTarget = null;
}

const RUNTIME_CONFIG_CACHE_KEY = 'ambiently_runtime_supabase_cfg';

function resolveSupabaseCredentials(): { url?: string; anonKey?: string } {
  const runtimeCfg =
    typeof window !== 'undefined'
      ? (window as unknown as { __AMBIENTLY_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string } })
          .__AMBIENTLY_CONFIG__
      : undefined;

  if (runtimeCfg?.supabaseUrl && runtimeCfg?.supabaseAnonKey) {
    try {
      localStorage.setItem(
        RUNTIME_CONFIG_CACHE_KEY,
        JSON.stringify({ supabaseUrl: runtimeCfg.supabaseUrl, supabaseAnonKey: runtimeCfg.supabaseAnonKey })
      );
    } catch {
      // Ignore storage quota / sandbox restrictions
    }
    return { url: runtimeCfg.supabaseUrl, anonKey: runtimeCfg.supabaseAnonKey };
  }

  if (import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY) {
    return { url: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY };
  }

  // Offline PWA fallback for self-hosted Docker instances configured via runtime env vars
  try {
    const cached = localStorage.getItem(RUNTIME_CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { supabaseUrl?: string; supabaseAnonKey?: string };
      if (parsed.supabaseUrl && parsed.supabaseAnonKey) {
        return { url: parsed.supabaseUrl, anonKey: parsed.supabaseAnonKey };
      }
    }
  } catch {
    // Ignore parse errors
  }

  return {};
}

export function hasSupabaseCredentials(): boolean {
  if (supabaseClient) return true;
  const { url, anonKey } = resolveSupabaseCredentials();
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  return supabaseClient;
}

export async function getSupabaseAsync(): Promise<SupabaseClient | null> {
  if (supabaseClient) return supabaseClient;

  const { url, anonKey } = resolveSupabaseCredentials();
  if (!url || !anonKey) return null;

  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => {
        supabaseClient = createClient(url, anonKey);
        return supabaseClient;
      })
      .catch((err) => {
        supabaseClientPromise = null;
        console.warn('Failed to load Supabase client:', err);
        return null;
      });
  }
  return supabaseClientPromise;
}

export async function getCachedSessionUser(): Promise<User | null> {
  if (!hasSupabaseCredentials()) return null;
  const sb = await getSupabaseAsync();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!hasSupabaseCredentials()) return null;
  const sb = await getSupabaseAsync();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
}

export function onAuthStateChange(callback: (user: User | null, event: string) => void): () => void {
  if (!hasSupabaseCredentials()) return () => {};

  let disposed = false;
  let unsub: (() => void) | null = null;

  void getSupabaseAsync().then((sb) => {
    if (!sb || disposed) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }
      callback(session?.user ?? null, event);
    });
    if (disposed) {
      subscription.unsubscribe();
    } else {
      unsub = () => subscription.unsubscribe();
    }
  });

  return () => {
    disposed = true;
    unsub?.();
  };
}

export async function sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const sb = await getSupabaseAsync();
  if (!sb) return { success: false, error: 'Supabase credentials not configured in environment.' };

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    const msgLower = error.message?.toLowerCase() || '';
    if (msgLower.includes('error sending') || msgLower.includes('confirmation email') || msgLower.includes('magic link email')) {
      return {
        success: false,
        error: `Supabase mailer error (${error.message}). Check Supabase Dashboard > Logs > Auth Logs (usually caused by custom SMTP credentials, unverified domain, or email template syntax).`,
      };
    }
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function verifyOtpCode(email: string, token: string): Promise<{ success: boolean; error?: string }> {
  const sb = await getSupabaseAsync();
  if (!sb) return { success: false, error: 'Supabase credentials not configured in environment.' };

  const { error } = await sb.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Emails a sign-in code to the account this screen is signed in to, to remove a forgotten kiosk PIN
// (see PinOverlay). It never creates an account.
export async function sendPinResetCode(email: string): Promise<{ success: boolean; error?: string }> {
  const sb = await getSupabaseAsync();
  if (!sb) return { success: false, error: 'Cloud sync is not set up on this screen.' };
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function signOutSupabase(): Promise<void> {
  if (!hasSupabaseCredentials()) return;
  const sb = await getSupabaseAsync();
  if (sb) {
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeConnectionActive = false;
    cachedDashboardTarget = null;
    lastKnownCloudUpdatedAt = null;
    setSyncRefusal(null);
    await sb.auth.signOut();
  }
}

export interface RealtimeBoardHandlers {
  onRemoteNoteChange?: (note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onRemoteWidgetChange?: (widget: DashboardWidget, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onRemoteTabChange?: (tab: DashboardTab, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
}

function attachRealtimeChannel(
  sb: SupabaseClient,
  boardId: string,
  handlers:
    | RealtimeBoardHandlers
    | ((note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void)
): () => void {
  const noteHandler = typeof handlers === 'function' ? handlers : handlers.onRemoteNoteChange;
  const widgetHandler = typeof handlers === 'object' ? handlers.onRemoteWidgetChange : undefined;
  const tabHandler = typeof handlers === 'object' ? handlers.onRemoteTabChange : undefined;

  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = sb
    .channel(`dashboard-realtime-${boardId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        if (!noteHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (eventType === 'DELETE' ? payload.old || payload.new : payload.new || payload.old) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        noteHandler(hydrateNoteFromCloudRow(raw), eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'widgets',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        if (!widgetHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (eventType === 'DELETE' ? payload.old || payload.new : payload.new || payload.old) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        const widget: DashboardWidget = {
          id: raw.id,
          tabId: raw.tab_id,
          type: raw.type,
          title: raw.title,
          gridPos: raw.grid_pos || { x: 0, y: 0, w: 4, h: 4 },
          freeformPos: raw.freeform_pos || {},
          config:
            raw.type === 'wifi_qr'
              ? stripWifiCredentialsFromConfig(raw.config || {})
              : raw.type === 'homelab'
                ? stripHomelabCredentialsFromConfig(raw.config || {})
                : (raw.config || {}),
          updated_at: raw.updated_at || new Date().toISOString(),
          deleted_at: raw.deleted_at,
        };

        widgetHandler(widget, eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tabs',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        if (!tabHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (eventType === 'DELETE' ? payload.old || payload.new : payload.new || payload.old) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        const tab: DashboardTab = {
          id: raw.id,
          name: raw.name,
          icon: raw.icon,
          order: Number.isFinite(raw.order_index) ? raw.order_index : 0,
          layoutMode: raw.layout_mode,
          autoRotateDurationSec: raw.auto_rotate_duration_sec,
          backgroundTheme: raw.background_theme,
          customWallpaperUrl: raw.custom_wallpaper_url,
          backgroundDimLevel: raw.background_dim_level,
          updated_at: raw.updated_at || new Date().toISOString(),
          deleted_at: raw.deleted_at,
        };

        tabHandler(tab, eventType);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'household_profiles',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const newRow = payload.new as Record<string, any> | null | undefined;
        const raw = (
          eventType === 'DELETE'
            ? payload.old
            : newRow && Object.keys(newRow).length > 0
              ? newRow
              : payload.old
        ) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        const mappedProfile: HouseholdProfile = {
          id: raw.id,
          name: raw.name || 'Family Member',
          role: raw.role === 'parent' ? 'parent' : 'kid',
          color: raw.color || '#6b8f71',
          avatarDataUrl: raw.avatar_data_url || undefined,
          emoji: raw.emoji || undefined,
          createdAt: raw.created_at || new Date().toISOString(),
          updatedAt: raw.updated_at || new Date().toISOString(),
          deletedAt: raw.deleted_at || null,
        };

        useProfileStore
          .getState()
          .applyRemoteProfileRow(mappedProfile, eventType)
          .catch(() => {});
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'kanban_boards',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (eventType === 'DELETE' ? payload.old : payload.new || payload.old) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        useKanbanStore
          .getState()
          .applyRemoteBoardRow(mapDbKanbanBoardRow(raw), eventType)
          .catch(() => {});
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'kanban_cards',
        filter: `dashboard_id=eq.${boardId}`,
      },
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (eventType === 'DELETE' ? payload.old : payload.new || payload.old) as any;
        if (!raw || !raw.id) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        useKanbanStore
          .getState()
          .applyRemoteCardRow(mapDbKanbanCardRow(raw), eventType)
          .catch(() => {});
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeConnectionActive = true;
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        realtimeConnectionActive = false;
      }
    });

  return () => {
    realtimeConnectionActive = false;
    if (realtimeChannel && sb) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

// Subscribe to Realtime WebSocket updates ONLY when authenticated to a specific boardId
export function subscribeToRealtimeBoard(
  boardId: string | null | undefined,
  handlers:
    | RealtimeBoardHandlers
    | ((note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void)
): () => void {
  if (!hasSupabaseCredentials() || !boardId || boardId === 'default') {
    realtimeConnectionActive = false;
    if (realtimeChannel && supabaseClient) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    return () => {};
  }

  if (supabaseClient) {
    return attachRealtimeChannel(supabaseClient, boardId, handlers);
  }

  let disposed = false;
  let detach: (() => void) | null = null;

  void getSupabaseAsync().then((sb) => {
    if (!sb || disposed) return;
    detach = attachRealtimeChannel(sb, boardId, handlers);
  });

  return () => {
    disposed = true;
    detach?.();
  };
}

export interface HouseholdMember {
  id: string;
  dashboard_id: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  accepted_at: string | null;
  created_at: string;
}

export interface BoardInvitation {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  accepted_at: string | null;
  board_title: string;
  owner_email: string;
}

// Fetch authorized household members for the current owner's dashboard
export async function getHouseholdMembers(): Promise<HouseholdMember[]> {
  const sb = await getSupabaseAsync();
  const user = await getCurrentUser();
  if (!sb || !user) return [];

  try {
    const { data, error } = await sb
      .from('dashboard_members')
      .select('id, dashboard_id, email, role, accepted_at, created_at')
      .eq('dashboard_id', user.id)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as HouseholdMember[];
  } catch {
    return [];
  }
}

// Authorize an email address (e.g. spouse/partner) to collaborate on this dashboard when they sign in via Email OTP
export async function addHouseholdMember(
  email: string,
  role: 'editor' | 'viewer' = 'editor'
): Promise<{ success: boolean; member?: HouseholdMember; error?: string }> {
  const sb = await getSupabaseAsync();
  const user = await getCurrentUser();
  if (!sb || !user) return { success: false, error: 'You must be signed in to add household members.' };

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }
  if (cleanEmail === user.email?.toLowerCase()) {
    return { success: false, error: 'You are already the owner of this board.' };
  }

  try {
    // Ensure parent dashboard record exists and clear any legacy invite_code
    await sb.from('dashboards').upsert({
      id: user.id,
      user_id: user.id,
      invite_code: null,
      updated_at: new Date().toISOString(),
    });

    const existing = await sb
      .from('dashboard_members')
      .select('id')
      .eq('dashboard_id', user.id)
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing.data) {
      return { success: false, error: 'This email is already on your household list.' };
    }

    const { data, error } = await sb
      .from('dashboard_members')
      .insert({
        dashboard_id: user.id,
        email: cleanEmail,
        role,
      })
      .select('id, dashboard_id, email, role, accepted_at, created_at')
      .single();

    if (error) return { success: false, error: error.message };
    invalidateDashboardIdCache();
    return { success: true, member: data as HouseholdMember };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add member.' };
  }
}

// Revoke household member access by ID
export async function removeHouseholdMember(memberId: string): Promise<boolean> {
  const sb = await getSupabaseAsync();
  const user = await getCurrentUser();
  if (!sb || !user) return false;

  try {
    const { error } = await sb
      .from('dashboard_members')
      .delete()
      .eq('id', memberId)
      .eq('dashboard_id', user.id);
    if (!error) invalidateDashboardIdCache();
    return !error;
  } catch {
    return false;
  }
}

// Boards that have invited the signed-in user, accepted or not
export async function getMyInvitations(): Promise<BoardInvitation[]> {
  const sb = await getSupabaseAsync();
  if (!sb) return [];

  try {
    const { data, error } = await sb.rpc('get_my_invitations');
    if (error || !data) return [];
    return data as BoardInvitation[];
  } catch {
    return [];
  }
}

export async function acceptInvitation(invitationId: string): Promise<boolean> {
  const sb = await getSupabaseAsync();
  if (!sb) return false;

  try {
    const { error } = await sb
      .from('dashboard_members')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitationId);
    if (!error) invalidateDashboardIdCache();
    return !error;
  } catch {
    return false;
  }
}

// Decline an invitation, or leave a board already joined
export async function leaveBoard(invitationId: string): Promise<boolean> {
  const sb = await getSupabaseAsync();
  if (!sb) return false;

  try {
    const { error } = await sb.from('dashboard_members').delete().eq('id', invitationId);
    if (!error) invalidateDashboardIdCache();
    return !error;
  } catch {
    return false;
  }
}

// Resolve active target dashboard ID for authenticated user (either own board or a board they accepted an invitation to)
export async function resolveActiveDashboardId(): Promise<{ dashboardId: string; ownerId: string; isMember: boolean } | null> {
  const sb = await getSupabaseAsync();
  const user = await getCachedSessionUser();
  if (!sb || !user) return null;

  if (
    cachedDashboardTarget &&
    cachedDashboardTarget.userId === user.id &&
    Date.now() < cachedDashboardTarget.expiresAt
  ) {
    return cachedDashboardTarget.result;
  }

  try {
    // Check if this user accepted an invitation to another owner's board. An invitation they haven't
    // accepted must not move them, or anyone who knew their email could receive their synced data.
    if (user.email) {
      const { data: membership } = await sb
        .from('dashboard_members')
        .select('dashboard_id')
        .eq('email', user.email.toLowerCase())
        .not('accepted_at', 'is', null)
        .limit(1)
        .maybeSingle();

      if (membership?.dashboard_id && membership.dashboard_id !== user.id) {
        const { data: sharedDash } = await sb
          .from('dashboards')
          .select('id, user_id')
          .eq('id', membership.dashboard_id)
          .maybeSingle();

        if (sharedDash) {
          const res = {
            dashboardId: sharedDash.id,
            ownerId: sharedDash.user_id,
            isMember: true,
          };
          cachedDashboardTarget = {
            userId: user.id,
            result: res,
            expiresAt: Date.now() + 180000,
          };
          return res;
        }
      }
    }
  } catch {
    // Fall back to user's own board
  }

  const res = {
    dashboardId: user.id,
    ownerId: user.id,
    isMember: false,
  };
  cachedDashboardTarget = {
    userId: user.id,
    result: res,
    expiresAt: Date.now() + 180000,
  };
  return res;
}

// Clean up any legacy local storage keys from older versions
export function clearLegacyJoinKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('joined_dashboard_id');
  localStorage.removeItem('joined_owner_id');
  localStorage.removeItem('joined_board_title');
  localStorage.removeItem('joined_invite_code');
}

/**
 * Optimistically replicates Kanban row-level writes/deletions directly to Supabase
 * `kanban_boards` and `kanban_cards` for sub-second Postgres Realtime broadcast across screens.
 * Silently no-ops if unauthenticated, offline, switching boards, or before migration is run.
 */
export async function syncKanbanRowEventToCloud(event: KanbanRowSyncEvent): Promise<void> {
  try {
    const sb = await getSupabaseAsync();
    const user = await getCachedSessionUser();
    if (!sb || !user) return;

    const target = await resolveActiveDashboardId();
    const dashboardId = target?.dashboardId || user.id;
    const ownerId = target?.ownerId || user.id;

    const localBoard = getLocalBoard();
    if (localBoard && localBoard !== dashboardId) return;

    if (event.kind === 'upsert_boards') {
      if (event.boards.length === 0) return;
      await sb
        .from('kanban_boards')
        .upsert(event.boards.map((b) => toDbKanbanBoardRow(b, dashboardId, ownerId)));
    } else if (event.kind === 'delete_boards') {
      if (event.boardIds.length === 0) return;
      await sb
        .from('kanban_boards')
        .delete()
        .eq('dashboard_id', dashboardId)
        .in('id', event.boardIds);
    } else if (event.kind === 'upsert_cards') {
      if (event.parentBoards && event.parentBoards.length > 0) {
        await sb
          .from('kanban_boards')
          .upsert(event.parentBoards.map((b) => toDbKanbanBoardRow(b, dashboardId, ownerId)));
      }
      if (event.cards.length > 0) {
        await sb
          .from('kanban_cards')
          .upsert(event.cards.map((c) => toDbKanbanCardRow(c, dashboardId, ownerId)));
      }
    } else if (event.kind === 'delete_cards') {
      if (event.cardIds.length === 0) return;
      await sb
        .from('kanban_cards')
        .delete()
        .eq('dashboard_id', dashboardId)
        .in('id', event.cardIds);
    }
  } catch {
    // Graceful best-effort: full snapshot sync still delivers updates via KANBAN_ENGINE_CLOUD_ROW_ID
  }
}

// Push local Dexie snapshot to Supabase Cloud (Strictly authenticated only)
export async function pushToCloud(
  settings: AppSettings,
  tabs: DashboardTab[],
  widgets: DashboardWidget[],
  notes: StickyNoteItem[],
  options?: { force?: boolean; dirtyScopes?: DirtySyncScopes }
): Promise<{ success: boolean; error?: string }> {
  const sb = await getSupabaseAsync();
  const user = await getCachedSessionUser();
  if (!sb || !user) return { success: false, error: 'Not authenticated' };

  try {
    const target = await resolveActiveDashboardId();
    const dashboardId = target?.dashboardId || user.id;
    const ownerId = target?.ownerId || user.id;
    const isMember = Boolean(target?.isMember);

    // This device still holds another board's copy. The next pull replaces it, and until then nothing
    // is sent, so that board's content can't end up in this one.
    const localBoard = getLocalBoard();
    if (localBoard && localBoard !== dashboardId) {
      return { success: false, error: 'This device is switching boards. Sync again in a moment.' };
    }

    const scopes = resolveEffectiveSyncScopes(options, Boolean(lastKnownCloudUpdatedAt));
    const needsRemoteWidgetsTable = scopes.widgets || scopes.householdStores;

    // 1. Query Dexie only for dirty/needed scopes so incremental auto-pushes stay lightweight
    const [
      dbSettings,
      dbTabs,
      dbWidgets,
      dbNotes,
      dbChoreSnapshot,
      dbProfiles,
      dbMealSnapshot,
      dbKanbanSnapshot,
      dbRoutinesSnapshot,
      dbCalendarEventsSnapshot,
    ] = await Promise.all([
      scopes.settings ? db.settings.get('global') : Promise.resolve(undefined),
      scopes.tabs ? db.tabs.toArray() : Promise.resolve([]),
      scopes.widgets ? db.widgets.toArray() : Promise.resolve([]),
      scopes.notes ? db.notes.toArray() : Promise.resolve([]),
      scopes.householdStores ? db.chores.get('household_chores') : Promise.resolve(undefined),
      scopes.householdStores ? db.profiles.toArray() : Promise.resolve([]),
      scopes.householdStores ? db.meals.get('household_meals') : Promise.resolve(undefined),
      scopes.householdStores ? db.kanban.get('household_kanban') : Promise.resolve(undefined),
      scopes.householdStores ? db.routines.get('household_routines') : Promise.resolve(undefined),
      scopes.householdStores ? db.calendarEvents.get('household_calendar_events') : Promise.resolve(undefined),
    ]);

    const propSettingsTime = Date.parse(settings?.updated_at || '') || 0;
    const dbSettingsTime = Date.parse(dbSettings?.updated_at || '') || 0;
    const activeSettings =
      dbSettings && dbSettingsTime >= propSettingsTime ? dbSettings : settings;

    const tabsToPush = scopes.tabs ? (dbTabs.length > 0 ? dbTabs : tabs) : [];
    const widgetsToPush = scopes.widgets ? (dbWidgets.length > 0 ? dbWidgets : widgets) : [];
    const notesToPush = scopes.notes ? (dbNotes.length > 0 ? dbNotes : notes) : [];

    // 2. Query remote timestamps and soft-delete/archive states only for active sync scopes
    const [remoteDashRes, remoteTabsRes, remoteWidgetsRes, remoteNotesRes] = await Promise.all([
      sb.from('dashboards').select('id, updated_at').eq('id', dashboardId).maybeSingle(),
      scopes.tabs
        ? sb.from('tabs').select('id, updated_at, deleted_at').eq('dashboard_id', dashboardId)
        : Promise.resolve({ data: null }),
      needsRemoteWidgetsTable
        ? sb.from('widgets').select('id, updated_at, deleted_at').eq('dashboard_id', dashboardId)
        : Promise.resolve({ data: null }),
      scopes.notes
        ? sb.from('notes').select('id, updated_at, deleted_at, archived_at').eq('dashboard_id', dashboardId)
        : Promise.resolve({ data: null }),
    ]);

    const toRemoteMetaMap = (rows: any[] | null | undefined, checkArchived = false) =>
      new Map(
        (rows || []).map((row: any) => [
          row.id,
          {
            time: new Date(row.updated_at || 0).getTime(),
            deletedOrArchived: Boolean(row.deleted_at || (checkArchived && row.archived_at)),
          },
        ])
      );

    const remoteTabsMap = toRemoteMetaMap(remoteTabsRes.data);
    const remoteWidgetsMap = toRemoteMetaMap(remoteWidgetsRes.data);
    const remoteNotesMap = toRemoteMetaMap(remoteNotesRes.data, true);

    const nowIso = new Date().toISOString();
    // Settings are sent when they changed on this device since it last synced them, unless another
    // device has saved newer ones since. Only then is the cloud's settings time read, which reads the
    // settings themselves, so most syncs don't.
    const localSettingsTime = Date.parse(activeSettings.updated_at || '') || 0;
    let shouldUpsertDash = false;
    if (!isMember && (scopes.settings || options?.force || !remoteDashRes.data)) {
      const knownCloudSettingsTime = getKnownCloudSettingsAt(dashboardId);
      if (options?.force || !remoteDashRes.data) {
        shouldUpsertDash = true;
      } else if (knownCloudSettingsTime === null || localSettingsTime > knownCloudSettingsTime) {
        const { data: cloudDashRow } = await sb
          .from('dashboards')
          .select('settings')
          .eq('id', dashboardId)
          .maybeSingle();
        const cloudSettingsAt =
          ((cloudDashRow?.settings ?? null) as Partial<AppSettings> | null)?.updated_at || null;
        const cloudSettingsTime = Date.parse(cloudSettingsAt || '') || 0;
        shouldUpsertDash = localSettingsTime > cloudSettingsTime;
        if (!shouldUpsertDash && cloudSettingsAt) setKnownCloudSettingsAt(dashboardId, cloudSettingsAt);
      }
    }

    // Upsert Tabs: only send tabs with genuinely newer timestamps or new records (or all when forced)
    let tabsToUpsert: any[] = [];
    if (scopes.tabs && tabsToPush.length > 0) {
      const formattedTabs = tabsToPush.map((t, idx) => ({
        id: t.id,
        dashboard_id: dashboardId,
        user_id: ownerId,
        name: t.name,
        icon: t.icon,
        layout_mode: t.layoutMode,
        order_index: Number.isFinite(t.order) ? t.order : idx,
        auto_rotate_duration_sec: t.autoRotateDurationSec,
        updated_at: t.updated_at,
        deleted_at: t.deleted_at || null,
      }));

      tabsToUpsert = formattedTabs.filter((t) => {
        const remoteMeta = remoteTabsMap.get(t.id);
        return shouldPushLocalRowToCloud({
          force: options?.force,
          localTime: new Date(t.updated_at || 0).getTime(),
          remoteTime: remoteMeta?.time,
          localDeletedOrArchived: Boolean(t.deleted_at),
          remoteDeletedOrArchived: remoteMeta?.deletedOrArchived,
        });
      });
    }

    // Upsert Widgets: only send widgets with genuinely newer timestamps or new records
    let widgetsToUpsert: any[] = [];
    if (scopes.widgets && widgetsToPush.length > 0) {
      const formattedWidgets = widgetsToPush.map((w) => {
        // Strip customPhotos, oversized inline Data URLs, and Guest Wi-Fi QR credentials from cloud sync payloads
        const configToPush = sanitizeWidgetConfigForCloud(w.config || {}, w.type);
        const isPurged = isPermanentlyPurgedWidget(w);
        return {
          id: w.id,
          dashboard_id: dashboardId,
          tab_id: w.tabId,
          user_id: ownerId,
          type: w.type,
          title: w.title,
          grid_pos: w.gridPos,
          freeform_pos: isPurged
            ? { xRatio: 0, yRatio: 0, wRatio: 0.3, hRatio: 0.3, zIndex: 1, rotation: 0 }
            : w.freeformPos,
          // Keep sanitized widget config for recoverable soft-deleted Trash widgets;
          // permanently purged widgets shrink to { __purged: true }
          config: isPurged ? { __purged: true } : stripPlexTokens(configToPush),
          updated_at: w.updated_at,
          deleted_at: w.deleted_at || null,
        };
      });

      widgetsToUpsert = formattedWidgets.filter((w) => {
        const remoteMeta = remoteWidgetsMap.get(w.id);
        return shouldPushLocalRowToCloud({
          force: options?.force,
          localTime: new Date(w.updated_at || 0).getTime(),
          remoteTime: remoteMeta?.time,
          localDeletedOrArchived: Boolean(w.deleted_at),
          remoteDeletedOrArchived: remoteMeta?.deletedOrArchived,
        });
      });
    }

    // Sync household Chore Engine snapshot via reserved system row in widgets table
    const activeChoreSnapshot = scopes.householdStores
      ? dbChoreSnapshot || useChoreStore.getState().snapshot
      : null;
    if (activeChoreSnapshot && activeChoreSnapshot.id === 'household_chores') {
      const localChoreTime = new Date(activeChoreSnapshot.updated_at || 0).getTime();
      const remoteChoreTime = remoteWidgetsMap.get(CHORE_ENGINE_CLOUD_ROW_ID)?.time;
      const shouldPushChores =
        Boolean(options?.force) ||
        (remoteChoreTime === undefined
          ? localChoreTime > 0
          : localChoreTime > remoteChoreTime);

      if (shouldPushChores) {
        widgetsToUpsert.push({
          id: CHORE_ENGINE_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'chores_engine_store',
          title: 'Household Chore Engine Store',
          grid_pos: {},
          freeform_pos: {},
          config: activeChoreSnapshot,
          updated_at: activeChoreSnapshot.updated_at,
          deleted_at: null,
        });
      }
    }

    // Sync Global Household Profiles & Avatars via reserved system row + household_profiles table
    const profilesToPush = scopes.householdStores
      ? dbProfiles.length > 0
        ? dbProfiles
        : useProfileStore.getState().profiles
      : [];
    if (profilesToPush.length > 0) {
      const latestProfileTime = profilesToPush.reduce(
        (max, p) => Math.max(max, new Date(p.updatedAt || 0).getTime()),
        0
      );
      const remoteProfilesRowTime = remoteWidgetsMap.get(HOUSEHOLD_PROFILES_CLOUD_ROW_ID)?.time;
      const shouldPushProfilesRow =
        Boolean(options?.force) ||
        (remoteProfilesRowTime === undefined
          ? latestProfileTime > 0
          : latestProfileTime > remoteProfilesRowTime);

      if (shouldPushProfilesRow) {
        const latestIso = new Date(latestProfileTime || Date.now()).toISOString();
        widgetsToUpsert.push({
          id: HOUSEHOLD_PROFILES_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'household_profiles_store',
          title: 'Household Profiles Store',
          grid_pos: {},
          freeform_pos: {},
          config: { profiles: profilesToPush, updated_at: latestIso },
          updated_at: latestIso,
          deleted_at: null,
        });
      }
    }

    // Sync Meal Planner & Smart Shopping List snapshot via reserved system row in widgets table
    const activeMealSnapshot = scopes.householdStores
      ? dbMealSnapshot || useMealStore.getState().snapshot
      : null;
    if (activeMealSnapshot && activeMealSnapshot.id === 'household_meals') {
      const localMealTime = new Date(activeMealSnapshot.updated_at || 0).getTime();
      const remoteMealTime = remoteWidgetsMap.get(MEAL_PLANNER_CLOUD_ROW_ID)?.time;
      const shouldPushMeals =
        Boolean(options?.force) ||
        (remoteMealTime === undefined
          ? localMealTime > 0
          : localMealTime > remoteMealTime);

      if (shouldPushMeals) {
        widgetsToUpsert.push({
          id: MEAL_PLANNER_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'meal_planner_store',
          title: 'Household Meal Planner Store',
          grid_pos: {},
          freeform_pos: {},
          config: activeMealSnapshot,
          updated_at: activeMealSnapshot.updated_at,
          deleted_at: null,
        });
      }
    }

    // Sync Multi-Board Kanban Engine snapshot via reserved system row + direct table upserts/deletes
    const activeKanbanSnapshot = scopes.householdStores
      ? dbKanbanSnapshot || useKanbanStore.getState().snapshot
      : null;
    const kanbanSnapshotPushed = (() => {
      if (!activeKanbanSnapshot || activeKanbanSnapshot.id !== 'household_kanban') return false;
      const localKanbanTime = new Date(activeKanbanSnapshot.updated_at || 0).getTime();
      const remoteKanbanTime = remoteWidgetsMap.get(KANBAN_ENGINE_CLOUD_ROW_ID)?.time;
      const shouldPushKanban =
        Boolean(options?.force) ||
        (remoteKanbanTime === undefined
          ? localKanbanTime > 0 || activeKanbanSnapshot.cards.length > 0 || activeKanbanSnapshot.boards.length > 1
          : localKanbanTime > remoteKanbanTime);

      if (shouldPushKanban) {
        widgetsToUpsert.push({
          id: KANBAN_ENGINE_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'kanban_engine_store',
          title: 'Household Kanban Engine Store',
          grid_pos: {},
          freeform_pos: {},
          config: activeKanbanSnapshot,
          updated_at: activeKanbanSnapshot.updated_at,
          deleted_at: null,
        });
      }
      return shouldPushKanban;
    })();

    // Sync Home Check-Ins & Rhythms singleton household snapshot via reserved system row
    const activeRoutinesSnapshot = scopes.householdStores
      ? dbRoutinesSnapshot || useRoutinesStore.getState().snapshot
      : null;
    if (activeRoutinesSnapshot && activeRoutinesSnapshot.id === 'household_routines') {
      const localRoutinesTime = new Date(activeRoutinesSnapshot.updated_at || 0).getTime();
      const remoteRoutinesTime = remoteWidgetsMap.get(ROUTINES_CLOUD_ROW_ID)?.time;
      const shouldPushRoutines =
        Boolean(options?.force) ||
        (remoteRoutinesTime === undefined
          ? localRoutinesTime > 0
          : localRoutinesTime > remoteRoutinesTime);

      if (shouldPushRoutines) {
        widgetsToUpsert.push({
          id: ROUTINES_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'routines_store',
          title: 'Household Routines Store',
          grid_pos: {},
          freeform_pos: {},
          config: activeRoutinesSnapshot,
          updated_at: activeRoutinesSnapshot.updated_at,
          deleted_at: null,
        });
      }
    }

    // Sync Local Family Calendar Events singleton household snapshot via reserved system row
    const activeCalendarEventsSnapshot = scopes.householdStores
      ? dbCalendarEventsSnapshot || useCalendarEventsStore.getState().snapshot
      : null;
    if (
      activeCalendarEventsSnapshot &&
      activeCalendarEventsSnapshot.id === 'household_calendar_events'
    ) {
      const localCalendarEventsTime = new Date(
        activeCalendarEventsSnapshot.updated_at || 0
      ).getTime();
      const remoteCalendarEventsTime = remoteWidgetsMap.get(CALENDAR_EVENTS_CLOUD_ROW_ID)?.time;
      const shouldPushCalendarEvents =
        Boolean(options?.force) ||
        (remoteCalendarEventsTime === undefined
          ? localCalendarEventsTime > 0
          : localCalendarEventsTime > remoteCalendarEventsTime);

      if (shouldPushCalendarEvents) {
        widgetsToUpsert.push({
          id: CALENDAR_EVENTS_CLOUD_ROW_ID,
          dashboard_id: dashboardId,
          tab_id: null,
          user_id: ownerId,
          type: 'calendar_events_store',
          title: 'Household Calendar Events Store',
          grid_pos: {},
          freeform_pos: {},
          config: activeCalendarEventsSnapshot,
          updated_at: activeCalendarEventsSnapshot.updated_at,
          deleted_at: null,
        });
      }
    }

    // Upsert Notes: only send notes with genuinely newer timestamps or new records (or all when forced)
    let notesToUpsert: any[] = [];
    if (scopes.notes && notesToPush.length > 0) {
      const formattedNotes = notesToPush.map((n) => {
        const isShoppingList = Boolean(n.isShoppingList || n.freeformPos?.isShoppingList);
        return {
          id: n.id,
          dashboard_id: dashboardId,
          user_id: ownerId,
          tab_id: n.tabId,
          widget_id: n.widgetId,
          // Like widgets, a deleted note is sent without its text
          title: n.deleted_at ? null : n.title,
          content: n.deleted_at ? '' : n.content,
          is_checklist: Boolean(n.isChecklist || isShoppingList),
          checklist_items: n.deleted_at ? [] : n.checklistItems || [],
          bg_color: n.bgColor,
          font_size: n.fontSize || 'base',
          expires_at: n.expiresAt || null,
          archived_at: n.archivedAt || null,
          freeform_pos: buildNoteCloudFreeformPos(n),
          updated_at: n.updated_at,
          deleted_at: n.deleted_at || null,
        };
      });

      notesToUpsert = formattedNotes.filter((n) => {
        const remoteMeta = remoteNotesMap.get(n.id);
        return shouldPushLocalRowToCloud({
          force: options?.force,
          localTime: new Date(n.updated_at || 0).getTime(),
          remoteTime: remoteMeta?.time,
          localDeletedOrArchived: Boolean(n.deleted_at || n.archived_at),
          remoteDeletedOrArchived: remoteMeta?.deletedOrArchived,
        });
      });
    }

    const hasAnyItemUpserted = tabsToUpsert.length > 0 || widgetsToUpsert.length > 0 || notesToUpsert.length > 0;

    if (!shouldUpsertDash && !hasAnyItemUpserted) {
      // Nothing changed locally compared to remote state! 0 database writes.
      setSyncRefusal(null);
      return { success: true };
    }

    // When the board is full, the database refuses rows that would make it bigger (see "Board Size
    // Limits" in supabase/schema.sql). Those rows are skipped and stay newer here, so they're sent
    // again next time, and everything else still syncs. Any other error stops the push as before.
    const refusedForSpace: { message: string }[] = [];
    const skipIfBoardFull = (error: unknown) => {
      if (!isBoardFullError(error)) throw error;
      refusedForSpace.push(error);
    };
    const upsertRows = async (table: 'tabs' | 'widgets' | 'notes', rows: any[], chunkSize: number) => {
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await sb.from(table).upsert(chunk);
        if (!error) continue;
        if (chunk.length === 1) {
          skipIfBoardFull(error);
          continue;
        }
        // Send this chunk one row at a time, so one large or refused row doesn't hold back the rest
        for (const row of chunk) {
          const { error: rowError } = await sb.from(table).upsert(row);
          if (rowError) skipIfBoardFull(rowError);
        }
      }
    };
    const isDeletion = (row: { deleted_at: string | null }) => Boolean(row.deleted_at);
    const isNotDeletion = (row: { deleted_at: string | null }) => !row.deleted_at;

    if (shouldUpsertDash) {
      const tabThemeMeta = tabs.reduce((acc, t) => {
        acc[t.id] = {
          backgroundTheme: t.backgroundTheme,
          customWallpaperUrl: t.customWallpaperUrl,
          backgroundDimLevel: t.backgroundDimLevel,
          hideNotes: t.hideNotes,
          isHome: t.isHome,
        };
        return acc;
      }, {} as Record<string, any>);

      let settingsToPush = { ...activeSettings };
      // Strip commonPhotos array from cloud sync payload to keep database pure config (< 5 KB)
      if ('commonPhotos' in settingsToPush) {
        const { commonPhotos: _, ...restSettings } = settingsToPush;
        settingsToPush = restSettings;
      }

      const cloudSafeSettings = stripPlexTokens({
        ...settingsToPush,
        pinLockEnabled: false,
        pinHash: null,
        lockCanvasEditing: false,
        lockFullscreenKiosk: false,
        lockSettingsAccess: true,
        settingsPinOptOut: false,
        canvasThemes: tabThemeMeta,
      });

      const { error: dashErr } = await sb.from('dashboards').upsert({
        id: dashboardId,
        user_id: ownerId,
        title: activeSettings.dashboardTitle,
        settings: cloudSafeSettings,
        invite_code: null,
        updated_at: nowIso,
      });
      if (dashErr) skipIfBoardFull(dashErr);
      else setKnownCloudSettingsAt(dashboardId, activeSettings.updated_at);
    }
    // Saving a tab, widget or note moves the board's updated_at in the database (the touch trigger in
    // supabase/schema.sql), for members too, so the app doesn't send a separate update for it

    // Deletions next, so a full board makes room before anything new is sent
    await upsertRows('tabs', tabsToUpsert.filter(isDeletion), 25);
    await upsertRows('widgets', widgetsToUpsert.filter(isDeletion), 25);
    await upsertRows('notes', notesToUpsert.filter(isDeletion), 25);

    // Then everything else
    await upsertRows('tabs', tabsToUpsert.filter(isNotDeletion), 25);
    // Widgets go in small batches to avoid statement timeouts
    await upsertRows('widgets', widgetsToUpsert.filter(isNotDeletion), 5);
    await upsertRows('notes', notesToUpsert.filter(isNotDeletion), 25);

    // Best-effort direct sync to public.household_profiles table when present in Supabase schema
    if (
      profilesToPush.length > 0 &&
      widgetsToUpsert.some((w) => w.id === HOUSEHOLD_PROFILES_CLOUD_ROW_ID)
    ) {
      const profileRows = profilesToPush.map((p) => ({
        id: p.id,
        dashboard_id: dashboardId,
        user_id: ownerId,
        name: p.name,
        role: p.role,
        color: p.color,
        avatar_data_url: p.avatarDataUrl || null,
        emoji: p.emoji || null,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        deleted_at: p.deletedAt || null,
      }));
      Promise.resolve(sb.from('household_profiles').upsert(profileRows)).catch(() => {});
    }

    // Best-effort direct sync to public.kanban_boards & public.kanban_cards when migration is installed
    if (kanbanSnapshotPushed && activeKanbanSnapshot) {
      Promise.resolve((async () => {
        if (activeKanbanSnapshot.boards.length > 0) {
          await sb
            .from('kanban_boards')
            .upsert(activeKanbanSnapshot.boards.map((b) => toDbKanbanBoardRow(b, dashboardId, ownerId)));
        }
        if (activeKanbanSnapshot.cards.length > 0) {
          await sb
            .from('kanban_cards')
            .upsert(activeKanbanSnapshot.cards.map((c) => toDbKanbanCardRow(c, dashboardId, ownerId)));
        }
        if (activeKanbanSnapshot.deletedCardIds && activeKanbanSnapshot.deletedCardIds.length > 0) {
          await sb
            .from('kanban_cards')
            .delete()
            .eq('dashboard_id', dashboardId)
            .in('id', activeKanbanSnapshot.deletedCardIds);
        }
        if (activeKanbanSnapshot.deletedBoardIds && activeKanbanSnapshot.deletedBoardIds.length > 0) {
          await sb
            .from('kanban_boards')
            .delete()
            .eq('dashboard_id', dashboardId)
            .in('id', activeKanbanSnapshot.deletedBoardIds);
        }
      })()).catch(() => {});
    }

    // Throttled purge of expired tombstones (> 30 days old) in cloud database
    const nowEpochMs = Date.now();
    const lastPurgeAt = lastTombstonePurgeAtByBoard.get(dashboardId) ?? 0;
    if (options?.force || nowEpochMs - lastPurgeAt >= TOMBSTONE_PURGE_INTERVAL_MS) {
      lastTombstonePurgeAtByBoard.set(dashboardId, nowEpochMs);
      const thirtyDaysAgoIso = new Date(nowEpochMs - 30 * 24 * 60 * 60 * 1000).toISOString();
      Promise.all([
        sb.from('tabs').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
        sb.from('widgets').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
        sb.from('notes').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
      ]).catch(() => {});
    }

    // Remember the board's revision after this device's own changes, so the next check doesn't download
    // the whole board again. Only when nobody else had changed it since this device last synced, or
    // their change would be skipped too.
    if (lastKnownCloudUpdatedAt && remoteDashRes.data?.updated_at === lastKnownCloudUpdatedAt) {
      const { data: head } = await sb.from('dashboards').select('updated_at').eq('id', dashboardId).maybeSingle();
      if (head?.updated_at) lastKnownCloudUpdatedAt = head.updated_at;
    }

    setLocalBoard(dashboardId);
    if (refusedForSpace.length > 0) {
      const { message } = refusedForSpace[0];
      setSyncRefusal({ message });
      return { success: false, error: message };
    }
    setSyncRefusal(null);
    return { success: true };
  } catch (err: any) {
    console.error('Cloud push failed:', err);
    return { success: false, error: err.message || 'Cloud backup failed' };
  }
}

type PullResult = {
  success: boolean;
  hasChanges?: boolean;
  hasUnsyncedLocalChanges?: boolean;
  error?: string;
};

// Startup, sign-in and screen wake can each ask for a pull at the same moment. They share one download.
const pullsInFlight = new Map<'restore' | 'full' | 'check', Promise<PullResult>>();

// Pull latest changes from Supabase Cloud to local Dexie (Strictly authenticated only)
export function pullFromCloud(options?: { force?: boolean; overwriteLocal?: boolean }): Promise<PullResult> {
  const kind = options?.overwriteLocal ? 'restore' : options?.force ? 'full' : 'check';
  const running = pullsInFlight.get(kind);
  if (running) return running;
  const pull = pullFromCloudOnce(options).finally(() => pullsInFlight.delete(kind));
  pullsInFlight.set(kind, pull);
  return pull;
}

async function pullFromCloudOnce(options?: { force?: boolean; overwriteLocal?: boolean }): Promise<PullResult> {
  const sb = await getSupabaseAsync();
  const user = await getCachedSessionUser();
  if (!sb || !user) return { success: false, error: 'Not authenticated' };

  try {
    const target = await resolveActiveDashboardId();
    const dashboardId = target?.dashboardId || user.id;
    // This device holds another board's copy, which this pull replaces
    const localBoard = getLocalBoard();
    const switchingBoards = localBoard !== null && localBoard !== dashboardId;
    const overwriteLocal = Boolean(options?.overwriteLocal);

    // Fast-path: Check lightweight dashboard revision before scanning full tables with JSON payloads
    if (!options?.force && !overwriteLocal && !switchingBoards) {
      const { data: dashHead, error: headErr } = await sb
        .from('dashboards')
        .select('updated_at')
        .eq('id', dashboardId)
        .maybeSingle();

      if (!headErr && dashHead?.updated_at && lastKnownCloudUpdatedAt && dashHead.updated_at === lastKnownCloudUpdatedAt) {
        // Cloud revision has not changed since our last pull
        return { success: true, hasChanges: false };
      }
    }

    const [dashRes, tabsRes, widgetsRes, notesRes] = await Promise.all([
      sb.from('dashboards').select('*').eq('id', dashboardId).maybeSingle(),
      sb.from('tabs').select('*').eq('dashboard_id', dashboardId),
      sb.from('widgets').select('*').eq('dashboard_id', dashboardId),
      sb.from('notes').select('*').eq('dashboard_id', dashboardId),
    ]);

    if (dashRes.error) throw dashRes.error;
    if (tabsRes.error) throw tabsRes.error;
    if (widgetsRes.error) throw widgetsRes.error;
    if (notesRes.error) throw notesRes.error;

    if (switchingBoards) {
      await clearLocalBoard();
      lastKnownCloudUpdatedAt = null;
    }

    if (!dashRes.data && (!tabsRes.data || tabsRes.data.length === 0) && (!widgetsRes.data || widgetsRes.data.length === 0)) {
      if (switchingBoards) {
        // The new board is empty, so this device starts it the way a new device does
        await db.transaction('rw', db.tabs, db.widgets, db.notes, async () => {
          await db.tabs.bulkPut(DEFAULT_TABS);
          await db.widgets.bulkPut(DEFAULT_WIDGETS);
          await db.notes.bulkPut(DEFAULT_NOTES);
        });
        setLocalBoard(dashboardId);
        return { success: true, hasChanges: true };
      }
      return { success: false, error: 'No cloud backup found for this account.' };
    }

    const joiningExistingCloudBoard = localBoard === null && Boolean(dashRes.data);
    let hasUnsyncedLocalChanges = false;

    const cloudSettings = dashRes.data?.settings;
    if (cloudSettings && Object.keys(cloudSettings).length > 0) {
      const currentSettings = await db.settings.get('global');
      const localTime = Date.parse(currentSettings?.updated_at || '') || 0;
      // The settings' own time. The board's updated_at also moves when any device saves a note or widget,
      // so comparing with it would replace settings changed here that haven't been sent yet.
      const cloudSettingsAt: string = cloudSettings.updated_at || dashRes.data.updated_at;
      const cloudTime = Date.parse(cloudSettingsAt || '') || 0;
      // The first time a device syncs this way, it still compares with the board's time, as before, so
      // it takes the cloud's settings once rather than sending its own copy back. A member can't save
      // the board's settings, so a member's device always follows the owner's.
      const firstSyncThisWay = getKnownCloudSettingsAt(dashboardId) === null;
      const boardTime = Date.parse(dashRes.data.updated_at || '') || 0;
      const acceptCloudSettings = shouldAcceptCloudSettings({
        switchingBoards,
        joiningExistingCloudBoard,
        overwriteLocal,
        hasLocalSettings: Boolean(currentSettings),
        isMember: Boolean(target?.isMember),
        firstSyncThisWay,
        localTime,
        cloudTime,
        boardTime,
      });
      setKnownCloudSettingsAt(dashboardId, cloudSettingsAt);
      if (acceptCloudSettings) {
        const cloudPhotoType = dashRes.data.settings?.commonPhotoSourceType;
        const resolvedCommonPhotos =
          cloudPhotoType === 'curated' || dashRes.data.settings?.commonPhotoCuratedCategory
            ? resolveCuratedPhotos(
                dashRes.data.settings?.commonPhotoCuratedCategory,
                dashRes.data.settings?.commonPhotoSourceLabel
              )
            : !switchingBoards &&
              currentSettings?.commonPhotos?.length &&
              isSameCommonPhotoSource(dashRes.data.settings, currentSettings)
            ? currentSettings.commonPhotos
            : (dashRes.data.settings?.commonPhotos || []);

        await db.settings.put(
          mergeCloudSettingsForLocal({
            defaultSettings: DEFAULT_SETTINGS,
            cloudSettings: dashRes.data.settings,
            currentSettings,
            resolvedCommonPhotos,
            cloudSettingsAt,
            preserveDeviceLocks: true,
          })
        );
      }
    }

    const canvasThemes = dashRes.data?.settings?.canvasThemes || {};
    if (tabsRes.data && tabsRes.data.length > 0) {
      const localTabs = await db.tabs.toArray();
      const localMap = new Map(localTabs.map((t) => [t.id, t]));
      const cloudTabIds = new Set(tabsRes.data.map((t: any) => t.id));

      const tabsToPut: DashboardTab[] = [];
      const toDeleteTabIds: string[] = [];
      for (let idx = 0; idx < tabsRes.data.length; idx++) {
        const t = tabsRes.data[idx];
        if (overwriteLocal && t.deleted_at) {
          toDeleteTabIds.push(t.id);
          continue;
        }
        const mapped: DashboardTab = {
          id: t.id,
          name: t.name,
          icon: t.icon,
          order: Number.isFinite(t.order_index) ? t.order_index : idx,
          layoutMode: t.layout_mode,
          autoRotateDurationSec: t.auto_rotate_duration_sec,
          backgroundTheme: canvasThemes[t.id]?.backgroundTheme || t.background_theme || undefined,
          customWallpaperUrl: canvasThemes[t.id]?.customWallpaperUrl || t.custom_wallpaper_url,
          backgroundDimLevel: canvasThemes[t.id]?.backgroundDimLevel ?? t.background_dim_level ?? undefined,
          hideNotes: canvasThemes[t.id]?.hideNotes ?? t.hide_notes ?? undefined,
          isHome: canvasThemes[t.id]?.isHome ?? t.is_home ?? undefined,
          enabled: typeof t.enabled === 'boolean' ? t.enabled : undefined,
          updated_at: t.updated_at,
          deleted_at: t.deleted_at,
        };

        const local = localMap.get(t.id);
        const localTime = local ? new Date(local.updated_at || 0).getTime() : 0;
        const cloudTime = new Date(mapped.updated_at || 0).getTime();
        const localDeletedOrArchived = Boolean(local?.deleted_at);
        const cloudDeletedOrArchived = Boolean(mapped.deleted_at);
        if (
          shouldAcceptCloudRow({
            overwriteLocal,
            hasLocalRow: Boolean(local),
            localTime,
            cloudTime,
            localDeletedOrArchived,
            cloudDeletedOrArchived,
          })
        ) {
          const mergedTab =
            !local || overwriteLocal || switchingBoards ? mapped : keepLocalTabFields(mapped, local);
          tabsToPut.push({
            ...mergedTab,
            backgroundTheme: mergedTab.backgroundTheme || 'midnight_dots',
            backgroundDimLevel: mergedTab.backgroundDimLevel ?? 45,
            hideNotes: mergedTab.hideNotes ?? false,
            isHome: mergedTab.isHome ?? false,
            enabled: mergedTab.enabled !== undefined ? mergedTab.enabled : t.id !== 'tab-overview',
          });
        } else if (!switchingBoards && !overwriteLocal && local) {
          hasUnsyncedLocalChanges = true;
        }
      }

      // Clean up default placeholder tab (or removed local tabs during authoritative restore)
      for (const lt of localTabs) {
        if (!cloudTabIds.has(lt.id)) {
          if (overwriteLocal || lt.id === 'tab-corkboard') {
            toDeleteTabIds.push(lt.id);
          } else if (!switchingBoards && !joiningExistingCloudBoard) {
            hasUnsyncedLocalChanges = true;
          }
        }
      }

      if (tabsToPut.length > 0) {
        await db.tabs.bulkPut(tabsToPut);
      }
      if (toDeleteTabIds.length > 0) {
        await db.tabs.bulkDelete(toDeleteTabIds);
      }
    }

    const replaceLocalHousehold = overwriteLocal || switchingBoards;
    let kanbanSystemRowRestored = false;

    if (widgetsRes.data && widgetsRes.data.length > 0) {
      // Extract the Global Household Profiles system row if present
      const householdProfilesRow = widgetsRes.data.find((w: any) => w.id === HOUSEHOLD_PROFILES_CLOUD_ROW_ID);
      if (
        householdProfilesRow &&
        !householdProfilesRow.deleted_at &&
        Array.isArray(householdProfilesRow.config?.profiles)
      ) {
        if (replaceLocalHousehold) {
          await db.profiles.clear();
          await db.profiles.bulkPut(householdProfilesRow.config.profiles as HouseholdProfile[]);
          await useProfileStore.getState().initProfileStore();
        } else {
          await useProfileStore
            .getState()
            .applyRemoteProfiles(householdProfilesRow.config.profiles as HouseholdProfile[]);
        }
      }

      // Extract the household Chore Engine system row if present
      const choreEngineRow = widgetsRes.data.find((w: any) => w.id === CHORE_ENGINE_CLOUD_ROW_ID);
      if (choreEngineRow && !choreEngineRow.deleted_at && choreEngineRow.config?.id === 'household_chores') {
        if (replaceLocalHousehold) {
          await db.chores.put(choreEngineRow.config as ChoreEngineSnapshot);
          await useChoreStore.getState().initChoreStore();
        } else {
          await useChoreStore.getState().applyRemoteSnapshot(choreEngineRow.config as ChoreEngineSnapshot);
        }
      }

      // Extract the Meal Planner & Smart Shopping List system row if present
      const mealPlannerRow = widgetsRes.data.find((w: any) => w.id === MEAL_PLANNER_CLOUD_ROW_ID);
      if (mealPlannerRow && !mealPlannerRow.deleted_at && mealPlannerRow.config?.id === 'household_meals') {
        if (replaceLocalHousehold) {
          await db.meals.put(mealPlannerRow.config as MealPlannerSnapshot);
          await useMealStore.getState().initMealStore();
        } else {
          await useMealStore
            .getState()
            .applyRemoteMealSnapshot(mealPlannerRow.config as MealPlannerSnapshot);
        }
      }

      // Extract the Multi-Board Kanban Engine system row if present
      const kanbanEngineRow = widgetsRes.data.find((w: any) => w.id === KANBAN_ENGINE_CLOUD_ROW_ID);
      if (kanbanEngineRow && !kanbanEngineRow.deleted_at && kanbanEngineRow.config?.id === 'household_kanban') {
        const snap = kanbanEngineRow.config as KanbanEngineSnapshot;
        if (replaceLocalHousehold) {
          kanbanSystemRowRestored = true;
          await db.transaction('rw', [db.kanbanBoards, db.kanbanCards, db.kanban], async () => {
            await Promise.all([db.kanbanBoards.clear(), db.kanbanCards.clear()]);
            if (snap.boards?.length > 0) await db.kanbanBoards.bulkPut(snap.boards);
            if (snap.cards?.length > 0) await db.kanbanCards.bulkPut(snap.cards);
            await db.kanban.put(snap);
          });
          await useKanbanStore.getState().initKanbanStore();
        } else {
          await useKanbanStore.getState().applyRemoteKanbanSnapshot(snap);
        }
      }

      // Extract the Home Check-Ins & Rhythms system row if present
      const routinesRow = widgetsRes.data.find((w: any) => w.id === ROUTINES_CLOUD_ROW_ID);
      if (routinesRow && !routinesRow.deleted_at && routinesRow.config?.id === 'household_routines') {
        if (replaceLocalHousehold) {
          await db.routines.put(routinesRow.config as RoutinesSnapshot);
          await useRoutinesStore.getState().initRoutinesStore();
        } else {
          await useRoutinesStore
            .getState()
            .applyRemoteRoutinesSnapshot(routinesRow.config as RoutinesSnapshot);
        }
      }

      // Extract the Local Family Calendar Events system row if present
      const calendarEventsRow = widgetsRes.data.find(
        (w: any) => w.id === CALENDAR_EVENTS_CLOUD_ROW_ID
      );
      if (
        calendarEventsRow &&
        !calendarEventsRow.deleted_at &&
        calendarEventsRow.config?.id === 'household_calendar_events'
      ) {
        if (replaceLocalHousehold) {
          await db.calendarEvents.put(calendarEventsRow.config as CalendarEventsSnapshot);
          await useCalendarEventsStore.getState().initCalendarEventsStore();
        } else {
          await useCalendarEventsStore
            .getState()
            .applyRemoteCalendarEventsSnapshot(calendarEventsRow.config as CalendarEventsSnapshot);
        }
      }

      const canvasWidgetRows = widgetsRes.data.filter(
        (w: any) =>
          w.id !== CHORE_ENGINE_CLOUD_ROW_ID &&
          w.id !== HOUSEHOLD_PROFILES_CLOUD_ROW_ID &&
          w.id !== MEAL_PLANNER_CLOUD_ROW_ID &&
          w.id !== KANBAN_ENGINE_CLOUD_ROW_ID &&
          w.id !== ROUTINES_CLOUD_ROW_ID &&
          w.id !== CALENDAR_EVENTS_CLOUD_ROW_ID
      );
      const localWidgets = await db.widgets.toArray();
      const localMap = new Map(localWidgets.map((w) => [w.id, w]));
      const cloudWidgetIds = new Set(canvasWidgetRows.map((w: any) => w.id));

      const widgetsToPut: DashboardWidget[] = [];
      const toDeleteWidgetIds: string[] = [];
      const wifiVaultKeysToDelete = new Set<string>();
      for (const w of canvasWidgetRows) {
        const local = localMap.get(w.id);
        if (overwriteLocal && w.deleted_at) {
          toDeleteWidgetIds.push(w.id);
          if (w.type === 'wifi_qr' || local?.type === 'wifi_qr') {
            wifiVaultKeysToDelete.add(getWifiVaultKey(w.id));
          }
          if (w.type === 'homelab' || local?.type === 'homelab') {
            wifiVaultKeysToDelete.add(getHomelabVaultKey(w.id));
          }
          continue;
        }
        const baseConfig =
          w.type === 'wifi_qr'
            ? stripWifiCredentialsFromConfig(w.config || {})
            : w.type === 'homelab'
              ? stripHomelabCredentialsFromConfig(w.config || {})
              : (w.config || {});
        const isEmptyDeletedConfig = Boolean(w.deleted_at) && Object.keys(baseConfig).length === 0;
        const hasAnyPhotos =
          w.type === 'photo_frame' ||
          Array.isArray(w.config?.customPhotos) ||
          Boolean(local?.config?.customPhotos?.length);
        const config =
          w.type === 'wifi_qr' || w.type === 'homelab' || isEmptyDeletedConfig || !hasAnyPhotos
            ? baseConfig
            : {
                ...baseConfig,
                // Preserve local customPhotos only when cloud widget config still targets the same album
                customPhotos:
                  local?.config?.customPhotos?.length && isSameWidgetPhotoSource(w.config, local.config)
                    ? local.config.customPhotos
                    : (w.config?.customPhotos || []),
              };

        const mapped: DashboardWidget = sanitizeRestoredPhotoWidget({
          id: w.id,
          tabId: w.tab_id,
          type: w.type,
          title: w.title,
          gridPos: w.grid_pos,
          freeformPos: w.freeform_pos,
          config,
          updated_at: w.updated_at,
          deleted_at: w.deleted_at,
          ...(isPermanentlyPurgedWidget({ config }) ? { permanentlyDeleted: true } : {}),
        }).widget;

        const localTime = local ? new Date(local.updated_at || 0).getTime() : 0;
        const cloudTime = new Date(mapped.updated_at || 0).getTime();
        const localDeletedOrArchived = Boolean(local?.deleted_at);
        const cloudDeletedOrArchived = Boolean(mapped.deleted_at);
        if (
          shouldAcceptCloudRow({
            overwriteLocal,
            hasLocalRow: Boolean(local),
            localTime,
            cloudTime,
            localDeletedOrArchived,
            cloudDeletedOrArchived,
          })
        ) {
          if (mapped.deleted_at && (mapped.type === 'wifi_qr' || local?.type === 'wifi_qr')) {
            wifiVaultKeysToDelete.add(getWifiVaultKey(mapped.id));
          }
          if (mapped.deleted_at && (mapped.type === 'homelab' || local?.type === 'homelab')) {
            wifiVaultKeysToDelete.add(getHomelabVaultKey(mapped.id));
          }
          widgetsToPut.push(!local ? mapped : keepLocalWidgetFields(mapped, local));
        } else if (!switchingBoards && !overwriteLocal && local) {
          hasUnsyncedLocalChanges = true;
        }
      }

      // Clean up seeded default widgets (or removed local widgets during authoritative restore)
      const defaultWidgetIds = new Set(['widget-clock', 'widget-notes-tile', 'widget-photo-tile', 'widget-countdown-tile']);
      for (const lw of localWidgets) {
        if (!cloudWidgetIds.has(lw.id)) {
          if (overwriteLocal || defaultWidgetIds.has(lw.id)) {
            toDeleteWidgetIds.push(lw.id);
            if (lw.type === 'wifi_qr') {
              wifiVaultKeysToDelete.add(getWifiVaultKey(lw.id));
            }
            if (lw.type === 'homelab') {
              wifiVaultKeysToDelete.add(getHomelabVaultKey(lw.id));
            }
          } else if (!switchingBoards && !joiningExistingCloudBoard) {
            hasUnsyncedLocalChanges = true;
          }
        }
      }

      if (widgetsToPut.length > 0) {
        await db.widgets.bulkPut(widgetsToPut);
      }
      if (toDeleteWidgetIds.length > 0) {
        await db.widgets.bulkDelete(toDeleteWidgetIds);
      }
      if (wifiVaultKeysToDelete.size > 0) {
        await db.vault.bulkDelete([...wifiVaultKeysToDelete]).catch(() => {});
      }
    }

    if (notesRes.data) {
      const localNotes = await db.notes.toArray();
      const localMap = new Map(localNotes.map((n) => [n.id, n]));
      const cloudNoteIds = new Set(notesRes.data.map((n: any) => n.id));

      const notesToPut: StickyNoteItem[] = [];
      const toDeleteNoteIds: string[] = [];
      for (const n of notesRes.data) {
        if (overwriteLocal && n.deleted_at) {
          toDeleteNoteIds.push(n.id);
          continue;
        }
        const mapped = hydrateNoteFromCloudRow(n);

        const local = localMap.get(n.id);
        const localTime = local ? new Date(local.updated_at || 0).getTime() : 0;
        const cloudTime = new Date(mapped.updated_at || 0).getTime();
        const localDeletedOrArchived = Boolean(local?.deleted_at || local?.archivedAt);
        const cloudDeletedOrArchived = Boolean(mapped.deleted_at || mapped.archivedAt);
        if (
          shouldAcceptCloudRow({
            overwriteLocal,
            hasLocalRow: Boolean(local),
            localTime,
            cloudTime,
            localDeletedOrArchived,
            cloudDeletedOrArchived,
          })
        ) {
          notesToPut.push(!local || overwriteLocal ? mapped : keepLocalNoteFields(mapped, local));
        } else if (!switchingBoards && !overwriteLocal && local) {
          hasUnsyncedLocalChanges = true;
        }
      }

      const defaultNoteIds = new Set(['note-welcome', 'note-groceries']);
      for (const ln of localNotes) {
        if (!cloudNoteIds.has(ln.id)) {
          if (overwriteLocal || defaultNoteIds.has(ln.id)) {
            toDeleteNoteIds.push(ln.id);
          } else if (!switchingBoards && !joiningExistingCloudBoard) {
            hasUnsyncedLocalChanges = true;
          }
        }
      }

      if (notesToPut.length > 0) {
        await db.notes.bulkPut(notesToPut);
      }
      if (toDeleteNoteIds.length > 0) {
        await db.notes.bulkDelete(toDeleteNoteIds);
      }
    }

    // Best-effort direct pull from public.kanban_boards & public.kanban_cards tables
    if (!kanbanSystemRowRestored) {
      try {
        const [kbBoardsRes, kbCardsRes] = await Promise.all([
          sb.from('kanban_boards').select('*').eq('dashboard_id', dashboardId),
          sb.from('kanban_cards').select('*').eq('dashboard_id', dashboardId),
        ]);
        if (!kbBoardsRes.error && !kbCardsRes.error && kbBoardsRes.data && kbBoardsRes.data.length > 0) {
          const mappedBoards = kbBoardsRes.data.map(mapDbKanbanBoardRow);
          const mappedCards = (kbCardsRes.data || []).map(mapDbKanbanCardRow);
          let latestIso = '';
          let latestMs = 0;
          for (const item of [...mappedBoards, ...mappedCards]) {
            const ms = Date.parse(item.updatedAt || '');
            if (Number.isFinite(ms) && ms > latestMs) {
              latestMs = ms;
              latestIso = item.updatedAt;
            }
          }
          if (!latestIso) {
            latestIso = dashRes.data?.updated_at || new Date(0).toISOString();
          }
          const tableSnap: KanbanEngineSnapshot = {
            id: 'household_kanban',
            boards: mappedBoards,
            cards: mappedCards,
            updated_at: latestIso,
          };
          if (replaceLocalHousehold) {
            await db.transaction('rw', [db.kanbanBoards, db.kanbanCards, db.kanban], async () => {
              await Promise.all([db.kanbanBoards.clear(), db.kanbanCards.clear()]);
              if (mappedBoards.length > 0) await db.kanbanBoards.bulkPut(mappedBoards);
              if (mappedCards.length > 0) await db.kanbanCards.bulkPut(mappedCards);
              await db.kanban.put(tableSnap);
            });
            await useKanbanStore.getState().initKanbanStore();
          } else {
            await useKanbanStore.getState().applyRemoteKanbanSnapshot(tableSnap);
          }
        }
      } catch {
        // Table may not be migrated yet; KANBAN_ENGINE_CLOUD_ROW_ID above already synced
      }
    }

    lastKnownCloudUpdatedAt = dashRes.data?.updated_at || null;
    setLocalBoard(dashboardId);
    return { success: true, hasChanges: true, hasUnsyncedLocalChanges };
  } catch (err: any) {
    console.error('Cloud pull failed:', err);
    return { success: false, error: err.message || 'Cloud pull failed' };
  }
}
