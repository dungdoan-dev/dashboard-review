-- Staff of the HR Google Sheets (one file per unit in the shared Drive folder), copied once a day at 08:00 VN by /api/cron/hr.
-- Only the fields the Nhân sự page shows: no ID numbers, tax / insurance codes, phone, address, bank account or salary. Server (service role) only.
create table if not exists public.hr_staff (
  unit text not null,              -- the file's unit: "VJH", "Vistara Sơn Trà", ...
  staff_id text not null,          -- "Mã số NV"
  name text not null default '',
  department text not null default '',
  position text not null default '',
  level text not null default '',
  job_type text not null default '',
  gender text not null default '',
  birth_date date,
  start_date date,
  end_date date,                   -- "Ngày nghỉ việc"
  status text not null default '', -- "🟢 Đang làm" | "🔴 Đã nghỉ"
  marital text not null default '',
  education text not null default '',
  hiring_source text not null default '',
  contract_type text not null default '',
  contract_end date,
  probation_status text not null default '',
  probation_end date,
  leave_reason text not null default '',
  synced_at timestamptz not null default now(),
  primary key (unit, staff_id)
);
-- The result of the last sync of each file: a file that fails keeps its old rows and shows the error here.
create table if not exists public.hr_sync (
  unit text primary key,
  file_id text not null,
  file_name text not null,
  staff_count int not null default 0,
  error text,
  synced_at timestamptz not null default now()
);
alter table public.hr_staff enable row level security;
alter table public.hr_sync enable row level security;
revoke all on public.hr_staff, public.hr_sync from anon, authenticated;
