-- Migration: 20261124_harden_members_and_nested_secrets.sql
-- Ambiently (dashboard.trinhism.com)
--
-- 1. Prevents owners from inserting pre-bound `dashboard_members` rows with their own `user_id`
--    to self-accept invitations on a victim email's behalf (`grant insert (dashboard_id, email, role)`
--    + strict RLS policies + constraint check).
-- 2. Extends `private.strip_plex_tokens_from_config()` to strip nested `homeAssistant` tokens and
--    `services[*]` credentials inside `public.widgets.config`.

-- Clean up any invalid or self-bound rows before tightening constraints
delete from public.dashboard_members
  where email is null
     or role not in ('editor', 'viewer')
     or (user_id is not null and user_id::text = dashboard_id);

alter table public.dashboard_members drop constraint if exists dashboard_members_identity_check;
alter table public.dashboard_members add constraint dashboard_members_identity_check
  check (
    email is not null
    and role in ('editor', 'viewer')
    and (user_id is null or user_id::text <> dashboard_id)
  );

drop policy if exists "Owners invite members" on public.dashboard_members;
create policy "Owners invite members" on public.dashboard_members
  for insert to authenticated
  with check (
    private.owns_dashboard(dashboard_id)
    and accepted_at is null
    and user_id is null
    and email is not null
    and email <> private.current_email()
    and role in ('editor', 'viewer')
  );

drop policy if exists "Members accept invitations" on public.dashboard_members;
create policy "Members accept invitations" on public.dashboard_members
  for update to authenticated
  using (not private.owns_dashboard(dashboard_id) and private.is_me(user_id, email))
  with check (not private.owns_dashboard(dashboard_id) and private.is_me(user_id, email));

revoke insert on public.dashboard_members from authenticated;
grant insert (dashboard_id, email, role) on public.dashboard_members to authenticated;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.strip_plex_tokens_from_config() returns trigger
language plpgsql set search_path = '' as $$
declare
  cleaned_services jsonb;
begin
  if new.config::text ~* 'x-plex-token=' then
    new.config := regexp_replace(
      regexp_replace(new.config::text, '([?&])x-plex-token=[^&"\\#]*&', '\1', 'gi'),
      '[?&]x-plex-token=[^&"\\#]*', '', 'gi'
    )::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(new.config) = 'object' then
    if new.config ?| array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders'] then
      new.config := new.config - array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders'];
    end if;
    if pg_catalog.jsonb_typeof(new.config->'homeAssistant') = 'object' and (
      (new.config->'homeAssistant') ?| array['accessToken', 'haAccessToken', 'token', 'bearerToken', 'apiToken']
    ) then
      new.config := pg_catalog.jsonb_set(
        new.config,
        '{homeAssistant}',
        (new.config->'homeAssistant') - array['accessToken', 'haAccessToken', 'token', 'bearerToken', 'apiToken'],
        false
      );
    end if;
    if pg_catalog.jsonb_typeof(new.config->'services') = 'array' and exists (
      select 1
      from pg_catalog.jsonb_array_elements(new.config->'services') elem
      where pg_catalog.jsonb_typeof(elem) = 'object'
        and elem ?| array['token', 'headers', 'accessToken', 'bearerToken', 'apiToken']
    ) then
      select pg_catalog.jsonb_agg(
        case
          when pg_catalog.jsonb_typeof(elem) = 'object' then
            elem - array['token', 'headers', 'accessToken', 'bearerToken', 'apiToken']
          else elem
        end
      )
      into cleaned_services
      from pg_catalog.jsonb_array_elements(new.config->'services') elem;
      new.config := pg_catalog.jsonb_set(new.config, '{services}', coalesce(cleaned_services, '[]'::jsonb), false);
    end if;
  end if;
  return new;
end $$;

revoke all on function private.strip_plex_tokens_from_config() from public, anon;

drop trigger if exists strip_plex_tokens on public.widgets;
create trigger strip_plex_tokens before insert or update of config on public.widgets
  for each row execute function private.strip_plex_tokens_from_config();

update public.widgets set config = config
where config::text ~* 'x-plex-token='
   or (pg_catalog.jsonb_typeof(config) = 'object' and (
     config ?| array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders']
     or (
       pg_catalog.jsonb_typeof(config->'homeAssistant') = 'object'
       and (config->'homeAssistant') ?| array['accessToken', 'haAccessToken', 'token', 'bearerToken', 'apiToken']
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         case when pg_catalog.jsonb_typeof(config->'services') = 'array' then config->'services' else '[]'::jsonb end
       ) elem
       where pg_catalog.jsonb_typeof(elem) = 'object'
         and elem ?| array['token', 'headers', 'accessToken', 'bearerToken', 'apiToken']
     )
   ));
