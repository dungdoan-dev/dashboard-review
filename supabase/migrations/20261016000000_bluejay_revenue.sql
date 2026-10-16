-- Blue Jay PMS: revenue and payment report per booking plus service revenue per day, one row per week
-- (rebuilt on every refresh, like bluejay_weekly_reports). Server (service role) only; the admin check is in src/lib/bluejay-auth.ts.
create table if not exists public.bluejay_revenue_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  revenue jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.bluejay_revenue_weeks enable row level security;
revoke all on public.bluejay_revenue_weeks from anon, authenticated;
