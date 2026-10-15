-- Blue Jay PMS: raw log of every API call (hotels are listed in src/lib/bluejay.ts).
-- Reports are derived from the stored responses, so a call never has to be repeated outside the API window.
create table if not exists public.bluejay_api_calls (
  id bigint generated always as identity primary key,
  hotel_id integer not null,
  endpoint text not null check (endpoint in (
    'roomtype-list', 'roomdetail-list', 'source-category', 'source-list',
    'reservation', 'extraservice-sumary', 'report-room-occupancy'
  )),
  params jsonb not null default '{}',          -- query string as sent, e.g. {"dateType":3,"from":"2026-10-6","to":"2026-10-12","page":2}
  http_status smallint,                         -- null when the request never got a response (timeout, network)
  ok boolean not null,                          -- false also for HTTP 200 bodies with "errors" (outside the time window)
  error text check (char_length(error) <= 1000),
  response jsonb,                               -- full body; null when there was none
  duration_ms integer,
  called_at timestamptz not null default now()
);

create index if not exists bluejay_api_calls_hotel_endpoint_idx
  on public.bluejay_api_calls(hotel_id, endpoint, called_at desc);

-- Server (service role) only, like grab_merchant_accounts. Admin check is in src/lib/bluejay.ts.
alter table public.bluejay_api_calls enable row level security;
revoke all on public.bluejay_api_calls from anon, authenticated;

-- Computed weekly operations report (same shape as the sample project), rebuilt from the API on each refresh.
create table if not exists public.bluejay_weekly_reports (
  week_start date primary key check (extract(isodow from week_start) = 1),
  report jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.bluejay_weekly_reports enable row level security;
revoke all on public.bluejay_weekly_reports from anon, authenticated;
