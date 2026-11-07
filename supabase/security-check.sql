-- Read-only audit of the database's access rules. Run it in the Supabase SQL Editor after schema.sql.
-- It changes nothing. Every row returned is a problem, and no rows means every check passed.

with app_tables(name) as (
  values ('dashboards'), ('dashboard_members'), ('tabs'), ('widgets'), ('notes')
)

select 'RLS is off' as problem, c.relname::text as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

union all
select 'Policy applies to anonymous or all roles', tablename || ': ' || policyname
from pg_policies
where schemaname = 'public'
and tablename in (select name from app_tables)
and roles && array['public', 'anon']::name[]

union all
select 'Policy allows every row', tablename || ': ' || policyname
from pg_policies
where schemaname = 'public'
and tablename in (select name from app_tables)
and (lower(coalesce(qual, '')) in ('true', '(true)') or lower(coalesce(with_check, '')) in ('true', '(true)'))

union all
select 'Anonymous or public role has table access', table_name || ': ' || privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
and table_name in (select name from app_tables)
and grantee in ('anon', 'PUBLIC')

union all
select 'Signed-in role has more than it needs', table_name || ': ' || privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
and table_name in (select name from app_tables)
and grantee = 'authenticated'
and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')

union all
select 'Members can update more than accepted_at', table_name || ': table-wide UPDATE'
from information_schema.role_table_grants
where table_schema = 'public'
and table_name = 'dashboard_members'
and grantee = 'authenticated'
and privilege_type = 'UPDATE'

union all
select 'Function runs as its owner without a fixed search_path', n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
and p.prosecdef
and not coalesce(p.proconfig, array[]::text[]) && array['search_path=""', 'search_path=']

union all
select 'Anonymous users can run this function', n.nspname || '.' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
and p.prosecdef
and has_function_privilege('anon', p.oid, 'execute')

union all
select 'Private table or schema is in the realtime feed', tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
and schemaname = 'public'
and tablename in ('dashboards', 'dashboard_members')

union all
select 'Rows are not identified by board and id', t.name
from app_tables t
where t.name in ('tabs', 'widgets', 'notes')
and not exists (
  select 1
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = format('public.%I', t.name)::regclass
  and i.indisprimary
  and a.attname = 'dashboard_id'
)

union all
select 'Board size limit is missing or turned off', t.name || ': ' || e.event
from app_tables t
cross join (values ('insert'), ('update')) as e(event)
where not exists (
  select 1
  from pg_trigger tr
  where tr.tgrelid = format('public.%I', t.name)::regclass
  and tr.tgname = 'check_board_limits_' || e.event
  and tr.tgenabled <> 'D'
)

union all
select 'Dashboard id does not match its owner', id
from public.dashboards
where id <> user_id::text and id <> 'default'

union all
select 'Plex token guard is missing or turned off', t.name
from (values ('dashboards'), ('widgets')) as t(name)
where not exists (
  select 1
  from pg_trigger tr
  where tr.tgrelid = format('public.%I', t.name)::regclass
  and tr.tgname = 'strip_plex_tokens'
  and tr.tgenabled <> 'D'
)

union all
select 'Secret-looking value stored in settings or widget config', 'dashboard ' || id
from public.dashboards
where settings::text ilike '%x-plex-token=%'

union all
select 'Secret-looking value stored in settings or widget config', 'widget ' || dashboard_id || '/' || id
from public.widgets
where config::text ilike '%x-plex-token=%'

order by 1, 2;
