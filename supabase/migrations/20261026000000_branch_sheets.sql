-- Google Sheet links of every branch: one for the hotel (thu chi + kho) and one for Ăn sáng, cafe, mini mart ("fnb").
-- Server (service role) only; Cài đặt goes through /api/bluejay/branch-sheets, which checks the admin role.
-- The four hotel links that used to be fixed in src/lib/ledger-sheets.ts are seeded here.
create table if not exists public.branch_sheets (
  hotel_id integer not null,                         -- Blue Jay hotel id = the branch
  kind text not null check (kind in ('hotel', 'fnb')),
  sheet_id text not null check (sheet_id ~ '^[A-Za-z0-9_-]{20,}$'),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, kind)
);
insert into public.branch_sheets (hotel_id, kind, sheet_id) values
  (5381, 'hotel', '1HvweFPj0RlzUA3qUaBYVQOoHh8PrBLpuTvDIqIelTmU'), -- Sontra Sea
  (6836, 'hotel', '1LJgUrctGwBPcynAjdHZlG4u8kbhCpuZGk4R9GWxciOk'), -- Vistara Gia Lai
  (6495, 'hotel', '1b_38S409K5glxanqYGUU8IpsKroV0Gq8h5ppeK006Tc'), -- Vistara Quy Nhon
  (6209, 'hotel', '15_6wGXPamuVApuTmyeUDH01J2OFHgr-d0GeTWVUhcIo')  -- Yzistel Hoi An
on conflict (hotel_id, kind) do nothing;
alter table public.branch_sheets enable row level security;
revoke all on public.branch_sheets from anon, authenticated;
