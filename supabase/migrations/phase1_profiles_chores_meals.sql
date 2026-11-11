-- Migration: phase1_profiles_chores_meals.sql
-- Ambiently (dashboard.trinhism.com) — Phase 1 Unified Foundation (Profiles, Chores & Meals)
--
-- Idempotent migration creating and securing all Phase 1 tables, indexes, updated_at triggers,
-- board-usage/revision triggers, Row Level Security (RLS) policies, grants, and
-- supabase_realtime publication entries.
-- Safe to run more than once in the Supabase SQL Editor.

create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. Household Profiles (`household_profiles`)
-- ============================================================================
create table if not exists public.household_profiles (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  role text check (role in ('parent', 'kid')) not null default 'kid',
  color text not null default '#6b8f71',
  avatar_data_url text,
  emoji text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists household_profiles_dashboard_updated_idx
  on public.household_profiles (dashboard_id, updated_at desc);

-- ============================================================================
-- 2. Chores, Wishlist Rewards, Trophies & Append-Only Audit Ledger
-- ============================================================================
create table if not exists public.chore_templates (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  points integer not null default 0,
  assigned_to text not null default 'shared',
  cadence text check (cadence in ('daily', 'weekdays', 'weekends', 'weekly', 'interval', 'bounty')) not null default 'daily',
  days_of_week integer[],
  weekly_any_day boolean not null default false,
  interval_days integer,
  interval_anchor_date text,
  requires_approval boolean not null default false,
  rollover_until_done boolean not null default false,
  overdue_policy text check (overdue_policy in ('zero', 'half', 'full', 'custom')) not null default 'full',
  overdue_custom_pct integer,
  icon text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists chore_templates_dashboard_updated_idx
  on public.chore_templates (dashboard_id, updated_at desc);

create table if not exists public.chore_instances (
  id text not null, -- instanceId: `${choreId}_${YYYY-MM-DD}`
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  chore_id text not null,
  date_scheduled text not null, -- YYYY-MM-DD
  status text check (status in ('pending', 'awaiting_approval', 'completed', 'expired')) not null default 'pending',
  completed_by jsonb default '[]'::jsonb,
  completed_at timestamp with time zone,
  is_overdue boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

create index if not exists chore_instances_dashboard_date_idx
  on public.chore_instances (dashboard_id, date_scheduled desc);
create index if not exists chore_instances_dashboard_updated_idx
  on public.chore_instances (dashboard_id, updated_at desc);

create table if not exists public.wishlist_rewards (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  profile_id text not null,
  title text not null,
  source_url text,
  image_url text,
  raw_price numeric(10, 2),
  points_cost integer not null default 0,
  status text check (status in ('needs_pricing', 'active_goal', 'unlocked', 'pending_fulfillment', 'fulfilled')) not null default 'needs_pricing',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  priced_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists wishlist_rewards_dashboard_profile_idx
  on public.wishlist_rewards (dashboard_id, profile_id);
create index if not exists wishlist_rewards_dashboard_updated_idx
  on public.wishlist_rewards (dashboard_id, updated_at desc);

create table if not exists public.chore_trophies (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  year integer not null,
  profile_id text not null,
  item_name text not null,
  points_spent integer not null default 0,
  date_fulfilled timestamp with time zone not null,
  image_url text,
  source_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

create index if not exists chore_trophies_dashboard_year_idx
  on public.chore_trophies (dashboard_id, year desc, profile_id);

create table if not exists public.chore_ledger (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  timestamp timestamp with time zone not null default timezone('utc'::text, now()),
  type text check (type in ('chore_completion', 'reward_redemption', 'manual_adjustment', 'reversion')) not null,
  ref_id text not null,
  profile_id text not null,
  points_delta integer not null,
  note text,
  approved_by text check (approved_by in ('pin', 'auto')),
  can_revert boolean not null default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

create index if not exists chore_ledger_dashboard_timestamp_idx
  on public.chore_ledger (dashboard_id, timestamp desc);
create index if not exists chore_ledger_dashboard_profile_idx
  on public.chore_ledger (dashboard_id, profile_id);

create table if not exists public.chore_settings (
  id text not null default 'household_chores',
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  vacation_mode boolean not null default false,
  points_per_dollar integer not null default 10,
  sound_effects_enabled boolean not null default false,
  last_rollover_date text,
  last_pruned_year integer,
  last_parent_action_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

-- ============================================================================
-- 3. Meal Planner, Recipes, Smart Shopping List & Staples
-- ============================================================================
create table if not exists public.meal_recipes (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  source_url text,
  image_url text,
  servings text,
  prep_time text,
  cook_time text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists meal_recipes_dashboard_updated_idx
  on public.meal_recipes (dashboard_id, updated_at desc);

create table if not exists public.scheduled_meals (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  date text not null, -- YYYY-MM-DD
  slot text check (slot in ('breakfast', 'lunch', 'dinner')) not null,
  title text not null,
  recipe_id text,
  cook_profile_id text,
  scale_factor numeric(6, 2) not null default 1,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists scheduled_meals_dashboard_date_idx
  on public.scheduled_meals (dashboard_id, date asc);
create index if not exists scheduled_meals_dashboard_updated_idx
  on public.scheduled_meals (dashboard_id, updated_at desc);

create table if not exists public.shopping_list_items (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  normalized_key text not null,
  item_name text not null,
  display_label text not null,
  components jsonb not null default '[]'::jsonb,
  category text not null default 'Household & Other',
  checked boolean not null default false,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists shopping_list_items_dashboard_checked_idx
  on public.shopping_list_items (dashboard_id, checked, category);
create index if not exists shopping_list_items_dashboard_updated_idx
  on public.shopping_list_items (dashboard_id, updated_at desc);

create table if not exists public.meal_staples (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  default_quantity numeric(10, 2),
  default_unit text,
  category text not null default 'Household & Other',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

create index if not exists meal_staples_dashboard_updated_idx
  on public.meal_staples (dashboard_id, updated_at desc);

create table if not exists public.meal_settings (
  id text not null default 'household_meals',
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  aisle_order jsonb not null default '["Produce","Bakery","Meat & Seafood","Dairy & Eggs","Pantry & Dry Goods","Frozen","Beverages","Household & Other"]'::jsonb,
  week_starts_on text check (week_starts_on in ('sunday', 'monday')) not null default 'sunday',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (dashboard_id, id)
);

-- ============================================================================
-- 4. Automatic `updated_at` Row Trigger
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
  foreach t in array array[
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
    'meal_settings'
  ] loop
    execute format('drop trigger if exists set_%1$I_updated_at on public.%1$I', t);
    execute format(
      'create trigger set_%1$I_updated_at before update on public.%1$I
       for each row execute function private.set_row_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- 5. Row Level Security (RLS), Policies & Least-Privilege Grants
-- ============================================================================
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
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
    'meal_settings'
  ] loop
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
-- 6. Board Usage Accounting, Limit Guards & Board Revision Touch Triggers
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
    'meal_settings'
  ] loop
    execute format('select sum(%s) from public.%I r where r.%I = $1',
      private.row_size_expression(t, 'r'), t, case when t = 'dashboards' then 'id' else 'dashboard_id' end)
      into part using target;
    bytes := bytes + coalesce(part, 0);
  end loop;
  select count(*) into members from public.dashboard_members m where m.dashboard_id = target;
end $$;

revoke all on function private.board_usage(text) from public, anon;
grant execute on function private.board_usage(text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
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
    'meal_settings'
  ] loop
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
-- 7. Supabase Realtime Publication Entries (Idempotent)
-- ============================================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array[
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
    'meal_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
