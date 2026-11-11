import { createClient, type SupabaseClient, type User, type RealtimeChannel } from '@supabase/supabase-js';
import { db, DEFAULT_SETTINGS, DEFAULT_TABS, DEFAULT_WIDGETS, DEFAULT_NOTES, DEFAULT_CHORE_SNAPSHOT, DEFAULT_HOUSEHOLD_PROFILES, DEFAULT_MEAL_SNAPSHOT } from './db';
import { stripPlexTokens } from './plexLinks';
import { isBoardFullError, setSyncRefusal } from './syncRefusal';
import { keepLocalNoteFields, keepLocalTabFields, keepLocalWidgetFields } from './syncMerge';
import type { DashboardTab, DashboardWidget, StickyNoteItem, AppSettings } from '../types/dashboard';
import type { ChoreEngineSnapshot } from '../types/chores';
import type { HouseholdProfile } from '../types/profiles';
import type { MealPlannerSnapshot } from '../types/meals';
import { useChoreStore } from '../store/choreStore';
import { useProfileStore } from '../stores/useProfileStore';
import { useMealStore } from '../stores/useMealStore';

const CHORE_ENGINE_CLOUD_ROW_ID = '__ambiently_chore_engine__';
const HOUSEHOLD_PROFILES_CLOUD_ROW_ID = '__ambiently_household_profiles__';
const MEAL_PLANNER_CLOUD_ROW_ID = '__ambiently_meal_planner__';

let supabaseClient: SupabaseClient | null = null;
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
    displayDensity: settings.displayDensity,
  };
}

// Removes the previous board's tabs, widgets, notes, settings, chores, profiles, meals and photo catalog from this device
async function clearLocalBoard(): Promise<void> {
  const current = await db.settings.get('global');
  await db.transaction('rw', [db.tabs, db.widgets, db.notes, db.settings, db.chores, db.profiles, db.meals], async () => {
    await Promise.all([
      db.tabs.clear(),
      db.widgets.clear(),
      db.notes.clear(),
      db.chores.clear(),
      db.profiles.clear(),
      db.meals.clear(),
    ]);
    await db.settings.put({ ...DEFAULT_SETTINGS, ...deviceOwnSettings(current) });
    await db.chores.put(DEFAULT_CHORE_SNAPSHOT);
    await db.profiles.bulkPut(DEFAULT_HOUSEHOLD_PROFILES);
    await db.meals.put(DEFAULT_MEAL_SNAPSHOT);
  });
}

export function isRealtimeConnected(): boolean {
  return realtimeConnectionActive;
}

export function invalidateDashboardIdCache(): void {
  cachedDashboardTarget = null;
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    supabaseClient = createClient(url, anonKey);
  }
  return supabaseClient;
}

export async function getCurrentUser(): Promise<User | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
}

export function onAuthStateChange(callback: (user: User | null, event: string) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
    callback(session?.user ?? null, event);
  });

  return () => subscription.unsubscribe();
}

export async function sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Cloud sync is not set up on this screen.' };
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabase();
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

