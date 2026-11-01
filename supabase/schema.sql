-- Supabase Schema for Ambiently (dashboard.trinhism.com)
-- Multi-Tenant & Multi-User Collaboration Schema

create extension if not exists "uuid-ossp";

-- 1. Dashboards Table
create table if not exists public.dashboards (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Ambiently Command Center',
  settings jsonb not null default '{}'::jsonb,
  invite_code text unique,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 2. Dashboard Members (Multi-User Collaboration)
create table if not exists public.dashboard_members (
  id uuid primary key default uuid_generate_v4(),
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text check (role in ('owner', 'editor', 'viewer')) default 'editor',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Tabs Table
create table if not exists public.tabs (
  id text primary key,
  dashboard_id text references public.dashboards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text default 'LayoutGrid',
  layout_mode text default 'grid',
  order_index integer default 0,
  auto_rotate_duration_sec integer default 30,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 4. Widgets Table
create table if not exists public.widgets (
  id text primary key,
  dashboard_id text references public.dashboards(id) on delete cascade,
  tab_id text references public.tabs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  grid_pos jsonb not null default '{}'::jsonb,
  freeform_pos jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 5. Sticky Notes Table
create table if not exists public.notes (
  id text primary key,
  dashboard_id text references public.dashboards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  tab_id text,
  widget_id text,
  title text,
  content text default '',
  is_checklist boolean default false,
  checklist_items jsonb default '[]'::jsonb,
  bg_color text default '#fef08a',
  font_size text default 'base',
  expires_at timestamp with time zone,
  archived_at timestamp with time zone,
  freeform_pos jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 6. Enable Row Level Security (RLS)
alter table public.dashboards enable row level security;
alter table public.dashboard_members enable row level security;
alter table public.tabs enable row level security;
alter table public.widgets enable row level security;
alter table public.notes enable row level security;

-- 7. Multi-User RLS Policies:
-- Users can view/manage dashboards they own OR are members of OR join via invite_code
create policy "Owners manage dashboards" on public.dashboards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Members view shared dashboards" on public.dashboards
  for select using (
    exists (
      select 1 from public.dashboard_members
      where dashboard_members.dashboard_id = dashboards.id
      and dashboard_members.user_id = auth.uid()
    )
  );

create policy "Public invite code read" on public.dashboards
  for select using (invite_code is not null);

-- Members manage notes on boards they belong to
create policy "Users and members manage notes" on public.notes
  for all using (
    auth.uid() = user_id or
    exists (
      select 1 from public.dashboard_members
      where dashboard_members.dashboard_id = notes.dashboard_id
      and dashboard_members.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.dashboards
      where dashboards.id = notes.dashboard_id
      and dashboards.invite_code is not null
    )
  );

create policy "Users and members view tabs" on public.tabs
  for select using (
    auth.uid() = user_id or
    exists (
      select 1 from public.dashboard_members
      where dashboard_members.dashboard_id = tabs.dashboard_id
      and dashboard_members.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.dashboards
      where dashboards.id = tabs.dashboard_id
      and dashboards.invite_code is not null
    )
  );

create policy "Users and members view widgets" on public.widgets
  for select using (
    auth.uid() = user_id or
    exists (
      select 1 from public.dashboard_members
      where dashboard_members.dashboard_id = widgets.dashboard_id
      and dashboard_members.user_id = auth.uid()
    ) or
    exists (
      select 1 from public.dashboards
      where dashboards.id = widgets.dashboard_id
      and dashboards.invite_code is not null
    )
  );

-- 8. Enable Realtime Publications
alter publication supabase_realtime add table public.dashboards;
alter publication supabase_realtime add table public.tabs;
alter publication supabase_realtime add table public.widgets;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.dashboard_members;
