-- Allow GrabFood (5-point scale) in finalized daily reports for Cafe locations.
alter table public.daily_report_snapshots drop constraint if exists daily_report_snapshots_platform_check;
alter table public.daily_report_snapshots add constraint daily_report_snapshots_platform_check
  check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood'));

alter table public.daily_report_snapshots drop constraint if exists daily_report_platform_rating_scale_check;
alter table public.daily_report_snapshots add constraint daily_report_platform_rating_scale_check
  check (
    (platform in ('google', 'tripadvisor', 'grabfood') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  );
