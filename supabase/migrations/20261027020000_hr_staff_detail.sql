-- The rest of the sheet's Hồ sơ NV tab for public.hr_staff (profile fields). Still not stored: ID card, social insurance and tax numbers, salary, insurance base, bank account.
alter table public.hr_staff
  add column if not exists children text not null default '',
  add column if not exists ethnicity text not null default '',
  add column if not exists religion text not null default '',
  add column if not exists nationality text not null default '',
  add column if not exists school text not null default '',
  add column if not exists major text not null default '',
  add column if not exists certificate text not null default '',
  add column if not exists grad_year text not null default '',
  add column if not exists grade text not null default '',
  add column if not exists work_email text not null default '',
  add column if not exists personal_email text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists address text not null default '',
  add column if not exists district text not null default '',
  add column if not exists province text not null default '',
  add column if not exists contract_link text not null default '',
  add column if not exists probation_start date;
