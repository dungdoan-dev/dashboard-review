-- Google Business Profile (Google Maps) metrics from Windsor.ai: one row per location and day, plus the posts of each location.
-- Server (service role) only; the admin check is in src/lib/bluejay-auth.ts.
create table if not exists public.google_profile_days (
  location_id text not null,
  location_name text not null,
  day date not null,
  call_clicks integer not null default 0,
  direction_requests integer not null default 0,
  website_clicks integer not null default 0,
  bookings integer not null default 0,
  menu_clicks integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (location_id, day)
);
create table if not exists public.google_profile_posts (
  post_id text primary key,
  location_id text not null,
  created_at timestamptz not null
);
alter table public.google_profile_days enable row level security;
alter table public.google_profile_posts enable row level security;
revoke all on public.google_profile_days, public.google_profile_posts from anon, authenticated;
