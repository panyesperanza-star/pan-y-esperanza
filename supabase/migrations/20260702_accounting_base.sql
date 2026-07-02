create table if not exists public.accounting_contacts (
  id uuid primary key default gen_random_uuid(),
  contact_type text not null default 'other' check (contact_type in ('supplier', 'donor', 'lender', 'creditor', 'beneficiary', 'other')),
  name text not null check (length(btrim(name)) > 0),
  document_id text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  account_type text not null default 'cash' check (account_type in ('cash', 'bank', 'bizum', 'paypal', 'card', 'other')),
  bank_name text,
  account_number text,
  iban text,
  currency text not null default 'EUR',
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'voided')),
  is_active boolean not null default true,
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('income', 'expense', 'purchase', 'loan', 'debt', 'donation_money', 'donation_in_kind', 'asset', 'social_value', 'correction', 'void')),
  occurred_at date not null default current_date,
  title text not null check (length(btrim(title)) > 0),
  description text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR',
  status text not null default 'active' check (status in ('active', 'voided', 'corrected', 'reversed')),
  contact_id uuid references public.accounting_contacts(id) on delete restrict,
  financial_account_id uuid references public.financial_accounts(id) on delete restrict,
  source_module text,
  source_record_id uuid,
  correction_of_event_id uuid references public.accounting_events(id) on delete restrict,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_documents (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  contact_id uuid references public.accounting_contacts(id) on delete restrict,
  document_type text not null default 'invoice' check (document_type in ('invoice', 'ticket', 'receipt', 'contract', 'proof', 'other')),
  document_number text,
  document_at date,
  due_at date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR',
  file_name text,
  file_path text,
  file_data_url text,
  status text not null default 'active' check (status in ('active', 'voided', 'corrected')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_bank_movements (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_in', 'cash_out', 'bank_in', 'bank_out', 'transfer_in', 'transfer_out', 'adjustment')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EUR',
  movement_at date not null default current_date,
  payment_method text,
  reference text,
  status text not null default 'active' check (status in ('active', 'voided', 'corrected', 'reversed')),
  voided_at timestamptz,
  void_reason text,
  notes text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_records (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  contact_id uuid not null references public.accounting_contacts(id) on delete restrict,
  document_id uuid references public.accounting_documents(id) on delete restrict,
  loan_at date not null default current_date,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  currency text not null default 'EUR',
  reason text not null,
  status text not null default 'active' check (status in ('active', 'partially_repaid', 'repaid', 'voided')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_movements (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loan_records(id) on delete restrict,
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  financial_account_id uuid references public.financial_accounts(id) on delete restrict,
  movement_type text not null check (movement_type in ('loan_received', 'partial_repayment', 'full_repayment', 'correction')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EUR',
  payment_at date not null default current_date,
  status text not null default 'active' check (status in ('active', 'voided', 'corrected', 'reversed')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debt_records (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  contact_id uuid not null references public.accounting_contacts(id) on delete restrict,
  document_id uuid references public.accounting_documents(id) on delete restrict,
  debt_at date not null default current_date,
  due_at date,
  original_amount numeric(14,2) not null check (original_amount > 0),
  currency text not null default 'EUR',
  reason text not null,
  status text not null default 'active' check (status in ('active', 'partially_paid', 'paid', 'voided')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debt_movements (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debt_records(id) on delete restrict,
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  financial_account_id uuid references public.financial_accounts(id) on delete restrict,
  movement_type text not null check (movement_type in ('partial_payment', 'full_payment', 'correction')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EUR',
  payment_at date not null default current_date,
  status text not null default 'active' check (status in ('active', 'voided', 'corrected', 'reversed')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_value_events (
  id uuid primary key default gen_random_uuid(),
  accounting_event_id uuid references public.accounting_events(id) on delete restrict,
  value_type text not null check (value_type in ('received', 'delivered')),
  event_type text not null default 'other' check (event_type in ('in_kind_donation', 'delivery', 'inventory_adjustment', 'volunteer_time', 'other')),
  social_value_at date not null default current_date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR',
  source_module text,
  source_record_id uuid,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  beneficiary_id uuid references public.beneficiaries(id) on delete restrict,
  contact_id uuid references public.accounting_contacts(id) on delete restrict,
  quantity numeric(14,2),
  unit text,
  status text not null default 'active' check (status in ('active', 'voided', 'corrected', 'reversed')),
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_audit_trail (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  previous_data jsonb,
  next_data jsonb,
  user_id uuid references public.app_users(id) on delete set null,
  user_name text,
  user_email text,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.is_accounting_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
      and u.role = 'Superadministrador'
  )
$$;

create trigger accounting_contacts_updated_at before update on public.accounting_contacts for each row execute function public.set_updated_at();
create trigger financial_accounts_updated_at before update on public.financial_accounts for each row execute function public.set_updated_at();
create trigger accounting_events_updated_at before update on public.accounting_events for each row execute function public.set_updated_at();
create trigger accounting_documents_updated_at before update on public.accounting_documents for each row execute function public.set_updated_at();
create trigger cash_bank_movements_updated_at before update on public.cash_bank_movements for each row execute function public.set_updated_at();
create trigger loan_records_updated_at before update on public.loan_records for each row execute function public.set_updated_at();
create trigger loan_movements_updated_at before update on public.loan_movements for each row execute function public.set_updated_at();
create trigger debt_records_updated_at before update on public.debt_records for each row execute function public.set_updated_at();
create trigger debt_movements_updated_at before update on public.debt_movements for each row execute function public.set_updated_at();
create trigger social_value_events_updated_at before update on public.social_value_events for each row execute function public.set_updated_at();

alter table public.accounting_contacts enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.accounting_events enable row level security;
alter table public.accounting_documents enable row level security;
alter table public.cash_bank_movements enable row level security;
alter table public.loan_records enable row level security;
alter table public.loan_movements enable row level security;
alter table public.debt_records enable row level security;
alter table public.debt_movements enable row level security;
alter table public.social_value_events enable row level security;
alter table public.accounting_audit_trail enable row level security;

create policy "accounting_contacts_select_by_permission" on public.accounting_contacts for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "accounting_contacts_insert_by_permission" on public.accounting_contacts for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "accounting_contacts_update_by_permission" on public.accounting_contacts for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "accounting_contacts_delete_superadmin_only" on public.accounting_contacts for delete to authenticated using (public.is_accounting_superadmin());

create policy "financial_accounts_select_by_permission" on public.financial_accounts for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "financial_accounts_insert_by_permission" on public.financial_accounts for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "financial_accounts_update_by_permission" on public.financial_accounts for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "financial_accounts_delete_superadmin_only" on public.financial_accounts for delete to authenticated using (public.is_accounting_superadmin());

create policy "accounting_events_select_by_permission" on public.accounting_events for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "accounting_events_insert_by_permission" on public.accounting_events for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "accounting_events_update_by_permission" on public.accounting_events for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "accounting_events_delete_superadmin_only" on public.accounting_events for delete to authenticated using (public.is_accounting_superadmin());

create policy "accounting_documents_select_by_permission" on public.accounting_documents for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "accounting_documents_insert_by_permission" on public.accounting_documents for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "accounting_documents_update_by_permission" on public.accounting_documents for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "accounting_documents_delete_superadmin_only" on public.accounting_documents for delete to authenticated using (public.is_accounting_superadmin());

create policy "cash_bank_movements_select_by_permission" on public.cash_bank_movements for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "cash_bank_movements_insert_by_permission" on public.cash_bank_movements for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "cash_bank_movements_update_by_permission" on public.cash_bank_movements for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));

create policy "loan_records_select_by_permission" on public.loan_records for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "loan_records_insert_by_permission" on public.loan_records for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "loan_records_update_by_permission" on public.loan_records for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "loan_records_delete_superadmin_only" on public.loan_records for delete to authenticated using (public.is_accounting_superadmin());

create policy "loan_movements_select_by_permission" on public.loan_movements for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "loan_movements_insert_by_permission" on public.loan_movements for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "loan_movements_update_by_permission" on public.loan_movements for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));

create policy "debt_records_select_by_permission" on public.debt_records for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "debt_records_insert_by_permission" on public.debt_records for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "debt_records_update_by_permission" on public.debt_records for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "debt_records_delete_superadmin_only" on public.debt_records for delete to authenticated using (public.is_accounting_superadmin());

create policy "debt_movements_select_by_permission" on public.debt_movements for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "debt_movements_insert_by_permission" on public.debt_movements for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "debt_movements_update_by_permission" on public.debt_movements for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));

create policy "social_value_events_select_by_permission" on public.social_value_events for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "social_value_events_insert_by_permission" on public.social_value_events for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "social_value_events_update_by_permission" on public.social_value_events for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));

create policy "accounting_audit_trail_select_by_permission" on public.accounting_audit_trail for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "accounting_audit_trail_insert_by_permission" on public.accounting_audit_trail for insert to authenticated with check (public.can_app_permission('accounting', 'create'));

revoke insert, update, delete on public.cash_bank_movements from authenticated;
revoke insert, update, delete on public.loan_movements from authenticated;
revoke insert, update, delete on public.debt_movements from authenticated;
revoke insert, update, delete on public.social_value_events from authenticated;
revoke insert, update, delete on public.accounting_audit_trail from authenticated;

grant select, insert, update, delete on public.accounting_contacts to authenticated;
grant select, insert, update, delete on public.financial_accounts to authenticated;
grant select, insert, update, delete on public.accounting_events to authenticated;
grant select, insert, update, delete on public.accounting_documents to authenticated;
grant select, insert, update on public.cash_bank_movements to authenticated;
grant select, insert, update, delete on public.loan_records to authenticated;
grant select, insert, update on public.loan_movements to authenticated;
grant select, insert, update, delete on public.debt_records to authenticated;
grant select, insert, update on public.debt_movements to authenticated;
grant select, insert, update on public.social_value_events to authenticated;
grant select, insert on public.accounting_audit_trail to authenticated;
grant execute on function public.is_accounting_superadmin() to authenticated;

create index if not exists accounting_events_date_idx on public.accounting_events (occurred_at desc, created_at desc);
create index if not exists accounting_events_status_idx on public.accounting_events (status, event_type);
create index if not exists financial_accounts_type_idx on public.financial_accounts (account_type, status);
create index if not exists cash_bank_movements_account_date_idx on public.cash_bank_movements (financial_account_id, movement_at desc);
create index if not exists accounting_documents_event_idx on public.accounting_documents (accounting_event_id);
create index if not exists loan_records_status_idx on public.loan_records (status, loan_at desc);
create index if not exists loan_movements_loan_idx on public.loan_movements (loan_id, payment_at desc);
create index if not exists debt_records_status_idx on public.debt_records (status, due_at, debt_at desc);
create index if not exists debt_movements_debt_idx on public.debt_movements (debt_id, payment_at desc);
create index if not exists social_value_events_type_date_idx on public.social_value_events (value_type, event_type, social_value_at desc);
create index if not exists accounting_audit_record_idx on public.accounting_audit_trail (table_name, record_id, happened_at desc);

update public.roles
set modules = case
  when modules ? '*' then modules
  when not (modules ? 'accounting') then modules || '["accounting"]'::jsonb
  else modules
end
where name in ('Presidenta', 'Tesorera', 'Tesorero', 'Superadministrador');

update public.app_users
set permissions = case
    when permissions ? '*' then permissions
    when not (permissions ? 'accounting') then permissions || '["accounting"]'::jsonb
    else permissions
  end,
  permission_matrix = jsonb_set(
    coalesce(permission_matrix, '{}'::jsonb),
    '{accounting}',
    jsonb_build_object(
      'view', true,
      'create', role in ('Superadministrador', 'Presidenta', 'Tesorera', 'Tesorero'),
      'edit', role in ('Superadministrador', 'Presidenta', 'Tesorera', 'Tesorero'),
      'delete', role = 'Superadministrador'
    ),
    true
  )
where role in ('Superadministrador', 'Presidenta', 'Tesorera', 'Tesorero');
