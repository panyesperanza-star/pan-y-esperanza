alter table public.app_users
drop constraint if exists app_users_role_check;

alter table public.app_users
add constraint app_users_role_check
check (role in (
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

alter table public.app_users
add column if not exists status text not null default 'Activo';

alter table public.app_users
drop constraint if exists app_users_status_check;

alter table public.app_users
add constraint app_users_status_check
check (status in ('Activo', 'Inactivo', 'Bloqueado'));

update public.app_users
set status = case when is_active then 'Activo' else 'Inactivo' end
where status is null;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists password_reset_tokens_email_idx on public.password_reset_tokens (lower(email));
create index if not exists password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

alter table public.app_users enable row level security;
alter table public.password_reset_tokens enable row level security;

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

drop policy if exists "authenticated_read_app_users" on public.app_users;
drop policy if exists "authenticated_write_app_users" on public.app_users;
drop policy if exists "app_users_select_self_or_admin" on public.app_users;
drop policy if exists "app_users_insert_admin" on public.app_users;
drop policy if exists "app_users_update_self_or_admin" on public.app_users;
drop policy if exists "app_users_delete_admin" on public.app_users;

create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "app_users_insert_admin"
on public.app_users
for insert
to authenticated
with check (public.is_app_admin());

create policy "app_users_update_self_or_admin"
on public.app_users
for update
to authenticated
using (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  public.is_app_admin()
  or auth_user_id = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy "app_users_delete_admin"
on public.app_users
for delete
to authenticated
using (public.is_app_admin());

drop policy if exists "password_reset_tokens_no_client_access" on public.password_reset_tokens;
create policy "password_reset_tokens_no_client_access"
on public.password_reset_tokens
for all
to authenticated
using (false)
with check (false);

grant execute on function public.current_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
