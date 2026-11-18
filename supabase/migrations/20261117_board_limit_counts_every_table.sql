-- Makes the board size limit count every table that holds board data.
--
-- schema.sql's copy of private.board_usage listed only the first six tables. Re-running schema.sql
-- after the profiles/chores/meals and kanban migrations (as when upgrading) dropped those tables
-- from the count, so rows in them no longer counted toward the 100 MB board limit and an editor
-- could fill the database. Every file now defines the same full list. Safe to run more than once.

create or replace function private.board_usage(target text, out bytes bigint, out members bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  part bigint;
begin
  bytes := 0;
  -- Every table that holds board data. schema.sql, phase1_profiles_chores_meals.sql,
  -- kanban_boards_and_cards.sql and 20261117_board_limit_counts_every_table.sql all define this
  -- function with this same list, so re-running any of them, in any order, keeps every table under
  -- the board limit. A table that doesn't exist yet is skipped.
  foreach t in array array[
    'dashboards', 'dashboard_members', 'tabs', 'widgets', 'notes',
    'household_profiles', 'chore_templates', 'chore_instances', 'wishlist_rewards', 'chore_trophies',
    'chore_ledger', 'chore_settings', 'meal_recipes', 'scheduled_meals', 'shopping_list_items',
    'meal_staples', 'meal_settings', 'kanban_boards', 'kanban_cards'
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
