-- Only accounts with app_metadata.role = "admin" may use the app (src/lib/admin.ts).
-- A restrictive policy is ANDed with the existing owner policies, so a signed-in non-admin sees and changes nothing.
-- app_metadata is only writable with the service role. Grant: update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '...';
-- Service-role tables (grab_merchant_accounts, bluejay_*) have no user access at all, so they need nothing here.
drop policy if exists "admins only" on public.locations;
create policy "admins only" on public.locations as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.location_platforms;
create policy "admins only" on public.location_platforms as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.metric_snapshots;
create policy "admins only" on public.metric_snapshots as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.daily_report_snapshots;
create policy "admins only" on public.daily_report_snapshots as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.automatic_sync_settings;
create policy "admins only" on public.automatic_sync_settings as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.automatic_sync_runs;
create policy "admins only" on public.automatic_sync_runs as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins only" on public.notifications;
create policy "admins only" on public.notifications as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
