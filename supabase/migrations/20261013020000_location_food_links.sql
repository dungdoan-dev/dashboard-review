alter table public.location_platforms
  drop constraint if exists location_platforms_platform_check;

alter table public.location_platforms
  add constraint location_platforms_platform_check
  check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood', 'shopeefood'));
