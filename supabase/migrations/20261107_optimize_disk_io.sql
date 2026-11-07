-- Migration: 20261107_optimize_disk_io.sql
-- Ambiently (dashboard.trinhism.com) Supabase Disk IO & Burst IO Optimization
--
-- Fixes Disk IO budget exhaustion by:
-- 1. Adding composite indexes for (dashboard_id, updated_at desc) to eliminate sequential scans.
-- 2. Adding an automatic 'touch_dashboard_updated_at' trigger on tabs, widgets, and notes so
--    clients can verify board revisions with a single 1-row, 1-column index lookup.
-- 3. Replacing the expensive 5-table sequential detoasting scans (sum(pg_column_size)) in
--    private.check_board_limits() with an in-memory batch size check (< 5MB) and index-only member count,
--    preventing PostgreSQL from reading and decompressing all TOAST blocks on every write.
--
-- Safe and idempotent to run directly in the Supabase SQL Editor.

-- 1. Composite indexes for high-speed timestamp / revision checks
create index if not exists tabs_dashboard_updated_idx on public.tabs (dashboard_id, updated_at desc);
create index if not exists widgets_dashboard_updated_idx on public.widgets (dashboard_id, updated_at desc);
create index if not exists notes_dashboard_updated_idx on public.notes (dashboard_id, updated_at desc);

-- 2. Automatic Dashboard Revision Touch Trigger
create or replace function private.touch_dashboard_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.dashboards
  set updated_at = timezone('utc'::text, now())
  where id = coalesce(new.dashboard_id, old.dashboard_id);
  return null;
end $$;

revoke all on function private.touch_dashboard_updated_at() from public, anon;

do $$
declare
  t text;
begin
  foreach t in array array['tabs', 'widgets', 'notes'] loop
    execute format('drop trigger if exists touch_dashboard_on_%I_change on public.%I', t, t);
    execute format(
      'create trigger touch_dashboard_on_%1$I_change after insert or update or delete on public.%1$I
       for each row execute function private.touch_dashboard_updated_at()', t);
  end loop;
end $$;

-- 3. High-Performance, Zero-Disk-IO Board Limits Trigger
-- Replaces table-wide detoasting scans with an in-memory transition table check.
-- Only triggers full board usage summation if an incoming statement batch exceeds 5 MB.
create or replace function private.check_board_limits() returns trigger
language plpgsql set search_path = '' as $$
declare
  board_column text := case when tg_table_name = 'dashboards' then 'id' else 'dashboard_id' end;
  boards text[];
  board text;
  usage record;
  allowed bigint := private.board_limit_bytes() + case when tg_op = 'UPDATE' then 1024 * 1024 else 0 end;
  batch_size bigint := 0;
begin
  if current_user is distinct from 'authenticated' then
    return null;
  end if;

  -- 1. Household Member limit check on invitation insert (uses index-only scan, 0 heap reads)
  if tg_table_name = 'dashboard_members' and tg_op = 'INSERT' then
    execute format('select array_agg(distinct %I) from new_rows', board_column) into boards;
    foreach board in array coalesce(boards, '{}') loop
      if (select count(*) from public.dashboard_members where dashboard_id = board) > private.board_limit_members() then
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
  end if;

  -- 2. Fast in-memory check of new rows batch size (0 disk I/O)
  execute 'select coalesce(sum(pg_column_size(r.*)), 0) from new_rows r' into batch_size;

  -- 3. Only evaluate disk-intensive board_usage if an individual batch exceeds 5 MB
  if batch_size > 5 * 1024 * 1024 then
    execute format('select array_agg(distinct %I) from new_rows', board_column) into boards;
    foreach board in array coalesce(boards, '{}') loop
      select * into usage from private.board_usage(board);
      if usage.bytes > allowed then
        raise sqlstate 'PGRST' using
          message = json_build_object(
            'code', 'board_full',
            'message', format('This board is full. It can hold up to %s MB, and this change would go over.',
              private.board_limit_bytes() / 1024 / 1024),
            'details', null,
            'hint', 'Remove some photos, wallpapers, images or notes, then sync again.')::text,
          detail = json_build_object('status', 413, 'headers', json_build_object())::text;
      end if;
    end loop;
  end if;

  return null;
end $$;

-- 4. Re-bind the statement triggers to ensure they are active and referenced properly
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
