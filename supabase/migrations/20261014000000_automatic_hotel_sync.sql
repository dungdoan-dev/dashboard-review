create table if not exists public.automatic_sync_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  run_hour smallint not null default 2 check (run_hour between 0 and 23),
  location_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.automatic_sync_runs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  report_date date not null,
  status text not null check (status in ('running', 'success', 'failed')),
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
  p_enabled boolean, p_run_hour integer, p_location_ids uuid[]
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if p_run_hour is null or p_run_hour < 0 or p_run_hour > 23 then
    raise exception 'Invalid run hour';
  end if;
  if p_location_ids is null or cardinality(p_location_ids) > 100
     or cardinality(p_location_ids) <> (select count(distinct ids.id) from unnest(p_location_ids) as ids(id))
     or exists (
       select 1 from unnest(p_location_ids) as selected_id
       left join public.locations l on l.id = selected_id and l.owner_id = v_owner and l.type = 'hotel'
       where l.id is null
     ) then
    raise exception 'Queue must contain distinct hotels owned by the current user';
  end if;
  if p_enabled and cardinality(p_location_ids) = 0 then
    raise exception 'Choose at least one hotel';
  end if;
  insert into public.automatic_sync_settings(owner_id, enabled, run_hour, location_ids, updated_at)
  values (v_owner, p_enabled, p_run_hour, p_location_ids, now())
  on conflict (owner_id) do update set
    enabled = excluded.enabled, run_hour = excluded.run_hour,
    location_ids = excluded.location_ids, updated_at = now();
end;
$$;

revoke all on function public.save_automatic_sync_settings(boolean, integer, uuid[]) from public;
grant execute on function public.save_automatic_sync_settings(boolean, integer, uuid[]) to authenticated;
