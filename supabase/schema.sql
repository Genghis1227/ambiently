-- Supabase Schema for Ambiently (dashboard.trinhism.com)
-- Multi-Tenant & Multi-User Collaboration Schema
--
-- Safe to run more than once, on a new project or over any earlier version of this file.
-- Run supabase/security-check.sql afterwards to confirm the result.

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

alter table public.dashboards add column if not exists invite_code text unique;

-- 2. Dashboard Members (Multi-User Collaboration)
-- A row is an invitation until the invited person sets accepted_at. Only then does it grant access.
create table if not exists public.dashboard_members (
  id uuid primary key default uuid_generate_v4(),
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text check (role in ('owner', 'editor', 'viewer')) default 'editor',
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.dashboard_members add column if not exists accepted_at timestamp with time zone;

-- Emails are stored lowercase, once per board, so they compare exactly
update public.dashboard_members set email = lower(trim(email)) where email <> lower(trim(email));
delete from public.dashboard_members where user_id is null and email is null;
delete from public.dashboard_members a using public.dashboard_members b
  where a.dashboard_id = b.dashboard_id
  and a.email = b.email
  and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists dashboard_members_board_email_key on public.dashboard_members (dashboard_id, email);
create index if not exists dashboard_members_email_idx on public.dashboard_members (email);
create index if not exists dashboard_members_user_id_idx on public.dashboard_members (user_id);

alter table public.dashboard_members drop constraint if exists dashboard_members_identity_check;
alter table public.dashboard_members add constraint dashboard_members_identity_check
  check (user_id is not null or email is not null);
alter table public.dashboard_members drop constraint if exists dashboard_members_email_lowercase;
alter table public.dashboard_members add constraint dashboard_members_email_lowercase
  check (email = lower(email));

-- 3. Tabs Table
create table if not exists public.tabs (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text default 'LayoutGrid',
  layout_mode text default 'grid',
  order_index integer default 0,
  auto_rotate_duration_sec integer default 30,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

alter table public.tabs add column if not exists dashboard_id text references public.dashboards(id) on delete cascade;

-- 4. Widgets Table
create table if not exists public.widgets (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
  tab_id text,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null,
  title text not null,
  grid_pos jsonb not null default '{}'::jsonb,
  freeform_pos jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

alter table public.widgets add column if not exists dashboard_id text references public.dashboards(id) on delete cascade;
alter table public.widgets drop constraint if exists widgets_tab_id_fkey;

-- 5. Sticky Notes Table
create table if not exists public.notes (
  id text not null,
  dashboard_id text references public.dashboards(id) on delete cascade not null,
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
  deleted_at timestamp with time zone,
  primary key (dashboard_id, id)
);

alter table public.notes add column if not exists dashboard_id text references public.dashboards(id) on delete cascade;

-- Every account starts with the same default ids (such as tab-corkboard), so a row is identified by
-- board and id together. With id alone, the second account to sync was refused.
do $$
declare
  t text;
begin
  foreach t in array array['tabs', 'widgets', 'notes'] loop
    execute format(
      'insert into public.dashboards (id, user_id)
       select distinct user_id::text, user_id from public.%I where dashboard_id is null
       on conflict (id) do nothing', t);
    execute format('update public.%I set dashboard_id = user_id::text where dashboard_id is null', t);
    execute format('alter table public.%I alter column dashboard_id set not null', t);

    if not exists (
      select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
      where i.indrelid = format('public.%I', t)::regclass
      and i.indisprimary
      and a.attname = 'dashboard_id'
    ) then
      execute format('alter table public.%I drop constraint if exists %I', t, t || '_pkey');
      execute format('alter table public.%I add primary key (dashboard_id, id)', t);
    end if;
  end loop;
end $$;

-- 6. Access Helpers
-- These live outside the public schema so the API can't call them, and they run with search_path
-- set to empty so nothing a caller creates can stand in for the tables they read.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- The signed-in user's email, read from auth.users and only once confirmed. Claims inside a token
-- can be out of date, and the email on an unconfirmed account proves nothing.
create or replace function private.current_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create or replace function private.is_me(member_user_id uuid, member_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(member_user_id = auth.uid(), false)
    or coalesce(member_email = private.current_email(), false)
$$;

create or replace function private.dashboard_owner(target text) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.user_id from public.dashboards d where d.id = target
$$;

create or replace function private.owns_dashboard(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.dashboard_owner(target) = auth.uid(), false)
$$;

create or replace function private.can_read_dashboard(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.owns_dashboard(target) or exists (
    select 1 from public.dashboard_members m
    where m.dashboard_id = target
    and m.accepted_at is not null
    and private.is_me(m.user_id, m.email)
  )
$$;

create or replace function private.can_edit_dashboard(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.owns_dashboard(target) or exists (
    select 1 from public.dashboard_members m
    where m.dashboard_id = target
    and m.accepted_at is not null
    and m.role in ('owner', 'editor')
    and private.is_me(m.user_id, m.email)
  )
$$;

-- The boards that have invited the signed-in user, with what they need to decide. Before accepting
-- they can't read the board itself, so this is how they see whose invitation it is.
create or replace function public.get_my_invitations()
returns table (id uuid, role text, accepted_at timestamp with time zone, board_title text, owner_email text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.role, m.accepted_at, d.title, u.email::text
  from public.dashboard_members m
  join public.dashboards d on d.id = m.dashboard_id
  join auth.users u on u.id = d.user_id
  where private.is_me(m.user_id, m.email)
  and d.user_id <> auth.uid()
  order by m.created_at
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke all on function public.get_my_invitations() from public, anon;
grant execute on function public.get_my_invitations() to authenticated;

-- 7. Enable Row Level Security (RLS)
alter table public.dashboards enable row level security;
alter table public.dashboard_members enable row level security;
alter table public.tabs enable row level security;
alter table public.widgets enable row level security;
alter table public.notes enable row level security;

-- Clear any legacy public invite codes so no board is exposed
update public.dashboards set invite_code = null where invite_code is not null;

-- Policies add up, so one left over from an earlier version or added by hand would widen access.
-- Remove every policy on these tables and rebuild the full set below.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
    and tablename in ('dashboards', 'dashboard_members', 'tabs', 'widgets', 'notes')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 8. Row Level Security Policies (signed-in users only, no anonymous access)

-- A dashboard's id is its owner's user id, so nobody can claim an id ahead of its real owner
create policy "Owners manage dashboards" on public.dashboards
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and id = auth.uid()::text);

create policy "Members view shared dashboards" on public.dashboards
  for select to authenticated
  using (private.can_read_dashboard(id));

-- Owners invite and remove but can't accept on someone's behalf. Otherwise anyone who knew an email
-- address could pull that person's device onto their board and receive everything it syncs.
create policy "Owners view members" on public.dashboard_members
  for select to authenticated
  using (private.owns_dashboard(dashboard_id));

create policy "Owners invite members" on public.dashboard_members
  for insert to authenticated
  with check (private.owns_dashboard(dashboard_id) and accepted_at is null);

create policy "Owners remove members" on public.dashboard_members
  for delete to authenticated
  using (private.owns_dashboard(dashboard_id));

create policy "Members view own membership" on public.dashboard_members
  for select to authenticated
  using (private.is_me(user_id, email));

create policy "Members accept invitations" on public.dashboard_members
  for update to authenticated
  using (private.is_me(user_id, email))
  with check (private.is_me(user_id, email));

create policy "Members leave boards" on public.dashboard_members
  for delete to authenticated
  using (private.is_me(user_id, email));

-- Access to board content comes from the board, never from the user_id on a row, and that user_id
-- must stay the board's owner
do $$
declare
  t text;
begin
  foreach t in array array['tabs', 'widgets', 'notes'] loop
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
  end loop;
end $$;

-- 8b. Board Size Limits
-- Sign-up is open and every account gets a board. Without a limit, one account could fill the
-- database, and Supabase stops accepting writes for every board when a project runs out of space.
-- Signed-in users can't add rows that take a board past the size limit. Changes to existing rows get
-- 1 MB more, so moving or editing something on a board that is nearly full still works. A board
-- already over that (from before this limit) can still shrink, delete, and save edits that don't
-- add data. Work done in the SQL Editor or with the service_role key isn't limited. A refused save
-- comes back from the API as HTTP 413 with the message below.
-- To change a limit, edit the number in board_limit_bytes or board_limit_members below.
-- To see how big each board is:
--   select id, pg_size_pretty(u.bytes), u.members from public.dashboards, private.board_usage(id) u order by u.bytes desc;
create or replace function private.board_limit_bytes() returns bigint
language sql immutable set search_path = '' as $$ select (100 * 1024 * 1024)::bigint $$;

create or replace function private.board_limit_members() returns bigint
language sql immutable set search_path = '' as $$ select 50::bigint $$;

-- Space a board's rows take on disk, with large values counted as stored (compressed), and how many
-- members and invitations it has. Runs as its owner so the result doesn't depend on who is asking.
create or replace function private.board_usage(target text, out bytes bigint, out members bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select sum(pg_column_size(r.*)) from public.dashboards r where r.id = target), 0)
    + coalesce((select sum(pg_column_size(r.*)) from public.dashboard_members r where r.dashboard_id = target), 0)
    + coalesce((select sum(pg_column_size(r.*)) from public.tabs r where r.dashboard_id = target), 0)
    + coalesce((select sum(pg_column_size(r.*)) from public.widgets r where r.dashboard_id = target), 0)
    + coalesce((select sum(pg_column_size(r.*)) from public.notes r where r.dashboard_id = target), 0),
    (select count(*) from public.dashboard_members r where r.dashboard_id = target)
$$;

create or replace function private.check_board_limits() returns trigger
language plpgsql set search_path = '' as $$
declare
  board_column text := case when tg_table_name = 'dashboards' then 'id' else 'dashboard_id' end;
  boards text[];
  board text;
  usage record;
  allowed bigint := private.board_limit_bytes() + case when tg_op = 'UPDATE' then 1024 * 1024 else 0 end;
begin
  if current_user is distinct from 'authenticated' then
    return null;
  end if;

  -- The boards this statement made bigger. An update counts only if it grew the board. New values
  -- arrive uncompressed, so the new size is read from the table as stored, like the old size.
  if tg_op = 'INSERT' then
    execute format('select array_agg(distinct %I) from new_rows', board_column) into boards;
  else
    execute format(
      'select array_agg(n.board) from '
      || '(select r.%1$I as board, sum(pg_column_size(t.*)) as size from new_rows r '
      || 'join public.%2$I t on %3$s group by 1) n '
      || 'left join (select %1$I as board, sum(pg_column_size(r.*)) as size from old_rows r group by 1) o '
      || 'using (board) where n.size > coalesce(o.size, 0)',
      board_column, tg_table_name,
      case when tg_table_name in ('dashboards', 'dashboard_members') then 't.id = r.id'
           else 't.dashboard_id = r.dashboard_id and t.id = r.id' end) into boards;
  end if;

  foreach board in array coalesce(boards, '{}') loop
    select * into usage from private.board_usage(board);
    if usage.bytes > allowed then
      -- SQLSTATE PGRST lets the API answer 413 with this message instead of a generic server error
      raise sqlstate 'PGRST' using
        message = json_build_object(
          'code', 'board_full',
          'message', format('This board is full. It can hold up to %s MB, and this change would go over.',
            private.board_limit_bytes() / 1024 / 1024),
          'details', null,
          'hint', 'Remove some photos, wallpapers, images or notes, then sync again.')::text,
        detail = json_build_object('status', 413, 'headers', json_build_object())::text;
    end if;
    if tg_table_name = 'dashboard_members' and tg_op = 'INSERT' and usage.members > private.board_limit_members() then
      raise sqlstate 'PGRST' using
        message = json_build_object(
          'code', 'board_members_full',
          'message', format('This board already has %s members and invitations, the most it can have.',
            private.board_limit_members()),
          'details', null,
          'hint', 'Remove a member or invitation first.')::text,
        detail = json_build_object('status', 413, 'headers', json_build_object())::text;
    end if;
  end loop;

  return null;
end $$;

revoke all on function private.board_limit_bytes() from public, anon;
revoke all on function private.board_limit_members() from public, anon;
revoke all on function private.board_usage(text) from public, anon;
revoke all on function private.check_board_limits() from public, anon;
grant execute on function private.board_limit_bytes() to authenticated;
grant execute on function private.board_limit_members() to authenticated;
grant execute on function private.board_usage(text) to authenticated;

-- Checked once per statement, so a sync that writes many rows checks each board once
do $$
declare
  t text;
begin
  foreach t in array array['dashboards', 'dashboard_members', 'tabs', 'widgets', 'notes'] loop
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
  end loop;
end $$;

-- 9. Table Permissions
-- Supabase grants every table to anon and authenticated by default, TRUNCATE included, and RLS doesn't
-- apply to TRUNCATE. Grant only what the app uses. Members can change accepted_at and nothing else.
revoke all on public.dashboards, public.dashboard_members, public.tabs, public.widgets, public.notes
  from public, anon, authenticated;
grant select, insert, update, delete on public.dashboards, public.tabs, public.widgets, public.notes
  to authenticated;
grant select, insert, delete on public.dashboard_members to authenticated;
grant update (accepted_at) on public.dashboard_members to authenticated;

-- 10. Realtime Publications (Idempotent)
-- The app only listens to these three tables, so the others stay out of the change feed
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array array['tabs', 'widgets', 'notes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;

  foreach t in array array['dashboards', 'dashboard_members'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
