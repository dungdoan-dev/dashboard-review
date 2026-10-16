-- Reviewdesk canonical Supabase schema.
-- Platform rating scales: Google/Tripadvisor 5; Agoda/Booking/Expedia/Trip.com/Traveloka 10.

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  area text not null default '' check (char_length(area) <= 180),
  type text not null default 'hotel' check (type in ('hotel', 'cafe', 'mart', 'restaurant', 'resort', 'homestay', 'other', 'entertainment')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations drop constraint if exists locations_type_check;
alter table public.locations add constraint locations_type_check
  check (type in ('hotel', 'cafe', 'mart', 'restaurant', 'resort', 'homestay', 'other', 'entertainment'));

create table if not exists public.location_platforms (
  location_id uuid not null references public.locations(id) on delete cascade,
  platform text not null check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood', 'shopeefood')),
  url text not null check (char_length(trim(url)) between 8 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, platform)
);

create table if not exists public.metric_snapshots (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  platform text not null,
  rating_scale numeric(4,1) not null,
  rating_value numeric(4,2),
  review_count bigint check (review_count is null or review_count >= 0),
  count_label text not null default 'reviews',
  captured_at timestamptz not null default now(),
  source text not null default 'manual',
  tripadvisor_rank text,
  tripadvisor_notice text,
  constraint metric_has_value check (rating_value is not null or review_count is not null)
);

create table if not exists public.daily_report_snapshots (
  id bigint generated always as identity primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  platform text not null check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood')),
  report_date date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  rating_scale numeric(4,1) not null check (rating_scale > 0),
  rating_value numeric(4,2),
  review_count bigint check (review_count is null or review_count >= 0),
  count_label text not null default 'reviews',
  tripadvisor_rank text,
  tripadvisor_notice text,
  finalized_at timestamptz not null default now(),
  finalized_by uuid default auth.uid() references auth.users(id) on delete set null,
  constraint daily_report_has_value check (rating_value is not null or review_count is not null),
  constraint daily_report_rating_value_check check (rating_value is null or (rating_value >= 0 and rating_value <= rating_scale)),
  constraint daily_report_platform_rating_scale_check check (
    (platform in ('google', 'tripadvisor', 'grabfood') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  ),
  constraint daily_report_location_platform_date_key unique (location_id, platform, report_date)
);

alter table public.metric_snapshots drop column if exists rating_label;
alter table public.metric_snapshots add column if not exists tripadvisor_rank text;
alter table public.metric_snapshots drop constraint if exists metric_snapshots_tripadvisor_rank_platform_check;
alter table public.metric_snapshots add constraint metric_snapshots_tripadvisor_rank_platform_check
  check (tripadvisor_rank is null or platform = 'tripadvisor');
alter table public.daily_report_snapshots add column if not exists tripadvisor_rank text;
alter table public.daily_report_snapshots drop constraint if exists daily_report_tripadvisor_rank_platform_check;
alter table public.daily_report_snapshots add constraint daily_report_tripadvisor_rank_platform_check
  check (tripadvisor_rank is null or platform = 'tripadvisor');
alter table public.metric_snapshots add column if not exists tripadvisor_notice text;
alter table public.metric_snapshots drop constraint if exists metric_snapshots_tripadvisor_notice_platform_check;
alter table public.metric_snapshots add constraint metric_snapshots_tripadvisor_notice_platform_check
  check (tripadvisor_notice is null or (platform = 'tripadvisor' and char_length(tripadvisor_notice) <= 10000));
alter table public.daily_report_snapshots add column if not exists tripadvisor_notice text;
alter table public.daily_report_snapshots drop constraint if exists daily_report_tripadvisor_notice_platform_check;
alter table public.daily_report_snapshots add constraint daily_report_tripadvisor_notice_platform_check
  check (tripadvisor_notice is null or (platform = 'tripadvisor' and char_length(tripadvisor_notice) <= 10000));
alter table public.metric_snapshots alter column rating_scale drop default;
alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_check;
alter table public.metric_snapshots add constraint metric_snapshots_platform_check
  check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka', 'grabfood'));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_source_check;
alter table public.metric_snapshots add constraint metric_snapshots_source_check
  check (source in ('manual', 'api', 'import', 'crawler'));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_rating_value_check;
alter table public.metric_snapshots add constraint metric_snapshots_rating_value_check
  check (rating_value is null or (rating_value >= 0 and rating_value <= rating_scale));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_rating_scale_check;
update public.metric_snapshots
set rating_value = case
      when rating_value is null then null
      else round(rating_value * target.scale / rating_scale, 2)
    end,
    rating_scale = target.scale
from (
  values
    ('google', 5::numeric),
    ('tripadvisor', 5::numeric),
    ('agoda', 10::numeric),
    ('booking', 10::numeric),
    ('tripcom', 10::numeric),
    ('traveloka', 10::numeric),
    ('grabfood', 5::numeric)
) as target(platform, scale)
where metric_snapshots.platform = target.platform
  and metric_snapshots.rating_scale <> target.scale;
alter table public.metric_snapshots add constraint metric_snapshots_platform_rating_scale_check
  check (
    (platform in ('google', 'tripadvisor', 'grabfood') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  );

create index if not exists locations_owner_name_idx on public.locations(owner_id, name);
create index if not exists locations_owner_created_idx on public.locations(owner_id, created_at desc);
create index if not exists location_platforms_platform_idx on public.location_platforms(platform);
create index if not exists snapshots_location_platform_time_idx
  on public.metric_snapshots(location_id, platform, captured_at desc, id desc);
create index if not exists snapshots_platform_idx on public.metric_snapshots(platform);
create index if not exists daily_report_location_date_idx
  on public.daily_report_snapshots(location_id, report_date desc, platform);

create or replace view public.latest_metric_snapshots
with (security_invoker = true)
as
select distinct on (location_id, platform)
  id, location_id, platform, rating_scale, rating_value, review_count, count_label, captured_at, source, tripadvisor_rank, tripadvisor_notice
from public.metric_snapshots
order by location_id, platform, captured_at desc, id desc;
revoke all on public.latest_metric_snapshots from public, anon;
grant select on public.latest_metric_snapshots to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();
drop trigger if exists location_platforms_set_updated_at on public.location_platforms;
create trigger location_platforms_set_updated_at
before update on public.location_platforms
for each row execute function public.set_updated_at();

create or replace function public.replace_location_platforms(p_location_id uuid, p_platforms jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_platforms) is distinct from 'array' then
    raise exception 'p_platforms must be a JSON array';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_platforms) as incoming(platform text, url text)
    group by incoming.platform
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'p_platforms contains duplicate platforms';
  end if;

  delete from public.location_platforms as current_link
  where current_link.location_id = p_location_id
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_platforms) as incoming(platform text, url text)
      where incoming.platform = current_link.platform
    );

  insert into public.location_platforms(location_id, platform, url)
  select p_location_id, incoming.platform, incoming.url
  from pg_catalog.jsonb_to_recordset(p_platforms) as incoming(platform text, url text)
  on conflict (location_id, platform) do update
    set url = excluded.url;
