-- Migration: 20261108_board_limit_every_write.sql
-- For a project set up before this change. Safe to run more than once in the Supabase SQL Editor.
--
-- 1. The board size limit checks every write again. Since 20261107_optimize_disk_io.sql it only looked
--    when a single write was over 5 MB, so a board could be filled past its limit with smaller writes.
--    Sizes are now read per column, which reads a large value's stored size without fetching it, so the
--    check doesn't read the board's images and notes from disk (the cost that change was removing).
-- 2. The Plex token triggers run only when settings or config is written. Before, the updated_at touch
--    from 20261107_optimize_disk_io.sql ran them for every saved note, tab and widget, reading the
--    board's whole settings from disk each time.
-- Afterwards, run supabase/security-check.sql. Any row it returns is a problem to fix.

-- An expression adding up the space a row of a public table takes, for the given row alias: 24 bytes
-- for the row header, plus each column as stored (compressed). Sizing each column, not the whole row,
-- reads a large value's stored size without fetching it, so checking a board doesn't read its images
-- and notes from disk. Built from the table's columns, so a column added later is counted too.
create or replace function private.row_size_expression(table_name text, row_alias text) returns text
language sql stable set search_path = '' as $$
  select '24 + ' || string_agg(format('coalesce(pg_column_size(%I.%I), 0)', row_alias, a.attname), ' + ' order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = format('public.%I', table_name)::regclass and a.attnum > 0 and not a.attisdropped
$$;

-- Space a board's rows take on disk, and how many members and invitations it has. Each table is read
-- through its board index. Runs as its owner so the result doesn't depend on who is asking.
create or replace function private.board_usage(target text, out bytes bigint, out members bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  part bigint;
begin
  bytes := 0;
  foreach t in array array['dashboards', 'dashboard_members', 'tabs', 'widgets', 'notes'] loop
    execute format('select sum(%s) from public.%I r where r.%I = $1',
      private.row_size_expression(t, 'r'), t, case when t = 'dashboards' then 'id' else 'dashboard_id' end)
      into part using target;
    bytes := bytes + coalesce(part, 0);
  end loop;
  select count(*) into members from public.dashboard_members m where m.dashboard_id = target;
end $$;

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

  -- 1. Member limit on invitation insert (an index-only count)
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

  -- 2. The boards this statement made bigger. Every write is checked, however small: many small writes
  -- fill a board as surely as one big one. An update counts only if it grew the board. New values
  -- arrive uncompressed, so the new size is read from the table as stored, like the old size. Sizes
  -- are read per column, which doesn't fetch large values (see row_size_expression).
  if tg_op = 'INSERT' then
    execute format('select array_agg(distinct %I) from new_rows', board_column) into boards;
  else
    execute format(
      'select array_agg(n.board) from '
      || '(select r.%1$I as board, sum(%4$s) as size from new_rows r join public.%2$I t on %3$s group by 1) n '
      || 'left join (select r.%1$I as board, sum(%5$s) as size from old_rows r group by 1) o '
      || 'using (board) where n.size > coalesce(o.size, 0)',
      board_column, tg_table_name,
      case when tg_table_name in ('dashboards', 'dashboard_members') then 't.id = r.id'
           else 't.dashboard_id = r.dashboard_id and t.id = r.id' end,
      private.row_size_expression(tg_table_name, 't'),
      private.row_size_expression(tg_table_name, 'r')) into boards;
  end if;

  -- 3. Whether those boards are now over the limit
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

  return null;
end $$;

revoke all on function private.row_size_expression(text, text) from public, anon;
grant execute on function private.row_size_expression(text, text) to authenticated;

-- Only when settings or config is written, so other updates (like the updated_at touch in 8c) don't
-- read a large value from disk and search it
drop trigger if exists strip_plex_tokens on public.dashboards;
create trigger strip_plex_tokens before insert or update of settings on public.dashboards
  for each row execute function private.strip_plex_tokens_from_settings();

drop trigger if exists strip_plex_tokens on public.widgets;
create trigger strip_plex_tokens before insert or update of config on public.widgets
  for each row execute function private.strip_plex_tokens_from_config();
