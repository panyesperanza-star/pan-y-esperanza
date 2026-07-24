-- Platform Owner: infraestructura interna de ALTHEMON para herramientas criticas.
-- No implementa ni ejecuta ninguna logica de limpieza.

alter table public.app_users
  add column if not exists organization_scope text not null default 'organization',
  add column if not exists platform_owner_provider text;

alter table public.app_users
drop constraint if exists app_users_organization_scope_check;

alter table public.app_users
add constraint app_users_organization_scope_check
check (organization_scope in ('organization', 'platform'));

alter table public.app_users
drop constraint if exists app_users_role_check;

alter table public.app_users
add constraint app_users_role_check
check (role in (
  'Superadministrador',
  'Superadministrador del sistema',
  'Platform Owner',
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

update public.app_users
set organization_scope = 'platform',
    platform_owner_provider = 'ALTHEMON',
    permissions = '["platform-tools"]'::jsonb,
    permission_matrix = '{"platform-tools":{"view":true,"create":false,"edit":false,"delete":false}}'::jsonb
where lower(trim(role)) = 'platform owner';

alter table public.app_users
drop constraint if exists app_users_platform_owner_scope_check;

alter table public.app_users
add constraint app_users_platform_owner_scope_check
check (
  role <> 'Platform Owner'
  or (organization_scope = 'platform' and platform_owner_provider = 'ALTHEMON')
);

insert into public.roles (id, name, modules)
values ('platform-owner', 'Platform Owner', '["platform-tools"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;

create table if not exists public.platform_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  operation_label text not null,
  operation_scope text not null,
  risk_level text not null check (risk_level in ('alto', 'critico')),
  status text not null check (status in ('prepared', 'password_failed', 'cancelled', 'executed', 'failed')),
  reason text not null,
  result text not null default '',
  provider text not null default 'ALTHEMON',
  requested_by uuid references public.app_users(id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  user_role text not null default '',
  user_agent text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_maintenance_logs_created_idx
on public.platform_maintenance_logs (created_at desc);

create index if not exists platform_maintenance_logs_operation_idx
on public.platform_maintenance_logs (operation_id, created_at desc);

alter table public.platform_maintenance_logs enable row level security;

create or replace function public.is_platform_owner_role(role_name text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(role_name, ''))) = 'platform owner'
$$;

create or replace function public.is_platform_owner()
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
      and public.is_platform_owner_role(u.role)
      and u.organization_scope = 'platform'
      and u.platform_owner_provider = 'ALTHEMON'
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

drop policy if exists "app_users_select_self_or_admin" on public.app_users;
drop policy if exists "app_users_insert_admin" on public.app_users;
drop policy if exists "app_users_update_self_or_admin" on public.app_users;
drop policy if exists "app_users_delete_admin" on public.app_users;

create policy "app_users_select_self_or_admin"
on public.app_users for select to authenticated
using (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

create policy "app_users_insert_admin"
on public.app_users for insert to authenticated
with check (
  public.is_system_superadmin()
  or (
    public.is_app_admin()
    and not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
  )
);

create policy "app_users_update_self_or_admin"
on public.app_users for update to authenticated
using (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
)
with check (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

create policy "app_users_delete_admin"
on public.app_users for delete to authenticated
using (
  public.is_system_superadmin()
  or (
    public.is_app_admin()
    and not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
  )
);

drop policy if exists "platform_maintenance_logs_select_owner" on public.platform_maintenance_logs;
drop policy if exists "platform_maintenance_logs_insert_owner" on public.platform_maintenance_logs;
drop policy if exists "platform_maintenance_logs_no_update" on public.platform_maintenance_logs;
drop policy if exists "platform_maintenance_logs_no_delete" on public.platform_maintenance_logs;

create policy "platform_maintenance_logs_select_owner"
on public.platform_maintenance_logs for select to authenticated
using (public.is_platform_owner());

create policy "platform_maintenance_logs_insert_owner"
on public.platform_maintenance_logs for insert to authenticated
with check (public.is_platform_owner());

create policy "platform_maintenance_logs_no_update"
on public.platform_maintenance_logs for update to authenticated
using (false)
with check (false);

create policy "platform_maintenance_logs_no_delete"
on public.platform_maintenance_logs for delete to authenticated
using (false);

grant execute on function public.is_platform_owner_role(text) to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant select, insert on public.platform_maintenance_logs to authenticated;
revoke update, delete on public.platform_maintenance_logs from authenticated;
