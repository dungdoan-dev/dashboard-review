-- Per-location Grab merchant login. Password is AES-GCM encrypted by the server (GRAB_CREDENTIALS_KEY).
-- RLS is on with no policies: only the service role (API route / local scraper) can read or write.
create table if not exists public.grab_merchant_accounts (
  location_id uuid primary key references public.locations(id) on delete cascade,
  username text not null check (char_length(trim(username)) between 1 and 200),
  password_encrypted text not null,
  updated_at timestamptz not null default now()
);
alter table public.grab_merchant_accounts enable row level security;
revoke all on public.grab_merchant_accounts from anon, authenticated;