// Subscribe to Realtime WebSocket updates ONLY when authenticated to a specific boardId
export function subscribeToRealtimeBoard(
  boardId: string | null | undefined,
  handlers:
    | RealtimeBoardHandlers
    | ((note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void)
): () => void {
  const sb = getSupabase();
  if (!sb || !boardId || boardId === 'default') {
    realtimeConnectionActive = false;
    if (realtimeChannel && sb) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    return () => {};
  }

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
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        const note: StickyNoteItem = {
          id: raw.id,
          tabId: raw.tab_id,
          widgetId: raw.widget_id,
          title: raw.title,
          content: raw.content || '',
          isChecklist: raw.is_checklist,
          checklistItems: raw.checklist_items || [],
          bgColor: raw.bg_color || '#fef08a',
          fontSize: raw.font_size || 'base',
          expiresAt: raw.expires_at,
          archivedAt: raw.archived_at,
          freeformPos: raw.freeform_pos || {},
          updated_at: raw.updated_at || new Date().toISOString(),
          deleted_at: raw.deleted_at,
        };

        noteHandler(note, eventType);
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
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;
        if (raw.dashboard_id && raw.dashboard_id !== boardId) return;

        const widget: DashboardWidget = {
          id: raw.id,
          tabId: raw.tab_id,
          type: raw.type,
          title: raw.title,
          gridPos: raw.grid_pos || { x: 0, y: 0, w: 4, h: 4 },
          freeformPos: raw.freeform_pos || {},
          config: raw.config || {},
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
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;
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
        const raw = (payload.new || payload.old) as any;
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
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
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
  const sb = getSupabase();
  const user = await getCurrentUser();
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

// Push local Dexie snapshot to Supabase Cloud (Strictly authenticated only)
export async function pushToCloud(
  settings: AppSettings,
  tabs: DashboardTab[],
  widgets: DashboardWidget[],
  notes: StickyNoteItem[]
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  const user = await getCurrentUser();
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

    // 1. Query Dexie to include all active and soft-deleted records so remote devices sync additions and deletions
    const [dbTabs, dbWidgets, dbNotes, dbChoreSnapshot, dbProfiles, dbMealSnapshot] = await Promise.all([
      db.tabs.toArray(),
      db.widgets.toArray(),
      db.notes.toArray(),
      db.chores.get('household_chores'),
      db.profiles.toArray(),
      db.meals.get('household_meals'),
    ]);

    const tabsToPush = dbTabs.length > 0 ? dbTabs : tabs;
    const widgetsToPush = dbWidgets.length > 0 ? dbWidgets : widgets;
    const notesToPush = dbNotes.length > 0 ? dbNotes : notes;

    // 2. Query remote updated_at timestamps to avoid stomping newer remote edits and avoid re-upserting unchanged rows
    const [remoteDashRes, remoteTabsRes, remoteWidgetsRes, remoteNotesRes] = await Promise.all([
      sb.from('dashboards').select('id, updated_at').eq('id', dashboardId).maybeSingle(),
      sb.from('tabs').select('id, updated_at').eq('dashboard_id', dashboardId),
      sb.from('widgets').select('id, updated_at').eq('dashboard_id', dashboardId),
      sb.from('notes').select('id, updated_at').eq('dashboard_id', dashboardId),
    ]);

    const remoteTabsMap = new Map((remoteTabsRes.data || []).map((t: any) => [t.id, new Date(t.updated_at || 0).getTime()]));
    const remoteWidgetsMap = new Map((remoteWidgetsRes.data || []).map((w: any) => [w.id, new Date(w.updated_at || 0).getTime()]));
    const remoteNotesMap = new Map((remoteNotesRes.data || []).map((n: any) => [n.id, new Date(n.updated_at || 0).getTime()]));

    const nowIso = new Date().toISOString();
    // Settings are sent when they changed on this device since it last synced them, unless another
    // device has saved newer ones since. Only then is the cloud's settings time read, which reads the
    // settings themselves, so most syncs don't.
    const localSettingsTime = Date.parse(settings.updated_at || '') || 0;
    let shouldUpsertDash = false;
    if (!isMember) {
      const knownCloudSettingsTime = getKnownCloudSettingsAt(dashboardId);
      if (!remoteDashRes.data) {
        shouldUpsertDash = true;
      } else if (knownCloudSettingsTime === null || localSettingsTime > knownCloudSettingsTime) {
        const { data: cloudSettings } = await sb
          .from('dashboards')
          .select('settings_updated_at:settings->>updated_at')
          .eq('id', dashboardId)
          .maybeSingle();
        const cloudSettingsAt = (cloudSettings as { settings_updated_at?: string | null } | null)?.settings_updated_at;
        const cloudSettingsTime = Date.parse(cloudSettingsAt || '') || 0;
        shouldUpsertDash = localSettingsTime > cloudSettingsTime;
        if (!shouldUpsertDash && cloudSettingsAt) setKnownCloudSettingsAt(dashboardId, cloudSettingsAt);
      }
    }

    // Upsert Tabs: only send tabs with genuinely newer timestamps or new records
    let tabsToUpsert: any[] = [];
    if (tabsToPush.length > 0) {
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
        const remoteTime = remoteTabsMap.get(t.id);
        if (remoteTime === undefined) return true;
        return new Date(t.updated_at || 0).getTime() > remoteTime;
      });
    }

    // Upsert Widgets: only send widgets with genuinely newer timestamps or new records
    let widgetsToUpsert: any[] = [];
    if (widgetsToPush.length > 0) {
      const formattedWidgets = widgetsToPush.map((w) => {
        let configToPush = { ...(w.config || {}) };
        // Strip customPhotos array from cloud sync payload to keep database pure config (< 5 KB)
        if ('customPhotos' in configToPush) {
          const { customPhotos: _, ...restConfig } = configToPush;
          configToPush = restConfig;
        }
        return {
          id: w.id,
          dashboard_id: dashboardId,
          tab_id: w.tabId,
          user_id: ownerId,
          type: w.type,
          title: w.title,
          grid_pos: w.gridPos,
          freeform_pos: w.freeformPos,
          // A deleted widget only needs its id and deletion time, so its content (an uploaded image, say)
          // doesn't keep using the board's space for the 30 days the deletion is kept
          config: w.deleted_at ? {} : stripPlexTokens(configToPush),
          updated_at: w.updated_at,
          deleted_at: w.deleted_at || null,
        };
      });

      widgetsToUpsert = formattedWidgets.filter((w) => {
        const remoteTime = remoteWidgetsMap.get(w.id);
        if (remoteTime === undefined) return true;
        return new Date(w.updated_at || 0).getTime() > remoteTime;
      });
    }

    // Sync household Chore Engine snapshot via reserved system row in widgets table
    const activeChoreSnapshot = dbChoreSnapshot || useChoreStore.getState().snapshot;
    if (activeChoreSnapshot && activeChoreSnapshot.id === 'household_chores') {
      const localChoreTime = new Date(activeChoreSnapshot.updated_at || 0).getTime();
      const remoteChoreTime = remoteWidgetsMap.get(CHORE_ENGINE_CLOUD_ROW_ID);
      const shouldPushChores =
        remoteChoreTime === undefined
          ? localChoreTime > 0
          : localChoreTime > remoteChoreTime;

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
    const profilesToPush = dbProfiles.length > 0 ? dbProfiles : useProfileStore.getState().profiles;
    if (profilesToPush.length > 0) {
      const latestProfileTime = profilesToPush.reduce(
        (max, p) => Math.max(max, new Date(p.updatedAt || 0).getTime()),
        0
      );
      const remoteProfilesRowTime = remoteWidgetsMap.get(HOUSEHOLD_PROFILES_CLOUD_ROW_ID);
      const shouldPushProfilesRow =
        remoteProfilesRowTime === undefined
          ? latestProfileTime > 0
          : latestProfileTime > remoteProfilesRowTime;

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
    const activeMealSnapshot = dbMealSnapshot || useMealStore.getState().snapshot;
    if (activeMealSnapshot && activeMealSnapshot.id === 'household_meals') {
      const localMealTime = new Date(activeMealSnapshot.updated_at || 0).getTime();
      const remoteMealTime = remoteWidgetsMap.get(MEAL_PLANNER_CLOUD_ROW_ID);
      const shouldPushMeals =
        remoteMealTime === undefined
          ? localMealTime > 0
          : localMealTime > remoteMealTime;

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

    // Upsert Notes: only send notes with genuinely newer timestamps or new records
    let notesToUpsert: any[] = [];
    if (notesToPush.length > 0) {
      const formattedNotes = notesToPush.map((n) => ({
        id: n.id,
        dashboard_id: dashboardId,
        user_id: ownerId,
        tab_id: n.tabId,
        widget_id: n.widgetId,
        // Like widgets, a deleted note is sent without its text
        title: n.deleted_at ? null : n.title,
        content: n.deleted_at ? '' : n.content,
        is_checklist: n.isChecklist,
        checklist_items: n.deleted_at ? [] : n.checklistItems || [],
        bg_color: n.bgColor,
        font_size: n.fontSize || 'base',
        expires_at: n.expiresAt || null,
        archived_at: n.archivedAt || null,
        freeform_pos: n.freeformPos || {},
        updated_at: n.updated_at,
        deleted_at: n.deleted_at || null,
      }));

      notesToUpsert = formattedNotes.filter((n) => {
        const remoteTime = remoteNotesMap.get(n.id);
        if (remoteTime === undefined) return true;
        return new Date(n.updated_at || 0).getTime() > remoteTime;
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

      let settingsToPush = { ...settings };
      // Strip commonPhotos array from cloud sync payload to keep database pure config (< 5 KB)
      if ('commonPhotos' in settingsToPush) {
        const { commonPhotos: _, ...restSettings } = settingsToPush;
        settingsToPush = restSettings;
      }

      const cloudSafeSettings = stripPlexTokens({
        ...settingsToPush,
        pinHash: null,
        canvasThemes: tabThemeMeta,
      });

      const { error: dashErr } = await sb.from('dashboards').upsert({
        id: dashboardId,
        user_id: ownerId,
        title: settings.dashboardTitle,
        settings: cloudSafeSettings,
        invite_code: null,
        updated_at: nowIso,
      });
      if (dashErr) skipIfBoardFull(dashErr);
      else setKnownCloudSettingsAt(dashboardId, settings.updated_at);
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

    // Non-blocking purge of expired tombstones (> 30 days old) in cloud database
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      sb.from('tabs').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
      sb.from('widgets').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
      sb.from('notes').delete().eq('dashboard_id', dashboardId).lt('deleted_at', thirtyDaysAgoIso),
    ]).catch(() => {});

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

type PullResult = { success: boolean; hasChanges?: boolean; error?: string };

// Startup, sign-in and screen wake can each ask for a pull at the same moment. They share one download.
const pullsInFlight = new Map<'full' | 'check', Promise<PullResult>>();

// Pull latest changes from Supabase Cloud to local Dexie (Strictly authenticated only)
export function pullFromCloud(options?: { force?: boolean }): Promise<PullResult> {
  const kind = options?.force ? 'full' : 'check';
  const running = pullsInFlight.get(kind);
  if (running) return running;
  const pull = pullFromCloudOnce(options).finally(() => pullsInFlight.delete(kind));
  pullsInFlight.set(kind, pull);
  return pull;
}

async function pullFromCloudOnce(options?: { force?: boolean }): Promise<PullResult> {
  const sb = getSupabase();
  const user = await getCurrentUser();
  if (!sb || !user) return { success: false, error: 'Not authenticated' };

  try {
    const target = await resolveActiveDashboardId();
    const dashboardId = target?.dashboardId || user.id;
    // This device holds another board's copy, which this pull replaces
    const localBoard = getLocalBoard();
    const switchingBoards = localBoard !== null && localBoard !== dashboardId;

    // Fast-path: Check lightweight dashboard revision before scanning full tables with JSON payloads
    if (!options?.force && !switchingBoards) {
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
      const cloudIsNewer = target?.isMember
        ? cloudTime !== localTime
        : firstSyncThisWay
          ? boardTime >= localTime
          : cloudTime > localTime;
      setKnownCloudSettingsAt(dashboardId, cloudSettingsAt);
      if (switchingBoards || !currentSettings || cloudIsNewer) {
        await db.settings.put({
          ...dashRes.data.settings,
          // Preserve local photo catalog when cloud sync is pure configuration
          commonPhotos: currentSettings?.commonPhotos?.length
            ? currentSettings.commonPhotos
            : (dashRes.data.settings?.commonPhotos || []),
          // Preserve local device PIN lock state rather than overwriting from cloud
          pinHash: currentSettings?.pinHash ?? null,
          pinLockEnabled: currentSettings?.pinLockEnabled ?? false,
          id: 'global',
          updated_at: cloudSettingsAt,
        });
      }
    }

    const canvasThemes = dashRes.data?.settings?.canvasThemes || {};
    if (tabsRes.data && tabsRes.data.length > 0) {
      const localTabs = await db.tabs.toArray();
      const localMap = new Map(localTabs.map((t) => [t.id, t]));
      const cloudTabIds = new Set(tabsRes.data.map((t: any) => t.id));

      const tabsToPut: DashboardTab[] = [];
      for (let idx = 0; idx < tabsRes.data.length; idx++) {
        const t = tabsRes.data[idx];
        const mapped: DashboardTab = {
          id: t.id,
          name: t.name,
          icon: t.icon,
          order: Number.isFinite(t.order_index) ? t.order_index : idx,
          layoutMode: t.layout_mode,
          autoRotateDurationSec: t.auto_rotate_duration_sec,
          backgroundTheme: canvasThemes[t.id]?.backgroundTheme || t.background_theme || 'midnight_dots',
          customWallpaperUrl: canvasThemes[t.id]?.customWallpaperUrl || t.custom_wallpaper_url,
          backgroundDimLevel: canvasThemes[t.id]?.backgroundDimLevel ?? t.background_dim_level ?? 45,
          hideNotes: canvasThemes[t.id]?.hideNotes ?? t.hide_notes ?? false,
          isHome: canvasThemes[t.id]?.isHome ?? t.is_home ?? false,
          enabled: t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false,
          updated_at: t.updated_at,
          deleted_at: t.deleted_at,
        };

        const local = localMap.get(t.id);
        if (!local) {
          tabsToPut.push(mapped);
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const cloudTime = new Date(mapped.updated_at || 0).getTime();
          if (cloudTime >= localTime) {
            tabsToPut.push(keepLocalTabFields(mapped, local));
          }
        }
      }

      // Clean up default placeholder tab if cloud already has tabs
      const toDeleteTabIds: string[] = [];
      for (const lt of localTabs) {
        if (!cloudTabIds.has(lt.id) && lt.id === 'tab-corkboard') {
          toDeleteTabIds.push(lt.id);
        }
      }

      if (tabsToPut.length > 0) {
        await db.tabs.bulkPut(tabsToPut);
      }
      if (toDeleteTabIds.length > 0) {
        await db.tabs.bulkDelete(toDeleteTabIds);
      }
    }

    if (widgetsRes.data && widgetsRes.data.length > 0) {
      // Extract the Global Household Profiles system row if present
      const householdProfilesRow = widgetsRes.data.find((w: any) => w.id === HOUSEHOLD_PROFILES_CLOUD_ROW_ID);
      if (
        householdProfilesRow &&
        !householdProfilesRow.deleted_at &&
        Array.isArray(householdProfilesRow.config?.profiles)
      ) {
        await useProfileStore
          .getState()
          .applyRemoteProfiles(householdProfilesRow.config.profiles as HouseholdProfile[]);
      }

      // Extract the household Chore Engine system row if present
      const choreEngineRow = widgetsRes.data.find((w: any) => w.id === CHORE_ENGINE_CLOUD_ROW_ID);
      if (choreEngineRow && !choreEngineRow.deleted_at && choreEngineRow.config?.id === 'household_chores') {
        await useChoreStore.getState().applyRemoteSnapshot(choreEngineRow.config as ChoreEngineSnapshot);
      }

      // Extract the Meal Planner & Smart Shopping List system row if present
      const mealPlannerRow = widgetsRes.data.find((w: any) => w.id === MEAL_PLANNER_CLOUD_ROW_ID);
      if (mealPlannerRow && !mealPlannerRow.deleted_at && mealPlannerRow.config?.id === 'household_meals') {
        await useMealStore
          .getState()
          .applyRemoteMealSnapshot(mealPlannerRow.config as MealPlannerSnapshot);
      }

      const canvasWidgetRows = widgetsRes.data.filter(
        (w: any) =>
          w.id !== CHORE_ENGINE_CLOUD_ROW_ID &&
          w.id !== HOUSEHOLD_PROFILES_CLOUD_ROW_ID &&
          w.id !== MEAL_PLANNER_CLOUD_ROW_ID
      );
      const localWidgets = await db.widgets.toArray();
      const localMap = new Map(localWidgets.map((w) => [w.id, w]));
      const cloudWidgetIds = new Set(canvasWidgetRows.map((w: any) => w.id));

      const widgetsToPut: DashboardWidget[] = [];
      for (const w of canvasWidgetRows) {
        const local = localMap.get(w.id);
        const config = {
          ...(w.config || {}),
          // Preserve local customPhotos when cloud widget config is pure configuration
          customPhotos: local?.config?.customPhotos?.length
            ? local.config.customPhotos
            : (w.config?.customPhotos || []),
        };

        const mapped: DashboardWidget = {
          id: w.id,
          tabId: w.tab_id,
          type: w.type,
          title: w.title,
          gridPos: w.grid_pos,
          freeformPos: w.freeform_pos,
          config,
          updated_at: w.updated_at,
          deleted_at: w.deleted_at,
        };

        if (!local) {
          widgetsToPut.push(mapped);
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const cloudTime = new Date(mapped.updated_at || 0).getTime();
          if (cloudTime >= localTime) {
            widgetsToPut.push(keepLocalWidgetFields(mapped, local));
          }
        }
      }

      // Clean up seeded default widgets that do not exist in cloud
      const defaultWidgetIds = new Set(['widget-clock', 'widget-notes-tile', 'widget-photo-tile', 'widget-countdown-tile']);
      const toDeleteWidgetIds: string[] = [];
      for (const lw of localWidgets) {
        if (!cloudWidgetIds.has(lw.id) && defaultWidgetIds.has(lw.id)) {
          toDeleteWidgetIds.push(lw.id);
        }
      }

      if (widgetsToPut.length > 0) {
        await db.widgets.bulkPut(widgetsToPut);
      }
      if (toDeleteWidgetIds.length > 0) {
        await db.widgets.bulkDelete(toDeleteWidgetIds);
      }
    }

    if (notesRes.data && notesRes.data.length > 0) {
      const localNotes = await db.notes.toArray();
      const localMap = new Map(localNotes.map((n) => [n.id, n]));
      const cloudNoteIds = new Set(notesRes.data.map((n: any) => n.id));

      const notesToPut: StickyNoteItem[] = [];
      for (const n of notesRes.data) {
        const mapped: StickyNoteItem = {
          id: n.id,
          tabId: n.tab_id,
          widgetId: n.widget_id,
          title: n.title,
          content: n.content,
          isChecklist: n.is_checklist,
          checklistItems: n.checklist_items,
          bgColor: n.bg_color,
          fontSize: n.font_size,
          expiresAt: n.expires_at,
          archivedAt: n.archived_at,
          freeformPos: n.freeform_pos,
          updated_at: n.updated_at,
          deleted_at: n.deleted_at,
        };

        const local = localMap.get(n.id);
        if (!local) {
          notesToPut.push(mapped);
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const cloudTime = new Date(mapped.updated_at || 0).getTime();
          if (cloudTime >= localTime) {
            notesToPut.push(keepLocalNoteFields(mapped, local));
          }
        }
      }

      const defaultNoteIds = new Set(['note-welcome', 'note-groceries']);
      const toDeleteNoteIds: string[] = [];
      for (const ln of localNotes) {
        if (!cloudNoteIds.has(ln.id) && defaultNoteIds.has(ln.id)) {
          toDeleteNoteIds.push(ln.id);
        }
      }

      if (notesToPut.length > 0) {
        await db.notes.bulkPut(notesToPut);
      }
      if (toDeleteNoteIds.length > 0) {
        await db.notes.bulkDelete(toDeleteNoteIds);
      }
    }

    lastKnownCloudUpdatedAt = dashRes.data?.updated_at || null;
    setLocalBoard(dashboardId);
    return { success: true, hasChanges: true };
  } catch (err: any) {
    console.error('Cloud pull failed:', err);
    return { success: false, error: err.message || 'Cloud pull failed' };
  }
}
