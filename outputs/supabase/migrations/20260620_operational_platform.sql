alter table public.inventory_items
  add column if not exists estimated_value numeric(12,2) not null default 0;

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  donor_type text not null default 'Particular' check (donor_type in ('Empresa', 'Iglesia', 'Supermercado', 'Particular')),
  estimated_value numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.treasury_incomes
  add column if not exists receipt_name text;

alter table public.treasury_expenses
  add column if not exists ticket_name text,
  add column if not exists receipt_name text;

alter table public.donors enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'donors' and policyname = 'authenticated_read_donors') then
    create policy "authenticated_read_donors" on public.donors for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'donors' and policyname = 'authenticated_write_donors') then
    create policy "authenticated_write_donors" on public.donors for all to authenticated using (true) with check (true);
  end if;
end $$;

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in (
    'Superadministrador',
    'Presidenta',
    'Secretaria',
    'Tesorera',
    'Coordinadora',
    'Voluntario',
    'Coordinador',
    'Presidente',
    'Tesorero',
    'Secretario',
    'Administrador',
    'Consulta'
  ));

insert into public.roles (id, name, modules)
values ('coordinator', 'Coordinadora', '["beneficiaries", "families", "deliveries", "receipts", "inventory", "reports"]'::jsonb)
on conflict (id) do update set name = excluded.name, modules = excluded.modules;

create index if not exists donors_name_idx on public.donors (name);
create index if not exists inventory_expiry_idx on public.inventory_items (expires_at);
