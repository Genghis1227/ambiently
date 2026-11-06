import { createClient, type SupabaseClient, type User, type RealtimeChannel } from '@supabase/supabase-js';
import { db } from './db';
import type { DashboardTab, DashboardWidget, StickyNoteItem, AppSettings } from '../types/dashboard';

let supabaseClient: SupabaseClient | null = null;
let realtimeChannel: RealtimeChannel | null = null;

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
    await sb.auth.signOut();
  }
}

export interface RealtimeBoardHandlers {
  onRemoteNoteChange?: (note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onRemoteWidgetChange?: (widget: DashboardWidget, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onRemoteTabChange?: (tab: DashboardTab, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
}

// Subscribe to Realtime WebSocket updates for live multi-user syncing (Notes, Widgets, Canvases)
export function subscribeToRealtimeBoard(
  boardId: string,
  handlers:
    | RealtimeBoardHandlers
    | ((note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void)
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

  const noteHandler = typeof handlers === 'function' ? handlers : handlers.onRemoteNoteChange;
  const widgetHandler = typeof handlers === 'object' ? handlers.onRemoteWidgetChange : undefined;
  const tabHandler = typeof handlers === 'object' ? handlers.onRemoteTabChange : undefined;

  if (realtimeChannel) {
    sb.removeChannel(realtimeChannel);
  }

  realtimeChannel = sb
    .channel(`dashboard-realtime-${boardId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
      },
      (payload) => {
        if (!noteHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;

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
      },
      (payload) => {
        if (!widgetHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;

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
      },
      (payload) => {
        if (!tabHandler) return;
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const raw = (payload.new || payload.old) as any;
        if (!raw) return;

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
    .subscribe();

  return () => {
    if (realtimeChannel && sb) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

export interface InviteData {
  code: string;
  url: string;           // Family / Kids URL (no account required)
  adminPairUrl?: string; // One-tap session pairing URL (for admin / spouse)
  userEmail?: string;
}

// Generate or fetch shareable 6-character Invite Code for family & admin pairing
export async function getOrCreateInviteCode(_boardId = 'default'): Promise<InviteData | null> {
  const sb = getSupabase();
  const user = await getCurrentUser();
  if (!sb || !user) return null;

  try {
    const { data } = await sb.from('dashboards').select('invite_code').eq('user_id', user.id).maybeSingle();
    let code = data?.invite_code;

    if (!code) {
      // Generate clean 6-character uppercase code (e.g. TRINH7)
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      if (data) {
        await sb.from('dashboards').update({ invite_code: code }).eq('user_id', user.id);
      } else {
        await sb.from('dashboards').upsert({
          id: user.id,
          user_id: user.id,
          title: 'Ambiently Command Center',
          settings: {},
          invite_code: code,
          updated_at: new Date().toISOString(),
        });
      }
    }

    const shareUrl = `${window.location.origin}/?join=${code}`;
    let adminPairUrl: string | undefined = undefined;

    const { data: sessionData } = await sb.auth.getSession();
    if (sessionData?.session) {
      const { access_token, refresh_token } = sessionData.session;
      adminPairUrl = `${window.location.origin}/?join=${code}#access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&token_type=bearer&type=recovery`;
    }

    return { code, url: shareUrl, adminPairUrl, userEmail: user.email };
  } catch (err) {
    console.warn('Failed to get invite code:', err);
    return null;
  }
}

// Join a shared board via Invite Code (e.g. when family scans QR or enters 6-digit code)
export async function joinBoardByCode(code: string): Promise<{ success: boolean; boardTitle?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Cloud service not connected.' };

  try {
    const { data, error } = await sb
      .from('dashboards')
      .select('id, title, user_id, settings, updated_at')
      .eq('invite_code', code.trim().toUpperCase())
      .single();

    if (error || !data) {
      return { success: false, error: 'Invalid or expired invite code.' };
    }

    // Persist joined dashboard info in localStorage for offline persistence & unauthenticated syncing
    localStorage.setItem('joined_dashboard_id', data.id);
    localStorage.setItem('joined_owner_id', data.user_id);
    localStorage.setItem('joined_board_title', data.title || 'Family Board');
    localStorage.setItem('joined_invite_code', code.trim().toUpperCase());

    // Pull shared notes, tabs, and widgets from that board
    const [tabsRes, notesRes, widgetsRes] = await Promise.all([
      sb.from('tabs').select('*').eq('dashboard_id', data.id),
      sb.from('notes').select('*').eq('dashboard_id', data.id),
      sb.from('widgets').select('*').eq('dashboard_id', data.id),
    ]);

    // Apply dashboard settings (wallpapers, clock format, themes, common photos)
    if (data.settings) {
      await db.settings.put({
        ...data.settings,
        id: 'global',
        updated_at: data.updated_at || new Date().toISOString(),
      });
    }

    // Clean up local seeded default notes and default widgets so they don't mix with the real board
    const defaultNoteIds = ['note-welcome', 'note-groceries'];
    await db.notes.bulkDelete(defaultNoteIds);

    const defaultWidgetIds = ['widget-clock', 'widget-notes-tile', 'widget-photo-tile', 'widget-countdown-tile'];
    if (widgetsRes.data && widgetsRes.data.length > 0) {
      await db.widgets.bulkDelete(defaultWidgetIds);
    }

    if (tabsRes.data && tabsRes.data.length > 0) {
      await db.tabs.bulkDelete(['tab-corkboard']);
      await db.tabs.bulkPut(
        tabsRes.data.map((t: any) => ({
          id: t.id,
          name: t.name,
          icon: t.icon,
          order: t.order_index,
          layoutMode: t.layout_mode,
          autoRotateDurationSec: t.auto_rotate_duration_sec,
          updated_at: t.updated_at,
          deleted_at: t.deleted_at,
        }))
      );
    }

    if (notesRes.data) {
      await db.notes.bulkPut(
        notesRes.data.map((n: any) => ({
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
        }))
      );
    }

    if (widgetsRes.data) {
      await db.widgets.bulkPut(
        widgetsRes.data.map((w: any) => ({
          id: w.id,
          tabId: w.tab_id,
          type: w.type,
          title: w.title,
          gridPos: w.grid_pos,
          freeformPos: w.freeform_pos,
          config: w.config,
          updated_at: w.updated_at,
          deleted_at: w.deleted_at,
        }))
      );
    }

    return { success: true, boardTitle: data.title };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Push notes to joined board for family members / kids without an account
export async function pushNotesToJoinedBoard(notes: StickyNoteItem[]): Promise<void> {
  const sb = getSupabase();
  const dashboardId = localStorage.getItem('joined_dashboard_id');
  const ownerId = localStorage.getItem('joined_owner_id');
  if (!sb || !dashboardId || !ownerId) return;

  try {
    const notesToUpsert = notes.map((n) => ({
      id: n.id,
      dashboard_id: dashboardId,
      user_id: ownerId,
      tab_id: n.tabId,
      widget_id: n.widgetId,
      title: n.title,
      content: n.content || '',
      is_checklist: Boolean(n.isChecklist),
      checklist_items: n.checklistItems || [],
      bg_color: n.bgColor || '#fef08a',
      font_size: n.fontSize || 'base',
      expires_at: n.expiresAt,
      archived_at: n.archivedAt,
      freeform_pos: n.freeformPos || {},
      updated_at: n.updated_at || new Date().toISOString(),
      deleted_at: n.deleted_at,
    }));

    if (notesToUpsert.length > 0) {
      await sb.from('notes').upsert(notesToUpsert);
    }
  } catch (err) {
    console.warn('Failed to push notes to joined board:', err);
  }
}

// Disconnect from a joined board (resets member mode on mobile)
export function leaveJoinedBoard(): void {
  localStorage.removeItem('joined_dashboard_id');
  localStorage.removeItem('joined_owner_id');
  localStorage.removeItem('joined_board_title');
  localStorage.removeItem('joined_invite_code');
}

// Check if currently operating as a joined family member
export function getJoinedBoardInfo(): { dashboardId: string; title: string; code: string } | null {
  const dashboardId = localStorage.getItem('joined_dashboard_id');
  if (!dashboardId) return null;
  return {
    dashboardId,
    title: localStorage.getItem('joined_board_title') || 'Family Board',
    code: localStorage.getItem('joined_invite_code') || '',
  };
}

// Push local Dexie snapshot to Supabase Cloud
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
    // 1. Upsert Dashboard (includes tab metadata such as backgroundTheme and custom wallpapers)
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

    const { error: dashErr } = await sb.from('dashboards').upsert({
      id: user.id,
      user_id: user.id,
      title: settings.dashboardTitle,
      settings: { ...settings, canvasThemes: tabThemeMeta },
      updated_at: new Date().toISOString(),
    });
    if (dashErr) throw dashErr;

    // 2. Query Dexie to include all active and soft-deleted records so remote devices sync additions and deletions
    const [dbTabs, dbWidgets, dbNotes] = await Promise.all([
      db.tabs.toArray(),
      db.widgets.toArray(),
      db.notes.toArray(),
    ]);

    const tabsToPush = dbTabs.length > 0 ? dbTabs : tabs;
    const widgetsToPush = dbWidgets.length > 0 ? dbWidgets : widgets;
    const notesToPush = dbNotes.length > 0 ? dbNotes : notes;

    // 3. Query remote updated_at timestamps to avoid stomping newer remote edits from other devices
    const [remoteTabsRes, remoteWidgetsRes, remoteNotesRes] = await Promise.all([
      sb.from('tabs').select('id, updated_at').eq('user_id', user.id),
      sb.from('widgets').select('id, updated_at').eq('user_id', user.id),
      sb.from('notes').select('id, updated_at').eq('user_id', user.id),
    ]);

    const remoteTabsMap = new Map((remoteTabsRes.data || []).map((t: any) => [t.id, new Date(t.updated_at || 0).getTime()]));
    const remoteWidgetsMap = new Map((remoteWidgetsRes.data || []).map((w: any) => [w.id, new Date(w.updated_at || 0).getTime()]));
    const remoteNotesMap = new Map((remoteNotesRes.data || []).map((n: any) => [n.id, new Date(n.updated_at || 0).getTime()]));

    // Upsert Tabs
    if (tabsToPush.length > 0) {
      const formattedTabs = tabsToPush.map((t) => ({
        id: t.id,
        dashboard_id: user.id,
        user_id: user.id,
        name: t.name,
        icon: t.icon,
        layout_mode: t.layoutMode,
        order_index: t.order,
        auto_rotate_duration_sec: t.autoRotateDurationSec,
        updated_at: t.updated_at,
        deleted_at: t.deleted_at || null,
      }));

      const tabsToUpsert = formattedTabs.filter((t) => {
        const remoteTime = remoteTabsMap.get(t.id);
        if (remoteTime === undefined) return true;
        return new Date(t.updated_at || 0).getTime() >= remoteTime;
      });

      if (tabsToUpsert.length > 0) {
        const { error: tabErr } = await sb.from('tabs').upsert(tabsToUpsert);
        if (tabErr) throw tabErr;
      }
    }

    // Upsert Widgets
    if (widgetsToPush.length > 0) {
      const formattedWidgets = widgetsToPush.map((w) => ({
        id: w.id,
        dashboard_id: user.id,
        tab_id: w.tabId,
        user_id: user.id,
        type: w.type,
        title: w.title,
        grid_pos: w.gridPos,
        freeform_pos: w.freeformPos,
        config: w.config,
        updated_at: w.updated_at,
        deleted_at: w.deleted_at || null,
      }));

      const widgetsToUpsert = formattedWidgets.filter((w) => {
        const remoteTime = remoteWidgetsMap.get(w.id);
        if (remoteTime === undefined) return true;
        return new Date(w.updated_at || 0).getTime() >= remoteTime;
      });

      if (widgetsToUpsert.length > 0) {
        const { error: widgetErr } = await sb.from('widgets').upsert(widgetsToUpsert);
        if (widgetErr) throw widgetErr;
      }
    }

    // Upsert Notes
    if (notesToPush.length > 0) {
      const formattedNotes = notesToPush.map((n) => ({
        id: n.id,
        dashboard_id: user.id,
        user_id: user.id,
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

      const notesToUpsert = formattedNotes.filter((n) => {
        const remoteTime = remoteNotesMap.get(n.id);
        if (remoteTime === undefined) return true;
        return new Date(n.updated_at || 0).getTime() >= remoteTime;
      });

      if (notesToUpsert.length > 0) {
        const { error: noteErr } = await sb.from('notes').upsert(notesToUpsert);
        if (noteErr) throw noteErr;
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Cloud push failed:', err);
    return { success: false, error: err.message || 'Cloud backup failed' };
  }
}

// Pull latest changes from Supabase Cloud to local Dexie
export async function pullFromCloud(): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  const user = await getCurrentUser();
  if (!sb || !user) return { success: false, error: 'Not authenticated' };

  try {
    const [dashRes, tabsRes, widgetsRes, notesRes] = await Promise.all([
      sb.from('dashboards').select('*').eq('user_id', user.id).maybeSingle(),
      sb.from('tabs').select('*').eq('user_id', user.id),
      sb.from('widgets').select('*').eq('user_id', user.id),
      sb.from('notes').select('*').eq('user_id', user.id),
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

    return { success: true };
  } catch (err: any) {
    console.error('Cloud pull failed:', err);
    return { success: false, error: err.message || 'Cloud pull failed' };
  }
}
