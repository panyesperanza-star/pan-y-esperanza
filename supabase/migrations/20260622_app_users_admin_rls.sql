alter table public.app_users enable row level security;

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

grant execute on function public.current_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
