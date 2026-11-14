-- Migration: kanban_boards_and_cards.sql
-- Ambiently (dashboard.trinhism.com)
--
-- Multi-Board Kanban Engine tables synced across kiosk and mobile companion browsers via Supabase Realtime.
-- Follows Ambiently's per-board multi-tenant composite primary keys (dashboard_id, id), RLS policies,
-- statement-level board size limits, automatic updated_at row triggers, board revision touch triggers,
-- and idempotent Supabase Realtime publication registration.
--
-- Safe to run multiple times in the Supabase SQL Editor. Afterwards, run supabase/security-check.sql.

-- ============================================================================
-- 1. Kanban Boards Table
-- ============================================================================
create table if not exists public.kanban_boards (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  auto_archive_days integer check (auto_archive_days is null or auto_archive_days > 0),
  sort_order double precision not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

create index if not exists kanban_boards_dashboard_sort_idx
  on public.kanban_boards (dashboard_id, sort_order asc);
create index if not exists kanban_boards_dashboard_updated_idx
  on public.kanban_boards (dashboard_id, updated_at desc);

-- ============================================================================
-- 2. Kanban Cards Table
-- ============================================================================
create table if not exists public.kanban_cards (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  board_id text not null,
  column_id text check (column_id in ('todo', 'in_progress', 'done')) not null default 'todo',
  title text not null,
  tag_color text,
  tag_label text,
  assignee_ids text[] not null default '{}'::text[],
  checklist jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  is_archived boolean not null default false,
  completed_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id),
  constraint kanban_cards_board_fk
    foreign key (dashboard_id, board_id)
    references public.kanban_boards (dashboard_id, id)
    on delete cascade
);

create index if not exists kanban_cards_board_column_archive_sort_idx
  on public.kanban_cards (board_id, column_id, is_archived, sort_order);
create index if not exists kanban_cards_dashboard_board_column_sort_idx
  on public.kanban_cards (dashboard_id, board_id, column_id, is_archived, sort_order);
create index if not exists kanban_cards_dashboard_updated_idx
  on public.kanban_cards (dashboard_id, updated_at desc);

-- Ensure Realtime DELETE events include dashboard_id / old columns for subscription filtering
alter table public.kanban_boards replica identity full;
alter table public.kanban_cards replica identity full;

-- ============================================================================
-- 3. Automatic `updated_at` Row Triggers
-- ============================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.set_row_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end $$;

revoke all on function private.set_row_updated_at() from public, anon;
grant execute on function private.set_row_updated_at() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['kanban_boards', 'kanban_cards'] loop
    execute format('drop trigger if exists set_%1$I_updated_at on public.%1$I', t);
    execute format(
      'create trigger set_%1$I_updated_at before update on public.%1$I
       for each row execute function private.set_row_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- 4. Row Level Security (RLS), Policies & Least-Privilege Grants
-- ============================================================================
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['kanban_boards', 'kanban_cards'] loop
    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy "Members read %1$s" on public.%1$I
       for select to authenticated
       using (private.can_read_dashboard(dashboard_id))', t);
    execute format(
      'create policy "Editors add %1$s" on public.%1$I
       for insert to authenticated
       with check (private.can_edit_dashboard(dashboard_id) and user_id = private.dashboard_owner(dashboard_id))', t);
    execute format(
      'create policy "Editors change %1$s" on public.%1$I
       for update to authenticated
       using (private.can_edit_dashboard(dashboard_id))
       with check (private.can_edit_dashboard(dashboard_id) and user_id = private.dashboard_owner(dashboard_id))', t);
    execute format(
      'create policy "Editors delete %1$s" on public.%1$I
       for delete to authenticated
       using (private.can_edit_dashboard(dashboard_id))', t);

    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================================
-- 5. Board Usage Accounting, Limit Guards & Board Revision Touch Triggers
-- ============================================================================
create or replace function private.board_usage(target text, out bytes bigint, out members bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  part bigint;
begin
  bytes := 0;
  foreach t in array array[
    'dashboards',
    'dashboard_members',
    'tabs',
    'widgets',
    'notes',
    'household_profiles',
    'chore_templates',
    'chore_instances',
    'wishlist_rewards',
    'chore_trophies',
    'chore_ledger',
    'chore_settings',
    'meal_recipes',
    'scheduled_meals',
    'shopping_list_items',
    'meal_staples',
    'meal_settings',
    'kanban_boards',
    'kanban_cards'
  ] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('select sum(%s) from public.%I r where r.%I = $1',
        private.row_size_expression(t, 'r'), t, case when t = 'dashboards' then 'id' else 'dashboard_id' end)
        into part using target;
      bytes := bytes + coalesce(part, 0);
    end if;
  end loop;
  select count(*) into members from public.dashboard_members m where m.dashboard_id = target;
end $$;

revoke all on function private.board_usage(text) from public, anon;
grant execute on function private.board_usage(text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['kanban_boards', 'kanban_cards'] loop
    -- Board size limit triggers
    execute format('drop trigger if exists check_board_limits_insert on public.%I', t);
    execute format('drop trigger if exists check_board_limits_update on public.%I', t);
    execute format(
      'create trigger check_board_limits_insert after insert on public.%I
       referencing new table as new_rows
       for each statement execute function private.check_board_limits()', t);
    execute format(
      'create trigger check_board_limits_update after update on public.%I
       referencing old table as old_rows new table as new_rows
       for each statement execute function private.check_board_limits()', t);

    -- Board revision touch triggers
    execute format('drop trigger if exists touch_dashboard_on_%1$I_insert on public.%1$I', t);
    execute format('drop trigger if exists touch_dashboard_on_%1$I_update on public.%1$I', t);
    execute format('drop trigger if exists touch_dashboard_on_%1$I_delete on public.%1$I', t);
    execute format(
      'create trigger touch_dashboard_on_%1$I_insert after insert on public.%1$I
       referencing new table as new_rows
       for each statement execute function private.touch_dashboard_updated_at()', t);
    execute format(
      'create trigger touch_dashboard_on_%1$I_update after update on public.%1$I
       referencing old table as old_rows new table as new_rows
       for each statement execute function private.touch_dashboard_updated_at()', t);
    execute format(
      'create trigger touch_dashboard_on_%1$I_delete after delete on public.%1$I
       referencing old table as old_rows
       for each statement execute function private.touch_dashboard_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- 6. Supabase Realtime Publication Entries (Idempotent)
-- Equivalent to: ALTER PUBLICATION supabase_realtime ADD TABLE kanban_boards, kanban_cards;
-- ============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['kanban_boards', 'kanban_cards'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
