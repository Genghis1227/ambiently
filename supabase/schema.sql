-- Supabase Schema for Ambiently (dashboard.trinhism.com)
-- Run this in the Supabase SQL Editor

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. User Dashboards Table
create table if not exists public.dashboards (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'Ambiently Command Center',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
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
alter table public.tabs enable row level security;
alter table public.widgets enable row level security;
alter table public.notes enable row level security;

-- 7. RLS Policies: Users can only view/mutate their own data
create policy "Users manage own dashboards" on public.dashboards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own tabs" on public.tabs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own widgets" on public.widgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 8. Enable Realtime Publications
alter publication supabase_realtime add table public.dashboards;
alter publication supabase_realtime add table public.tabs;
alter publication supabase_realtime add table public.widgets;
alter publication supabase_realtime add table public.notes;
