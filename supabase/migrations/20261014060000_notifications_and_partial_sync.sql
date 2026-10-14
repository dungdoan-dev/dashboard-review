-- Automatic sync can now finish "partial": sources that succeeded are finalized, failed ones are reported.
alter table public.automatic_sync_runs drop constraint if exists automatic_sync_runs_status_check;
alter table public.automatic_sync_runs add constraint automatic_sync_runs_status_check
  check (status in ('running', 'success', 'partial', 'failed'));

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
