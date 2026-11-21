-- Migration: 20261120_strip_vault_and_pin_secrets.sql
-- Ambiently (dashboard.trinhism.com)
--
-- Extends private.strip_plex_tokens_from_settings() and private.strip_plex_tokens_from_config()
-- so Postgres triggers enforce server-side stripping of kiosk PIN hashes and device-local
-- Home Assistant / Wi-Fi secrets even from older or custom API clients.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.strip_plex_tokens_from_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.settings::text ~* 'x-plex-token=' then
    new.settings := regexp_replace(
      regexp_replace(new.settings::text, '([?&])x-plex-token=[^&"\\#]*&', '\1', 'gi'),
      '[?&]x-plex-token=[^&"\\#]*', '', 'gi'
    )::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(new.settings) = 'object' and (
    coalesce(new.settings->>'pinLockEnabled', 'false') = 'true'
    or (new.settings ? 'pinHash' and new.settings->'pinHash' <> 'null'::jsonb)
  ) then
    new.settings := new.settings || '{"pinLockEnabled": false, "pinHash": null}'::jsonb;
  end if;
  return new;
end $$;

create or replace function private.strip_plex_tokens_from_config() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.config::text ~* 'x-plex-token=' then
    new.config := regexp_replace(
      regexp_replace(new.config::text, '([?&])x-plex-token=[^&"\\#]*&', '\1', 'gi'),
      '[?&]x-plex-token=[^&"\\#]*', '', 'gi'
    )::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(new.config) = 'object' and (
    new.config ?| array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders']
  ) then
    new.config := new.config - array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders'];
  end if;
  return new;
end $$;

revoke all on function private.strip_plex_tokens_from_settings() from public, anon;
revoke all on function private.strip_plex_tokens_from_config() from public, anon;

drop trigger if exists strip_plex_tokens on public.dashboards;
create trigger strip_plex_tokens before insert or update of settings on public.dashboards
  for each row execute function private.strip_plex_tokens_from_settings();

drop trigger if exists strip_plex_tokens on public.widgets;
create trigger strip_plex_tokens before insert or update of config on public.widgets
  for each row execute function private.strip_plex_tokens_from_config();

update public.dashboards set settings = settings
where settings::text ~* 'x-plex-token='
   or (pg_catalog.jsonb_typeof(settings) = 'object' and (
     coalesce(settings->>'pinLockEnabled', 'false') = 'true'
     or (settings ? 'pinHash' and settings->'pinHash' <> 'null'::jsonb)
   ));

update public.widgets set config = config
where config::text ~* 'x-plex-token='
   or (pg_catalog.jsonb_typeof(config) = 'object' and (
     config ?| array['password', 'ssid', 'haAccessToken', 'accessToken', 'apiToken', 'bearerToken', 'serviceHeaders']
   ));
