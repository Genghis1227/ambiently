import { createClient, type SupabaseClient, type User, type RealtimeChannel } from '@supabase/supabase-js';
import { db } from './db';
import { stripPlexTokens } from './plexLinks';
import type { DashboardTab, DashboardWidget, StickyNoteItem, AppSettings } from '../types/dashboard';

let supabaseClient: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let realtimeConnectionActive = false;
let cachedDashboardTarget: {
  userId: string;
  result: { dashboardId: string; ownerId: string; isMember: boolean };
  expiresAt: number;
} | null = null;
let lastKnownCloudUpdatedAt: string | null = null;

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

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

  const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      if (window.location.hash.includes('access_token') || window.location.search.includes('code=')) {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
    callback(session?.user ?? null);
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
          order: raw.order_index,
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

    // 1. Query Dexie to include all active and soft-deleted records so remote devices sync additions and deletions
    const [dbTabs, dbWidgets, dbNotes] = await Promise.all([
      db.tabs.toArray(),
      db.widgets.toArray(),
      db.notes.toArray(),
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
    const remoteDashTime = remoteDashRes.data?.updated_at
      ? new Date(remoteDashRes.data.updated_at).getTime()
      : 0;
    const localDashTime = new Date(settings.updated_at || 0).getTime();
    const shouldUpsertDash = !isMember && (!remoteDashRes.data || localDashTime > remoteDashTime);

    // Upsert Tabs: only send tabs with genuinely newer timestamps or new records
    let tabsToUpsert: any[] = [];
    if (tabsToPush.length > 0) {
      const formattedTabs = tabsToPush.map((t) => ({
        id: t.id,
        dashboard_id: dashboardId,
        user_id: ownerId,
        name: t.name,
        icon: t.icon,
        layout_mode: t.layoutMode,
        order_index: t.order,
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
      const formattedWidgets = widgetsToPush.map((w) => ({
        id: w.id,
        dashboard_id: dashboardId,
        tab_id: w.tabId,
        user_id: ownerId,
        type: w.type,
        title: w.title,
        grid_pos: w.gridPos,
        freeform_pos: w.freeformPos,
        config: stripPlexTokens(w.config),
        updated_at: w.updated_at,
        deleted_at: w.deleted_at || null,
      }));

      widgetsToUpsert = formattedWidgets.filter((w) => {
        const remoteTime = remoteWidgetsMap.get(w.id);
        if (remoteTime === undefined) return true;
        return new Date(w.updated_at || 0).getTime() > remoteTime;
      });
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
        title: n.title,
        content: n.content,
        is_checklist: n.isChecklist,
        checklist_items: n.checklistItems || [],
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
      return { success: true };
    }

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

      const cloudSafeSettings = stripPlexTokens({
        ...settings,
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
      if (dashErr) throw dashErr;
    } else if (hasAnyItemUpserted && !isMember) {
      // Touch dashboard updated_at so all remote clients recognize the board revision change
      await sb.from('dashboards').update({ updated_at: nowIso }).eq('id', dashboardId);
    }

    if (tabsToUpsert.length > 0) {
      const { error: tabErr } = await sb.from('tabs').upsert(tabsToUpsert);
      if (tabErr) throw tabErr;
    }

    if (widgetsToUpsert.length > 0) {
      const { error: widgetErr } = await sb.from('widgets').upsert(widgetsToUpsert);
      if (widgetErr) throw widgetErr;
    }

    if (notesToUpsert.length > 0) {
      const { error: noteErr } = await sb.from('notes').upsert(notesToUpsert);
      if (noteErr) throw noteErr;
    }

    lastKnownCloudUpdatedAt = nowIso;
    return { success: true };
  } catch (err: any) {
    console.error('Cloud push failed:', err);
    return { success: false, error: err.message || 'Cloud backup failed' };
  }
}

// Pull latest changes from Supabase Cloud to local Dexie (Strictly authenticated only)
export async function pullFromCloud(options?: { force?: boolean }): Promise<{ success: boolean; hasChanges?: boolean; error?: string }> {
  const sb = getSupabase();
  const user = await getCurrentUser();
  if (!sb || !user) return { success: false, error: 'Not authenticated' };

  try {
    const target = await resolveActiveDashboardId();
    const dashboardId = target?.dashboardId || user.id;

    // Fast-path: Check lightweight dashboard revision before scanning full tables with JSON payloads
    if (!options?.force) {
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

    if (!dashRes.data && (!tabsRes.data || tabsRes.data.length === 0) && (!widgetsRes.data || widgetsRes.data.length === 0)) {
      return { success: false, error: 'No cloud backup found for this account.' };
    }

    if (dashRes.data?.settings) {
      const currentSettings = await db.settings.get('global');
      const localTime = new Date(currentSettings?.updated_at || 0).getTime();
      const cloudTime = new Date(dashRes.data.updated_at || 0).getTime();
      if (cloudTime >= localTime || !currentSettings) {
        await db.settings.put({
          ...dashRes.data.settings,
          // Preserve local device PIN lock state rather than overwriting from cloud
          pinHash: currentSettings?.pinHash ?? null,
          pinLockEnabled: currentSettings?.pinLockEnabled ?? false,
          id: 'global',
          updated_at: dashRes.data.updated_at || new Date().toISOString(),
        });
      }
    }

    const canvasThemes = dashRes.data?.settings?.canvasThemes || {};
    if (tabsRes.data && tabsRes.data.length > 0) {
      const localTabs = await db.tabs.toArray();
      const localMap = new Map(localTabs.map((t) => [t.id, t]));
      const cloudTabIds = new Set(tabsRes.data.map((t: any) => t.id));

      const tabsToPut: DashboardTab[] = [];
      for (const t of tabsRes.data) {
        const mapped: DashboardTab = {
          id: t.id,
          name: t.name,
          icon: t.icon,
          order: t.order_index,
          layoutMode: t.layout_mode,
          autoRotateDurationSec: t.auto_rotate_duration_sec,
          backgroundTheme: canvasThemes[t.id]?.backgroundTheme || t.background_theme || 'midnight_dots',
          customWallpaperUrl: canvasThemes[t.id]?.customWallpaperUrl || t.custom_wallpaper_url,
          backgroundDimLevel: canvasThemes[t.id]?.backgroundDimLevel ?? t.background_dim_level ?? 45,
          hideNotes: canvasThemes[t.id]?.hideNotes ?? t.hide_notes ?? false,
          isHome: canvasThemes[t.id]?.isHome ?? t.is_home ?? false,
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
            tabsToPut.push(mapped);
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
      const localWidgets = await db.widgets.toArray();
      const localMap = new Map(localWidgets.map((w) => [w.id, w]));
      const cloudWidgetIds = new Set(widgetsRes.data.map((w: any) => w.id));

      const widgetsToPut: DashboardWidget[] = [];
      for (const w of widgetsRes.data) {
        const mapped: DashboardWidget = {
          id: w.id,
          tabId: w.tab_id,
          type: w.type,
          title: w.title,
          gridPos: w.grid_pos,
          freeformPos: w.freeform_pos,
          config: w.config,
          updated_at: w.updated_at,
          deleted_at: w.deleted_at,
        };

        const local = localMap.get(w.id);
        if (!local) {
          widgetsToPut.push(mapped);
        } else {
          const localTime = new Date(local.updated_at || 0).getTime();
          const cloudTime = new Date(mapped.updated_at || 0).getTime();
          if (cloudTime >= localTime) {
            widgetsToPut.push(mapped);
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
            notesToPut.push(mapped);
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

    lastKnownCloudUpdatedAt = dashRes.data?.updated_at || new Date().toISOString();
    return { success: true, hasChanges: true };
  } catch (err: any) {
    console.error('Cloud pull failed:', err);
    return { success: false, error: err.message || 'Cloud pull failed' };
  }
}
