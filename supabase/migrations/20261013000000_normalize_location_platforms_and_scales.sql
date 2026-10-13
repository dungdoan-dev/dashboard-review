-- Move source URLs out of locations, standardize rating scales, and protect latest snapshots.

create table if not exists public.location_platforms (
  location_id uuid not null references public.locations(id) on delete cascade,
  platform text not null check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka')),
  url text not null check (char_length(trim(url)) between 8 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, platform)
);

insert into public.location_platforms(location_id, platform, url)
select l.id, source.platform, source.url
from public.locations as l
cross join lateral (values
  ('google', l.google_url),
  ('tripadvisor', l.tripadvisor_url),
  ('agoda', l.agoda_url),
  ('booking', l.booking_url),
  ('expedia', l.expedia_url),
  ('tripcom', l.tripcom_url),
  ('traveloka', l.traveloka_url)
) as source(platform, url)
where nullif(trim(source.url), '') is not null
on conflict (location_id, platform) do update set url = excluded.url;

alter table public.locations drop column if exists google_url;
alter table public.locations drop column if exists tripadvisor_url;
alter table public.locations drop column if exists agoda_url;
alter table public.locations drop column if exists booking_url;
alter table public.locations drop column if exists expedia_url;
alter table public.locations drop column if exists tripcom_url;
alter table public.locations drop column if exists traveloka_url;

alter table public.metric_snapshots drop column if exists rating_label;
alter table public.metric_snapshots alter column rating_scale drop default;
alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_check;
alter table public.metric_snapshots add constraint metric_snapshots_platform_check
  check (platform in ('google', 'tripadvisor', 'agoda', 'booking', 'expedia', 'tripcom', 'traveloka'));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_source_check;
alter table public.metric_snapshots add constraint metric_snapshots_source_check
  check (source in ('manual', 'api', 'import', 'crawler'));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_rating_value_check;
alter table public.metric_snapshots add constraint metric_snapshots_rating_value_check
  check (rating_value is null or (rating_value >= 0 and rating_value <= rating_scale));
alter table public.metric_snapshots drop constraint if exists metric_snapshots_platform_rating_scale_check;

-- Older records stored Trip.com on a 5 point scale; convert them before enforcing the 10 point scale.
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
    ('traveloka', 10::numeric)
) as target(platform, scale)
where metric_snapshots.platform = target.platform
  and metric_snapshots.rating_scale <> target.scale;

alter table public.metric_snapshots add constraint metric_snapshots_platform_rating_scale_check
  check (
    (platform in ('google', 'tripadvisor') and rating_scale = 5)
    or (platform in ('agoda', 'booking', 'tripcom', 'traveloka') and rating_scale = 10)
    or (platform = 'expedia' and rating_scale in (5, 10))
  );

create index if not exists location_platforms_platform_idx on public.location_platforms(platform);
create index if not exists snapshots_location_platform_time_idx
  on public.metric_snapshots(location_id, platform, captured_at desc, id desc);

create or replace view public.latest_metric_snapshots
with (security_invoker = true)
as
select distinct on (location_id, platform)
  id, location_id, platform, rating_scale, rating_value, review_count, count_label, captured_at, source
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
  on conflict (location_id, platform) do update set url = excluded.url;
end;
$$;

alter table public.location_platforms enable row level security;
drop policy if exists "owners manage platform links for their locations" on public.location_platforms;
create policy "owners manage platform links for their locations"
on public.location_platforms for all to authenticated
using (exists (
  select 1 from public.locations
  where locations.id = location_platforms.location_id
    and locations.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.locations
  where locations.id = location_platforms.location_id
    and locations.owner_id = (select auth.uid())
));

grant select, insert, update, delete on public.location_platforms to authenticated;
revoke all on function public.replace_location_platforms(uuid, jsonb) from public, anon;
grant execute on function public.replace_location_platforms(uuid, jsonb) to authenticated;
