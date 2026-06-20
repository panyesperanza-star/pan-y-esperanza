create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  user_email text,
  action text not null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
drop policy if exists "authenticated_read_audit_logs" on public.audit_logs;
drop policy if exists "authenticated_write_audit_logs" on public.audit_logs;
create policy "authenticated_read_audit_logs" on public.audit_logs for select to authenticated using (true);
create policy "authenticated_write_audit_logs" on public.audit_logs for all to authenticated using (true) with check (true);

alter table public.app_users
  add column if not exists position text,
  add column if not exists permission_matrix jsonb not null default '{}'::jsonb,
  add column if not exists profile_photo text,
  add column if not exists last_access_at timestamptz,
  add column if not exists created_by text;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
add constraint app_users_role_check
check (role in ('Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinador', 'Voluntario', 'Presidente', 'Tesorero', 'Secretario', 'Administrador', 'Consulta'));

insert into public.roles (id, name, modules)
values
  ('presidenta', 'Presidenta', '["beneficiaries", "families", "deliveries", "receipts", "inventory", "donations", "treasury", "reports", "users", "settings"]'::jsonb),
  ('secretaria', 'Secretaria', '["beneficiaries", "families", "receipts", "reports", "users", "settings"]'::jsonb),
  ('tesorera', 'Tesorera', '["donations", "treasury", "reports", "receipts"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;
