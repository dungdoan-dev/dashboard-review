-- Role "mkt" (app_metadata.role = "mkt", see src/lib/admin.ts): may read the review data (locations, platform links, snapshots, daily reports), never change it.
-- The restrictive "admins only" policies of 20261015010000 cover every command and admit admins alone; here they are split so that SELECT also admits mkt.
-- A mkt account still has no row of automatic_sync_*, notifications or any Blue Jay / HR table (service role only).
-- Grant: update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"mkt"}' where email = '...';
do $$
declare t text;
begin
  foreach t in array array['locations', 'location_platforms', 'metric_snapshots', 'daily_report_snapshots'] loop
    execute format('drop policy if exists "admins only" on public.%I', t);
    execute format('drop policy if exists "admins or mkt read" on public.%I', t);
    execute format('drop policy if exists "admins change" on public.%I', t);
    execute format('drop policy if exists "admins update" on public.%I', t);
    execute format('drop policy if exists "admins delete" on public.%I', t);
    execute format('drop policy if exists "mkt reads all" on public.%I', t);
    execute format($p$create policy "admins or mkt read" on public.%I as restrictive for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mkt'))$p$, t);
    execute format($p$create policy "admins change" on public.%I as restrictive for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$p$, t);
    execute format($p$create policy "admins update" on public.%I as restrictive for update to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$p$, t);
    execute format($p$create policy "admins delete" on public.%I as restrictive for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$p$, t);
    execute format($p$create policy "mkt reads all" on public.%I for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'mkt')$p$, t);
  end loop;
end $$;
