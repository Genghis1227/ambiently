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

// Subscribe to Realtime WebSocket updates for live multi-user syncing
export function subscribeToRealtimeBoard(
  boardId: string,
  onRemoteNoteChange: (note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};

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

        onRemoteNoteChange(note, eventType);
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

// Generate or fetch shareable 6-character Invite Code for family
export async function getOrCreateInviteCode(_boardId = 'default'): Promise<{ code: string; url: string } | null> {
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
    return { code, url: shareUrl };
  } catch (err) {
    console.warn('Failed to get invite code:', err);
    return null;
  }
}

// Join a shared board via Invite Code (e.g. when family scans QR)
export async function joinBoardByCode(code: string): Promise<{ success: boolean; boardTitle?: string; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Cloud service not connected.' };

  try {
    const { data, error } = await sb
      .from('dashboards')
      .select('id, title, user_id')
      .eq('invite_code', code.trim().toUpperCase())
      .single();

    if (error || !data) {
      return { success: false, error: 'Invalid or expired invite code.' };
    }

    // Pull shared notes & tabs from that board
    const [tabsRes, notesRes, widgetsRes] = await Promise.all([
      sb.from('tabs').select('*').eq('dashboard_id', data.id),
      sb.from('notes').select('*').eq('dashboard_id', data.id),
      sb.from('widgets').select('*').eq('dashboard_id', data.id),
    ]);

    if (tabsRes.data) {
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

    await sb.from('dashboards').upsert({
      id: user.id,
      user_id: user.id,
      title: settings.dashboardTitle,
      settings: { ...settings, canvasThemes: tabThemeMeta },
      updated_at: new Date().toISOString(),
    });

    // 2. Upsert Tabs
    if (tabs.length > 0) {
      const formattedTabs = tabs.map((t) => ({
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
      await sb.from('tabs').upsert(formattedTabs);
    }

    // 3. Upsert Widgets
    if (widgets.length > 0) {
      const formattedWidgets = widgets.map((w) => ({
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
      await sb.from('widgets').upsert(formattedWidgets);
    }

    // 4. Upsert Notes
    if (notes.length > 0) {
      const formattedNotes = notes.map((n) => ({
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
      await sb.from('notes').upsert(formattedNotes);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Cloud push failed:', err);
    return { success: false, error: err.message };
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

    if (dashRes.data?.settings) {
      await db.settings.put({
        ...dashRes.data.settings,
        id: 'global',
        updated_at: dashRes.data.updated_at || new Date().toISOString(),
      });
    }

    const canvasThemes = dashRes.data?.settings?.canvasThemes || {};
    if (tabsRes.data && tabsRes.data.length > 0) {
      const mappedTabs: DashboardTab[] = tabsRes.data.map((t: any) => ({
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
      }));
      await db.tabs.bulkPut(mappedTabs);
    }

    if (widgetsRes.data && widgetsRes.data.length > 0) {
      const mappedWidgets: DashboardWidget[] = widgetsRes.data.map((w: any) => ({
        id: w.id,
        tabId: w.tab_id,
        type: w.type,
        title: w.title,
        gridPos: w.grid_pos,
        freeformPos: w.freeform_pos,
        config: w.config,
        updated_at: w.updated_at,
        deleted_at: w.deleted_at,
      }));
      await db.widgets.bulkPut(mappedWidgets);
    }

    if (notesRes.data && notesRes.data.length > 0) {
      const mappedNotes: StickyNoteItem[] = notesRes.data.map((n: any) => ({
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
      }));
      await db.notes.bulkPut(mappedNotes);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Cloud pull failed:', err);
    return { success: false, error: err.message };
  }
}
