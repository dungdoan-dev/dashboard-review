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
