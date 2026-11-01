import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { db } from './db';
import type { DashboardTab, DashboardWidget, StickyNoteItem, AppSettings } from '../types/dashboard';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  // Read from Vite env or return null if not configured
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

export async function sendMagicLink(email: string): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Supabase credentials not configured in environment.' };

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.auth.signOut();
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
    // 1. Upsert Dashboard
    await sb.from('dashboards').upsert({
      id: 'default',
      user_id: user.id,
      title: settings.dashboardTitle,
      settings: settings,
      updated_at: new Date().toISOString(),
    });

    // 2. Upsert Tabs
    if (tabs.length > 0) {
      const formattedTabs = tabs.map((t) => ({
        id: t.id,
        dashboard_id: 'default',
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
    const [tabsRes, widgetsRes, notesRes] = await Promise.all([
      sb.from('tabs').select('*').eq('user_id', user.id),
      sb.from('widgets').select('*').eq('user_id', user.id),
      sb.from('notes').select('*').eq('user_id', user.id),
    ]);

    if (tabsRes.data && tabsRes.data.length > 0) {
      const mappedTabs: DashboardTab[] = tabsRes.data.map((t: any) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        order: t.order_index,
        layoutMode: t.layout_mode,
        autoRotateDurationSec: t.auto_rotate_duration_sec,
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
