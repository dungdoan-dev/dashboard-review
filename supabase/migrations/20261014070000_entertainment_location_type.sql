-- Fourth location type: entertainment venues (Google Maps and Tripadvisor only).
alter table public.locations drop constraint if exists locations_type_check;
alter table public.locations add constraint locations_type_check
  check (type in ('hotel', 'cafe', 'mart', 'restaurant', 'resort', 'homestay', 'other', 'entertainment'));

alter table public.automatic_sync_settings drop constraint if exists automatic_sync_settings_location_type_check;
alter table public.automatic_sync_settings add constraint automatic_sync_settings_location_type_check
  check (location_type in ('hotel', 'cafe', 'mart', 'entertainment'));

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