end;
$$;

alter table public.locations enable row level security;
alter table public.location_platforms enable row level security;
alter table public.metric_snapshots enable row level security;
alter table public.daily_report_snapshots enable row level security;

drop policy if exists "owners manage their locations" on public.locations;
create policy "owners manage their locations" on public.locations
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "owners manage platform links for their locations" on public.location_platforms;
create policy "owners manage platform links for their locations" on public.location_platforms
for all to authenticated
using (exists (select 1 from public.locations where locations.id = location_platforms.location_id and locations.owner_id = (select auth.uid())))
with check (exists (select 1 from public.locations where locations.id = location_platforms.location_id and locations.owner_id = (select auth.uid())));

drop policy if exists "owners manage snapshots for their locations" on public.metric_snapshots;
create policy "owners manage snapshots for their locations" on public.metric_snapshots
for all to authenticated
using (exists (select 1 from public.locations where locations.id = metric_snapshots.location_id and locations.owner_id = (select auth.uid())))
with check (exists (select 1 from public.locations where locations.id = metric_snapshots.location_id and locations.owner_id = (select auth.uid())));

drop policy if exists "owners manage daily reports for their locations" on public.daily_report_snapshots;
create policy "owners manage daily reports for their locations" on public.daily_report_snapshots
for all to authenticated
using (exists (select 1 from public.locations where locations.id = daily_report_snapshots.location_id and locations.owner_id = (select auth.uid())))
with check (exists (select 1 from public.locations where locations.id = daily_report_snapshots.location_id and locations.owner_id = (select auth.uid())));

grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.location_platforms to authenticated;
grant select, insert, update, delete on public.metric_snapshots to authenticated;
grant select, insert, update, delete on public.daily_report_snapshots to authenticated;
grant select on public.latest_metric_snapshots to authenticated;
revoke all on function public.replace_location_platforms(uuid, jsonb) from public, anon;
grant execute on function public.replace_location_platforms(uuid, jsonb) to authenticated;
grant usage, select on sequence public.metric_snapshots_id_seq to authenticated;
grant usage, select on sequence public.daily_report_snapshots_id_seq to authenticated;

-- Automatic daily hotel sync.
create table if not exists public.automatic_sync_settings (
  owner_id uuid not null references auth.users(id) on delete cascade,
  location_type text not null default 'hotel' check (location_type in ('hotel', 'cafe', 'mart', 'entertainment')),
  enabled boolean not null default false,
  run_hour smallint not null default 2 check (run_hour between 0 and 23),
  location_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (owner_id, location_type)
);

create table if not exists public.automatic_sync_runs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  report_date date not null,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (owner_id, location_id, report_date)
);

