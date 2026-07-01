create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beneficiary-photos', 'beneficiary-photos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.beneficiary_sequence (
  id smallint primary key default 1,
  last_value integer not null default 0,
  constraint beneficiary_sequence_single_row check (id = 1)
);

insert into public.beneficiary_sequence (id, last_value)
values (1, 0)
on conflict (id) do nothing;

create or replace function public.next_beneficiary_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  update public.beneficiary_sequence
  set last_value = last_value + 1
  where id = 1
  returning last_value into next_value;
  return 'PYE-' || lpad(next_value::text, 5, '0');
end;
$$;

create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_beneficiary_code(),
  full_name text not null,
  family_id uuid,
  document_id text unique,
  address_full text,
  postal_code text,
  phone text,
  email text,
  photo_url text,
  photo_data_url text,
  birth_date date,
  sex text,
  nationality text,
  marital_status text,
  attached_document_name text,
  first_attention_at date,
  family_members integer not null default 1 check (family_members >= 1),
  minors_count integer not null default 0 check (minors_count >= 0),
  situation text not null default 'Activa' check (situation in ('Activa', 'Urgente', 'Seguimiento', 'Inactiva')),
  requested_help text,
  notes text,
  joined_at date not null default current_date,
  is_active boolean not null default true,
  last_help_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_settings (
  id text primary key default 'main',
  name text not null default 'Pan y Esperanza',
  cif text,
  address text,
  phone text,
  email text,
  website text,
  logo_path text,
  mail_sender_name text,
  mail_sender_email text,
  mail_provider text default 'Resend',
  smtp_host text,
  smtp_port integer default 587,
  smtp_user text,
  smtp_password text,
  smtp_secure boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique,
  responsible_name text not null,
  address text,
  phone text,
  email text,
  dependents_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.social_history (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references public.beneficiaries(id) on delete cascade,
  date date not null default current_date,
  entry_type text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.beneficiary_documents (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references public.beneficiaries(id) on delete cascade,
  document_type text not null,
  file_name text,
  file_data_url text,
  uploaded_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  lot text,
  expires_at date,
  donor text,
  location text,
  unit text not null default 'unidades',
  stock numeric(12,2) not null default 0 check (stock >= 0),
  low_stock_threshold numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  beneficiary_name text,
  family_id uuid,
  family_name text,
  delivered_at date not null default current_date,
  delivered_time time,
  responsible text,
  help_type text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_item_name text,
  receiver_name text,
  receiver_document_id text,
  reception_at timestamptz,
  signature_data_url text,
  responsible_signature_data_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  recipient text not null,
  sent_by text,
  receipts_count integer not null default 0,
  result text,
  subject text,
  message text,
  attachments jsonb not null default '[]'::jsonb,
  provider_id text,
  status text not null default 'Enviado',
  receipt_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor text not null,
  donor_kind text,
  donation_type text,
  donated_at date not null default current_date,
  estimated_value numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_incomes (
  id uuid primary key default gen_random_uuid(),
  income_at date not null default current_date,
  category text not null default 'Donaciones',
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  donor text,
  payment_method text,
  notes text,
  document_name text,
  created_at timestamptz not null default now()
);

create table public.treasury_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_at date not null default current_date,
  category text not null default 'Alimentacion',
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  supplier text,
  responsible text,
  invoice_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_loans (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  loan_at date not null default current_date,
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Pendiente de devolver' check (status in ('Pendiente', 'Pendiente de devolver', 'Devuelto', 'Parcialmente devuelto')),
  returned_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null default 'Caja efectivo' check (account_type in ('Caja', 'Banco', 'Caja efectivo', 'Cuenta bancaria')),
  balance numeric(12,2) not null default 0,
  bank_name text,
  account_number text,
  movements text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  item_name text,
  movement_type text not null check (movement_type in ('Entrada', 'Salida')),
  quantity numeric(12,2) not null check (quantity > 0),
  moved_at date not null default current_date,
  responsible text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  document_id text,
  phone text,
  email text,
  training text,
  availability text,
  documentation text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.volunteer_history (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid references public.volunteers(id) on delete cascade,
  date date not null default current_date,
  activity text,
  hours numeric(6,2),
  notes text,
  created_at timestamptz not null default now()
);

create table public.roles (
  id text primary key,
  name text not null,
  modules jsonb not null default '[]'::jsonb
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  user_email text,
  action text not null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text,
  email text not null unique,
  phone text,
  role text not null check (role in ('Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Voluntario', 'Coordinador', 'Presidente', 'Tesorero', 'Secretario', 'Administrador', 'Consulta')),
  position text,
  status text not null default 'Activo' check (status in ('Activo', 'Inactivo', 'Bloqueado')),
  is_active boolean not null default true,
  permissions jsonb not null default '[]'::jsonb,
  permission_matrix jsonb not null default '{}'::jsonb,
  profile_photo text,
  last_access_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index password_reset_tokens_email_idx on public.password_reset_tokens (lower(email));
create index password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger beneficiaries_updated_at before update on public.beneficiaries for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();

create or replace function public.apply_delivery_effects()
returns trigger
language plpgsql
as $$
begin
  update public.beneficiaries
  set last_help_at = new.delivered_at
  where id = new.beneficiary_id;

  if new.inventory_item_id is not null then
    update public.inventory_items
    set stock = greatest(stock - new.quantity, 0)
    where id = new.inventory_item_id;

    insert into public.inventory_movements (item_id, item_name, movement_type, quantity, moved_at, responsible, notes)
    values (new.inventory_item_id, new.inventory_item_name, 'Salida', new.quantity, new.delivered_at, new.responsible, 'Salida automatica por entrega');
  end if;

  return new;
end;
$$;

create trigger deliveries_apply_effects
after insert on public.deliveries
for each row execute function public.apply_delivery_effects();

alter table public.beneficiaries enable row level security;
alter table public.organization_settings enable row level security;
alter table public.families enable row level security;
alter table public.social_history enable row level security;
alter table public.beneficiary_documents enable row level security;
alter table public.deliveries enable row level security;
alter table public.email_logs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.donations enable row level security;
alter table public.treasury_incomes enable row level security;
alter table public.treasury_expenses enable row level security;
alter table public.treasury_loans enable row level security;
alter table public.treasury_accounts enable row level security;
alter table public.volunteers enable row level security;
alter table public.volunteer_history enable row level security;
alter table public.roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_users enable row level security;
alter table public.password_reset_tokens enable row level security;

create policy "authenticated_read_beneficiaries" on public.beneficiaries for select to authenticated using (true);
create policy "authenticated_write_beneficiaries" on public.beneficiaries for all to authenticated using (true) with check (true);
create policy "authenticated_read_organization_settings" on public.organization_settings for select to authenticated using (true);
create policy "authenticated_write_organization_settings" on public.organization_settings for all to authenticated using (true) with check (true);
create policy "authenticated_read_families" on public.families for select to authenticated using (true);
create policy "authenticated_write_families" on public.families for all to authenticated using (true) with check (true);
create policy "authenticated_read_social_history" on public.social_history for select to authenticated using (true);
create policy "authenticated_write_social_history" on public.social_history for all to authenticated using (true) with check (true);
create policy "authenticated_read_beneficiary_documents" on public.beneficiary_documents for select to authenticated using (true);
create policy "authenticated_write_beneficiary_documents" on public.beneficiary_documents for all to authenticated using (true) with check (true);
create policy "authenticated_read_deliveries" on public.deliveries for select to authenticated using (true);
create policy "authenticated_write_deliveries" on public.deliveries for all to authenticated using (true) with check (true);
create policy "authenticated_read_email_logs" on public.email_logs for select to authenticated using (true);
create policy "authenticated_write_email_logs" on public.email_logs for all to authenticated using (true) with check (true);
create policy "authenticated_read_inventory_items" on public.inventory_items for select to authenticated using (true);
create policy "authenticated_write_inventory_items" on public.inventory_items for all to authenticated using (true) with check (true);
create policy "authenticated_read_inventory_movements" on public.inventory_movements for select to authenticated using (true);
create policy "authenticated_write_inventory_movements" on public.inventory_movements for all to authenticated using (true) with check (true);
create policy "authenticated_read_donations" on public.donations for select to authenticated using (true);
create policy "authenticated_write_donations" on public.donations for all to authenticated using (true) with check (true);
create policy "authenticated_read_treasury_incomes" on public.treasury_incomes for select to authenticated using (true);
create policy "treasury_write_treasury_incomes" on public.treasury_incomes for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_expenses" on public.treasury_expenses for select to authenticated using (true);
create policy "treasury_write_treasury_expenses" on public.treasury_expenses for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_loans" on public.treasury_loans for select to authenticated using (true);
create policy "treasury_write_treasury_loans" on public.treasury_loans for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_treasury_accounts" on public.treasury_accounts for select to authenticated using (true);
create policy "treasury_write_treasury_accounts" on public.treasury_accounts for all to authenticated using (public.can_write_treasury()) with check (public.can_write_treasury());
create policy "authenticated_read_volunteers" on public.volunteers for select to authenticated using (true);
create policy "authenticated_write_volunteers" on public.volunteers for all to authenticated using (true) with check (true);
create policy "authenticated_read_volunteer_history" on public.volunteer_history for select to authenticated using (true);
create policy "authenticated_write_volunteer_history" on public.volunteer_history for all to authenticated using (true) with check (true);
create policy "authenticated_read_roles" on public.roles for select to authenticated using (true);
create policy "authenticated_write_roles" on public.roles for all to authenticated using (true) with check (true);
create policy "authenticated_read_audit_logs" on public.audit_logs for select to authenticated using (true);
create policy "authenticated_write_audit_logs" on public.audit_logs for all to authenticated using (true) with check (true);
create policy "password_reset_tokens_no_client_access" on public.password_reset_tokens for all to authenticated using (false) with check (false);

create or replace function public.current_app_user()
returns public.app_users
language sql
stable
security definer
set search_path = public
as $$
  select u
  from public.app_users u
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.is_app_admin()
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
      and (
        u.role in ('Superadministrador', 'Presidenta', 'Secretaria', 'Administrador')
        or u.permissions ? 'users'
        or u.permissions ? '*'
        or coalesce((u.permission_matrix -> 'users' ->> 'create')::boolean, false) = true
        or coalesce((u.permission_matrix -> 'users' ->> 'edit')::boolean, false) = true
        or coalesce((u.permission_matrix -> 'users' ->> 'delete')::boolean, false) = true
      )
  )
$$;

create policy "app_users_select_self_or_admin" on public.app_users for select to authenticated using (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
create policy "app_users_insert_admin" on public.app_users for insert to authenticated with check (public.is_app_admin());
create policy "app_users_update_self_or_admin" on public.app_users for update to authenticated using (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
) with check (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);
create policy "app_users_delete_admin" on public.app_users for delete to authenticated using (public.is_app_admin());
grant execute on function public.current_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;

create policy "authenticated_read_documentos" on storage.objects for select to authenticated using (bucket_id = 'documentos');
create policy "authenticated_write_documentos" on storage.objects for all to authenticated using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
create policy "beneficiary_photos_select_by_permission" on storage.objects for select to authenticated using (
  bucket_id = 'beneficiary-photos'
);
create policy "beneficiary_photos_insert_by_permission" on storage.objects for insert to authenticated with check (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
);
create policy "beneficiary_photos_delete_by_permission" on storage.objects for delete to authenticated using (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
);

create index beneficiaries_search_idx on public.beneficiaries (full_name, document_id, code);
create index deliveries_beneficiary_idx on public.deliveries (beneficiary_id, delivered_at desc);
create index inventory_low_stock_idx on public.inventory_items (stock, low_stock_threshold);
create index treasury_incomes_date_idx on public.treasury_incomes (income_at desc);
create index treasury_expenses_date_idx on public.treasury_expenses (expense_at desc);
create index treasury_loans_status_idx on public.treasury_loans (status, loan_at desc);
