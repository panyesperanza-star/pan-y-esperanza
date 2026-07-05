begin;

alter table public.app_users
drop constraint if exists app_users_role_check;

alter table public.app_users
add constraint app_users_role_check
check (role in (
  'Superadministrador',
  'Superadministrador del sistema',
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

create or replace function public.is_system_superadmin_role(role_name text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(role_name, ''))) in (
    'superadministrador del sistema',
    'superadministrador sistema',
    'system superadmin'
  )
$$;

create or replace function public.is_system_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (
        u.auth_user_id = auth.uid()
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and public.is_system_superadmin_role(u.role)
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  association_id text not null,
  association_name text not null,
  module text not null,
  record_type text not null,
  record_id text not null,
  record_label text,
  requester_id uuid references public.app_users(id) on delete set null,
  requester_name text,
  requester_email text,
  requested_at timestamptz not null default now(),
  reason text not null,
  notes text,
  status text not null default 'Pendiente',
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(id) on delete set null,
  resolved_by_name text,
  resolved_by_email text,
  resolution_reason text,
  relations_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deletion_requests_status_check check (status in ('Pendiente', 'Aprobada', 'Rechazada')),
  constraint deletion_requests_reason_check check (char_length(trim(reason)) >= 5)
);

create index if not exists deletion_requests_status_requested_idx
on public.deletion_requests (status, requested_at desc);

create index if not exists deletion_requests_record_idx
on public.deletion_requests (module, record_type, record_id);

drop trigger if exists deletion_requests_updated_at on public.deletion_requests;
create trigger deletion_requests_updated_at
before update on public.deletion_requests
for each row execute function public.set_updated_at();

alter table public.deletion_requests enable row level security;

drop policy if exists "deletion_requests_select_scoped" on public.deletion_requests;
drop policy if exists "deletion_requests_insert_requester" on public.deletion_requests;
drop policy if exists "deletion_requests_update_system_superadmin" on public.deletion_requests;
drop policy if exists "deletion_requests_no_delete" on public.deletion_requests;

create policy "deletion_requests_select_scoped"
on public.deletion_requests for select to authenticated
using (
  public.is_system_superadmin()
  or requester_id = (public.current_app_user()).id
  or public.can_app_permission('settings', 'view')
  or public.can_app_permission('users', 'view')
);

create policy "deletion_requests_insert_requester"
on public.deletion_requests for insert to authenticated
with check (
  not public.is_system_superadmin()
  and status = 'Pendiente'
  and requester_id = (public.current_app_user()).id
);

create policy "deletion_requests_update_system_superadmin"
on public.deletion_requests for update to authenticated
using (public.is_system_superadmin())
with check (public.is_system_superadmin());

create policy "deletion_requests_no_delete"
on public.deletion_requests for delete to authenticated
using (false);

grant select, insert, update on public.deletion_requests to authenticated;
revoke delete on public.deletion_requests from authenticated;

drop policy if exists "app_users_select_self_or_admin" on public.app_users;
create policy "app_users_select_self_or_admin"
on public.app_users for select to authenticated
using (
  public.is_system_superadmin()
  or (
    not public.is_system_superadmin_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

drop policy if exists "app_users_insert_admin" on public.app_users;
create policy "app_users_insert_admin"
on public.app_users for insert to authenticated
with check (
  public.is_system_superadmin()
  or (public.is_app_admin() and not public.is_system_superadmin_role(role))
);

drop policy if exists "app_users_update_self_or_admin" on public.app_users;
create policy "app_users_update_self_or_admin"
on public.app_users for update to authenticated
using (
  public.is_system_superadmin()
  or (
    not public.is_system_superadmin_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
)
with check (
  public.is_system_superadmin()
  or (
    not public.is_system_superadmin_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

drop policy if exists "app_users_delete_admin" on public.app_users;
create policy "app_users_delete_admin"
on public.app_users for delete to authenticated
using (
  public.is_system_superadmin()
  or (public.is_app_admin() and not public.is_system_superadmin_role(role))
);

drop policy if exists "deliveries_delete_superadmin_only" on public.deliveries;
create policy "deliveries_delete_superadmin_only"
on public.deliveries for delete to authenticated
using (public.is_app_superadmin() or public.is_system_superadmin());

drop policy if exists "inventory_items_delete_superadmin_only" on public.inventory_items;
create policy "inventory_items_delete_superadmin_only"
on public.inventory_items for delete to authenticated
using (public.can_inventory_action('delete') or public.is_system_superadmin());

drop policy if exists "financial_accounts_delete_superadmin_only" on public.financial_accounts;
create policy "financial_accounts_delete_superadmin_only"
on public.financial_accounts for delete to authenticated
using (public.is_accounting_superadmin() or public.is_system_superadmin());

drop policy if exists "treasury_write_treasury_incomes" on public.treasury_incomes;
create policy "treasury_write_treasury_incomes"
on public.treasury_incomes for all to authenticated
using (public.can_write_treasury() or public.is_system_superadmin())
with check (public.can_write_treasury() or public.is_system_superadmin());

drop policy if exists "treasury_write_treasury_expenses" on public.treasury_expenses;
create policy "treasury_write_treasury_expenses"
on public.treasury_expenses for all to authenticated
using (public.can_write_treasury() or public.is_system_superadmin())
with check (public.can_write_treasury() or public.is_system_superadmin());

drop policy if exists "treasury_write_treasury_loans" on public.treasury_loans;
create policy "treasury_write_treasury_loans"
on public.treasury_loans for all to authenticated
using (public.can_write_treasury() or public.is_system_superadmin())
with check (public.can_write_treasury() or public.is_system_superadmin());

drop policy if exists "treasury_write_treasury_accounts" on public.treasury_accounts;
create policy "treasury_write_treasury_accounts"
on public.treasury_accounts for all to authenticated
using (public.can_write_treasury() or public.is_system_superadmin())
with check (public.can_write_treasury() or public.is_system_superadmin());

grant execute on function public.is_system_superadmin_role(text) to authenticated;
grant execute on function public.is_system_superadmin() to authenticated;

notify pgrst, 'reload schema';

commit;
