-- Role "mkt" (app_metadata.role = "mkt", see src/lib/admin.ts) now has every action of the Marketing pages, not only reading:
-- add and edit locations and platform links, refresh the reviews (crawl), import daily reports, and keep its own notifications.
-- Replaces the read-only split of 20261029010000_mkt_read_only.sql. Blue Jay, HR and the automatic sync settings stay admin / service role only.
do $$
declare t text;
begin
  foreach t in array array['locations', 'location_platforms', 'metric_snapshots', 'daily_report_snapshots'] loop
    execute format('drop policy if exists "admins or mkt read" on public.%I', t);
    execute format('drop policy if exists "admins change" on public.%I', t);
    execute format('drop policy if exists "admins update" on public.%I', t);
    execute format('drop policy if exists "admins delete" on public.%I', t);
    execute format('drop policy if exists "mkt reads all" on public.%I', t);
    execute format('drop policy if exists "admins or mkt" on public.%I', t);
    execute format('drop policy if exists "mkt manages all" on public.%I', t);
    -- restrictive: only these two roles touch the review data at all
    execute format($p$create policy "admins or mkt" on public.%I as restrictive for all to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mkt')) with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mkt'))$p$, t);
    -- permissive: like the admins (20261016020000), mkt works on every owner's rows, so both see one shared set of locations
    execute format($p$create policy "mkt manages all" on public.%I for all to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'mkt') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'mkt')$p$, t);
  end loop;
end $$;

-- Notifications (e.g. a failed crawl): each account keeps its own, through the owner policies of schema.sql.
drop policy if exists "admins only" on public.notifications;
drop policy if exists "admins or mkt" on public.notifications;
create policy "admins or mkt" on public.notifications as restrictive for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mkt')) with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'mkt'));
