-- Allow GrabFood (5-point scale) snapshots for cafe locations.
alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_check;
alter table public.metric_snapshots add constraint metric_snapshots_platform_check
  check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood'));

alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_rating_scale_check;
alter table public.metric_snapshots add constraint metric_snapshots_platform_rating_scale_check
  check (
    (platform in ('google', 'tripadvisor', 'grabfood') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  );
