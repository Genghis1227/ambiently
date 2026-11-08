-- Maintenance Script: 20261107_cleanup_bloat.sql
-- Ambiently (dashboard.trinhism.com) Database Bloat Cleanup
--
-- Strips any legacy photo catalogs (commonPhotos / customPhotos) from existing JSONB columns.
-- (PostgreSQL autovacuum will automatically reclaim dead tuple storage in the background).
--
-- Run this in your Supabase SQL Editor:

-- 1. Strip 'commonPhotos' from all existing dashboard settings JSON
update public.dashboards
set settings = settings - 'commonPhotos'
where settings ? 'commonPhotos';

-- 2. Strip 'customPhotos' from all existing widget config JSON
update public.widgets
set config = config - 'customPhotos'
where config ? 'customPhotos';
