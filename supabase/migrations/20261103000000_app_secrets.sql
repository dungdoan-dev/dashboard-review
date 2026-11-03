-- API keys and tokens the app calls other services with (ZenRows, Apify, Windsor, Blue Jay, Google service account, HR Apps Script), edited in Cài đặt → Khóa API instead of the server's .env.
-- The value is encrypted (AES-256-GCM, key GRAB_CREDENTIALS_KEY from .env, like the Grab merchant passwords); a name with no row falls back to the .env value. Server (service role) only.
create table if not exists public.app_secrets (
  name text primary key,
  value_encrypted text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
