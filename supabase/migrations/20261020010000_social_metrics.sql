-- Facebook Page, Instagram, TikTok, Facebook Ads and Google Ads figures from Windsor.ai, stored as the raw Windsor rows so the pages sum them like before.
-- source: facebook | instagram | tiktok | ads | gads (Google Ads). Server (service role) only; the admin check is in src/lib/bluejay-auth.ts.
create table if not exists public.social_days (
  source text not null,
  key text not null,           -- account id (campaign id for ads)
  day date not null,
  row jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, key, day)
);
create table if not exists public.social_posts (
  source text not null,
  post_id text not null,
  created_at timestamptz not null,
  row jsonb not null,
  primary key (source, post_id)
);
alter table public.social_days enable row level security;
alter table public.social_posts enable row level security;
revoke all on public.social_days, public.social_posts from anon, authenticated;
