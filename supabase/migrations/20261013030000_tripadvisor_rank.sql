alter table public.metric_snapshots
  add column if not exists tripadvisor_rank text;

alter table public.metric_snapshots
  drop constraint if exists metric_snapshots_tripadvisor_rank_platform_check;
alter table public.metric_snapshots
  add constraint metric_snapshots_tripadvisor_rank_platform_check
  check (tripadvisor_rank is null or platform = 'tripadvisor');

alter table public.daily_report_snapshots
  add column if not exists tripadvisor_rank text;
alter table public.daily_report_snapshots
  drop constraint if exists daily_report_tripadvisor_rank_platform_check;
alter table public.daily_report_snapshots
  add constraint daily_report_tripadvisor_rank_platform_check
  check (tripadvisor_rank is null or platform = 'tripadvisor');

create or replace view public.latest_metric_snapshots
with (security_invoker = true)
as
select distinct on (location_id, platform)
  id,
  location_id,
  platform,
  rating_scale,
  rating_value,
  review_count,
  count_label,
  captured_at,
  source,
  tripadvisor_rank
from public.metric_snapshots
order by location_id, platform, captured_at desc, id desc;

revoke all on public.latest_metric_snapshots from public, anon;
grant select on public.latest_metric_snapshots to authenticated;
