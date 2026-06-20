alter table public.organization_settings
  add column if not exists mail_sender_name text,
  add column if not exists mail_sender_email text,
  add column if not exists mail_provider text default 'Resend',
  add column if not exists smtp_host text,
  add column if not exists smtp_port integer default 587,
  add column if not exists smtp_user text,
  add column if not exists smtp_password text,
  add column if not exists smtp_secure boolean not null default false;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  recipient text not null,
  sent_by text,
  receipts_count integer not null default 0,
  result text,
  subject text,
  message text,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.email_logs enable row level security;
drop policy if exists "authenticated_read_email_logs" on public.email_logs;
drop policy if exists "authenticated_write_email_logs" on public.email_logs;
create policy "authenticated_read_email_logs" on public.email_logs for select to authenticated using (true);
create policy "authenticated_write_email_logs" on public.email_logs for all to authenticated using (true) with check (true);

alter table public.treasury_incomes add column if not exists category text not null default 'Donaciones';
alter table public.treasury_expenses add column if not exists category text not null default 'Alimentacion';
alter table public.treasury_accounts add column if not exists movements text;

alter table public.treasury_loans drop constraint if exists treasury_loans_status_check;
alter table public.treasury_loans
add constraint treasury_loans_status_check
check (status in ('Pendiente', 'Pendiente de devolver', 'Devuelto', 'Parcialmente devuelto'));

alter table public.treasury_accounts drop constraint if exists treasury_accounts_account_type_check;
alter table public.treasury_accounts
add constraint treasury_accounts_account_type_check
check (account_type in ('Caja', 'Banco', 'Caja efectivo', 'Cuenta bancaria'));

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
add constraint app_users_role_check
check (role in ('Superadministrador', 'Presidente', 'Tesorero', 'Secretario', 'Coordinador', 'Voluntario', 'Administrador', 'Consulta'));

insert into public.roles (id, name, modules)
values
  ('president', 'Presidente', '["*"]'::jsonb),
  ('secretary', 'Secretario', '["beneficiaries", "families", "receipts", "volunteers", "reports", "settings"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;
