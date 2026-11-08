-- Migration: 20261109_touch_board_once_per_save.sql
-- Ambiently (dashboard.trinhism.com)
--
-- The board revision touch from 20261107_optimize_disk_io.sql ran once per row, so a sync that saved
-- 25 notes updated the board's row 25 times (25 new row versions and their WAL). This runs it once per
-- statement instead. The app no longer sends its own extra update of the board's updated_at either,
-- since this trigger covers it for owners and members alike.
--
-- Same as section 8c of supabase/schema.sql. Safe to run more than once.
-- Run this in your Supabase SQL Editor:

create or replace function private.touch_dashboard_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.dashboards d set updated_at = timezone('utc'::text, now())
    where d.id in (select n.dashboard_id from new_rows n);
  elsif tg_op = 'UPDATE' then
    update public.dashboards d set updated_at = timezone('utc'::text, now())
    where d.id in (select n.dashboard_id from new_rows n union select o.dashboard_id from old_rows o);
  else
    update public.dashboards d set updated_at = timezone('utc'::text, now())
    where d.id in (select o.dashboard_id from old_rows o);
  end if;
  return null;
end $$;

revoke all on function private.touch_dashboard_updated_at() from public, anon;

do $$
declare
  t text;
begin
  foreach t in array array['tabs', 'widgets', 'notes'] loop
    execute format('drop trigger if exists touch_dashboard_on_%1$I_change on public.%1$I', t);
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