create index if not exists automatic_sync_runs_owner_date_idx
  on public.automatic_sync_runs(owner_id, report_date desc);

alter table public.automatic_sync_settings enable row level security;
alter table public.automatic_sync_runs enable row level security;

drop policy if exists "Users read own automatic sync settings" on public.automatic_sync_settings;
create policy "Users read own automatic sync settings" on public.automatic_sync_settings
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "Users read own automatic sync runs" on public.automatic_sync_runs;
create policy "Users read own automatic sync runs" on public.automatic_sync_runs
  for select to authenticated using (owner_id = auth.uid());

grant select on public.automatic_sync_settings to authenticated;
grant select on public.automatic_sync_runs to authenticated;

create or replace function public.save_automatic_sync_settings(
  p_enabled boolean, p_run_hour integer, p_location_ids uuid[], p_location_type text default 'hotel'
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_location_type is null or p_location_type not in ('hotel', 'cafe', 'mart', 'entertainment') then
    raise exception 'Invalid location type';
  end if;
  if p_run_hour is null or p_run_hour < 0 or p_run_hour > 23 then
    raise exception 'Invalid run hour';
  end if;
  if p_location_ids is null or cardinality(p_location_ids) > 100
     or cardinality(p_location_ids) <> (select count(distinct ids.id) from unnest(p_location_ids) as ids(id))
     or exists (
       select 1 from unnest(p_location_ids) as selected_id
       left join public.locations l on l.id = selected_id and l.owner_id = v_owner and l.type = p_location_type
       where l.id is null
     ) then
    raise exception 'Queue must contain distinct locations of this type owned by the current user';
  end if;
  if p_enabled and cardinality(p_location_ids) = 0 then
    raise exception 'Choose at least one location';
  end if;
  insert into public.automatic_sync_settings(owner_id, location_type, enabled, run_hour, location_ids, updated_at)
  values (v_owner, p_location_type, p_enabled, p_run_hour, p_location_ids, now())
  on conflict (owner_id, location_type) do update set
    enabled = excluded.enabled, run_hour = excluded.run_hour,
    location_ids = excluded.location_ids, updated_at = now();
end;
$$;

revoke all on function public.save_automatic_sync_settings(boolean, integer, uuid[], text) from public;
grant execute on function public.save_automatic_sync_settings(boolean, integer, uuid[], text) to authenticated;

-- Per-location Grab merchant login, encrypted by the server; service role only.
create table if not exists public.grab_merchant_accounts (
  location_id uuid primary key references public.locations(id) on delete cascade,
  username text not null check (char_length(trim(username)) between 1 and 200),
  password_encrypted text not null,
  updated_at timestamptz not null default now()
);
alter table public.grab_merchant_accounts enable row level security;
revoke all on public.grab_merchant_accounts from anon, authenticated;

-- In-app notifications (bell in the header): errors and warnings from automatic sync and manual crawls.
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  level text not null default 'error' check (level in ('error', 'warning', 'info')),
  source text not null default 'system' check (char_length(source) <= 40),
  platform text,
  title text not null check (char_length(title) between 1 and 200),
  message text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_owner_created_idx on public.notifications(owner_id, created_at desc);
create index if not exists notifications_owner_unread_idx on public.notifications(owner_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "Users create own notifications" on public.notifications;
create policy "Users create own notifications" on public.notifications
  for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications" on public.notifications
  for delete to authenticated using (owner_id = auth.uid());

revoke all on public.notifications from anon, authenticated;
grant select, insert, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Blue Jay PMS (see migrations/20261015000000_bluejay_api_calls.sql).
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

-- Blue Jay sync settings (single row) and a log of every week pulled, shown in Cài đặt like the automatic review sync.
-- Server (service role) only; the settings page goes through /api/bluejay/sync, which checks the admin role.
create table if not exists public.bluejay_sync_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,          -- cron pulls the last full week, then missing weeks of the backfill range
  backfill_from date check (backfill_from is null or extract(isodow from backfill_from) = 1),
  backfill_to date check (backfill_to is null or extract(isodow from backfill_to) = 1),
  updated_at timestamptz not null default now(),
  check (backfill_from is null or backfill_to is null or backfill_from <= backfill_to)
);
insert into public.bluejay_sync_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.bluejay_sync_runs (
  id bigint generated always as identity primary key,
  week_start date not null,
  trigger text not null check (trigger in ('cron', 'manual', 'script')),
  status text not null check (status in ('running', 'success', 'failed')),
  message text check (char_length(message) <= 1000),
  api_calls integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists bluejay_sync_runs_started_idx on public.bluejay_sync_runs(started_at desc);

alter table public.bluejay_sync_settings enable row level security;
alter table public.bluejay_sync_runs enable row level security;
revoke all on public.bluejay_sync_settings from anon, authenticated;
revoke all on public.bluejay_sync_runs from anon, authenticated;
