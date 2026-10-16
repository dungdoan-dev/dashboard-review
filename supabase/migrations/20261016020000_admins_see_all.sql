-- Admins share one workspace: every account with app_metadata.role = "admin" sees and manages the review data of every owner.
-- Until now only the owner of a row could read it, so a second admin (e.g. it@vjh.vn) saw the Blue Jay report (service role) but no review report.
-- Permissive policies are ORed with the owner policies; the restrictive "admins only" policies still require the admin role.
-- Per-owner settings (automatic_sync_settings / automatic_sync_runs) stay private to their owner: the cron job runs them per owner.
drop policy if exists "admins manage all locations" on public.locations;
create policy "admins manage all locations" on public.locations for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins manage all platform links" on public.location_platforms;
create policy "admins manage all platform links" on public.location_platforms for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins manage all snapshots" on public.metric_snapshots;
create policy "admins manage all snapshots" on public.metric_snapshots for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins manage all daily reports" on public.daily_report_snapshots;
create policy "admins manage all daily reports" on public.daily_report_snapshots for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "admins manage all notifications" on public.notifications;
create policy "admins manage all notifications" on public.notifications for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
