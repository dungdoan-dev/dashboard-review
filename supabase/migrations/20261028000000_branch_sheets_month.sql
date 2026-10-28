-- Google Sheet links per month: every month has its own 8 links (4 branches x hotel / fnb).
-- month = 'YYYY-MM' for the link of that month; '' = a link kept for every month that has none of its own (the links saved before this migration).
alter table public.branch_sheets add column if not exists month text not null default '';
alter table public.branch_sheets drop constraint if exists branch_sheets_month_check;
alter table public.branch_sheets add constraint branch_sheets_month_check check (month ~ '^([0-9]{4}-[0-9]{2})?$');
alter table public.branch_sheets drop constraint if exists branch_sheets_pkey;
alter table public.branch_sheets add primary key (hotel_id, kind, month);
