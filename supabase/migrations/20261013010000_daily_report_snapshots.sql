-- Frozen, branch-specific report values, finalized once per platform and day.
create table if not exists public.daily_report_snapshots (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  platform text not null check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka')),
  report_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  rating_scale numeric(4,1) not null check (rating_scale > 0),
  rating_value numeric(4,2),
  review_count bigint check (review_count is null or review_count >= 0),
  count_label text not null default 'reviews',
  finalized_at timestamptz not null default now(),
  finalized_by uuid default auth.uid() references auth.users(id) on delete set null,
  constraint daily_report_has_value check (rating_value is not null or review_count is not null),
  constraint daily_report_rating_value_check check (rating_value is null or (rating_value >= 0 and rating_value <= rating_scale)),
  constraint daily_report_platform_rating_scale_check check (
    (platform in ('google', 'tripadvisor') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  ),
  constraint daily_report_location_platform_date_key unique (location_id, platform, report_date)
);

create index if not exists daily_report_location_date_idx
  on public.daily_report_snapshots(location_id, report_date desc, platform);

alter table public.daily_report_snapshots enable row level security;
drop policy if exists "owners manage daily reports for their locations" on public.daily_report_snapshots;
create policy "owners manage daily reports for their locations"
on public.daily_report_snapshots for all to authenticated
using (exists (
  select 1 from public.locations
  where locations.id = daily_report_snapshots.location_id
    and locations.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.locations
  where locations.id = daily_report_snapshots.location_id
    and locations.owner_id = (select auth.uid())
));

grant select, insert, update, delete on public.daily_report_snapshots to authenticated;
grant usage, select on sequence public.daily_report_snapshots_id_seq to authenticated;
