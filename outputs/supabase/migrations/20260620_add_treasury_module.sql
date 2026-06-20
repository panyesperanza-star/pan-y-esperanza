create table if not exists public.treasury_incomes (
  id uuid primary key default gen_random_uuid(),
  income_at date not null default current_date,
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  donor text,
  payment_method text,
  notes text,
  document_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.treasury_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_at date not null default current_date,
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  supplier text,
  responsible text,
  invoice_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.treasury_loans (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  loan_at date not null default current_date,
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Devuelto')),
  returned_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null default 'Caja' check (account_type in ('Caja', 'Banco')),
  balance numeric(12,2) not null default 0,
  bank_name text,
  account_number text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.treasury_incomes enable row level security;
alter table public.treasury_expenses enable row level security;
alter table public.treasury_loans enable row level security;
alter table public.treasury_accounts enable row level security;

create or replace function public.can_write_treasury()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where is_active = true
      and role in ('Superadministrador', 'Tesorera', 'Tesorero')
      and (
        auth_user_id = auth.uid()
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

drop policy if exists "authenticated_read_treasury_incomes" on public.treasury_incomes;
drop policy if exists "authenticated_write_treasury_incomes" on public.treasury_incomes;
drop policy if exists "treasury_write_treasury_incomes" on public.treasury_incomes;
drop policy if exists "authenticated_read_treasury_expenses" on public.treasury_expenses;
drop policy if exists "authenticated_write_treasury_expenses" on public.treasury_expenses;
drop policy if exists "treasury_write_treasury_expenses" on public.treasury_expenses;
drop policy if exists "authenticated_read_treasury_loans" on public.treasury_loans;
drop policy if exists "authenticated_write_treasury_loans" on public.treasury_loans;
drop policy if exists "treasury_write_treasury_loans" on public.treasury_loans;
drop policy if exists "authenticated_read_treasury_accounts" on public.treasury_accounts;
drop policy if exists "authenticated_write_treasury_accounts" on public.treasury_accounts;
drop policy if exists "treasury_write_treasury_accounts" on public.treasury_accounts;

create policy "authenticated_read_treasury_incomes" on public.treasury_incomes for select to authenticated using (true);
create policy "treasury_write_treasury_incomes" on public.treasury_incomes for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_expenses" on public.treasury_expenses for select to authenticated using (true);
create policy "treasury_write_treasury_expenses" on public.treasury_expenses for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_loans" on public.treasury_loans for select to authenticated using (true);
create policy "treasury_write_treasury_loans" on public.treasury_loans for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_accounts" on public.treasury_accounts for select to authenticated using (true);
create policy "treasury_write_treasury_accounts" on public.treasury_accounts for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());

create index if not exists treasury_incomes_date_idx on public.treasury_incomes (income_at desc);
create index if not exists treasury_expenses_date_idx on public.treasury_expenses (expense_at desc);
create index if not exists treasury_loans_status_idx on public.treasury_loans (status, loan_at desc);

update public.roles
set modules = '["donations", "treasury", "reports", "receipts"]'::jsonb
where id = 'treasurer';

update public.roles
set modules = '["*"]'::jsonb
where id = 'admin';

update public.roles
set modules = '["beneficiaries", "families", "deliveries", "inventory", "treasury", "receipts", "reports"]'::jsonb
where id = 'coordinator';

update public.roles
set modules = '["beneficiaries", "deliveries", "inventory", "treasury"]'::jsonb
where id = 'volunteer';
