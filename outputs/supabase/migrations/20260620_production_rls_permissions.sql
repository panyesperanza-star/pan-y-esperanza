create or replace function public.current_app_user()
returns public.app_users
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.app_users
  where is_active = true
    and (
      auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  limit 1;
$$;

create or replace function public.has_module_permission(module_id text, action_id text default 'view')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_profile public.app_users;
begin
  select * into current_profile from public.current_app_user();

  if current_profile.id is null then
    return false;
  end if;

  if current_profile.role = 'Superadministrador' or current_profile.permissions ? '*' then
    return true;
  end if;

  if current_profile.permission_matrix ? module_id then
    return coalesce((current_profile.permission_matrix -> module_id ->> action_id)::boolean, false);
  end if;

  return current_profile.permissions ? module_id and action_id = 'view';
end;
$$;

create or replace function public.can_write_treasury()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_module_permission('treasury', 'create')
    or public.has_module_permission('treasury', 'edit')
    or exists (
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

drop policy if exists "authenticated_write_beneficiaries" on public.beneficiaries;
drop policy if exists "authenticated_write_families" on public.families;
drop policy if exists "authenticated_write_deliveries" on public.deliveries;
drop policy if exists "authenticated_write_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_write_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_write_donors" on public.donors;
drop policy if exists "authenticated_write_donations" on public.donations;
drop policy if exists "authenticated_write_volunteers" on public.volunteers;
drop policy if exists "authenticated_write_roles" on public.roles;
drop policy if exists "authenticated_write_app_users" on public.app_users;
drop policy if exists "authenticated_write_organization_settings" on public.organization_settings;
drop policy if exists "authenticated_write_audit_logs" on public.audit_logs;

create policy "role_write_beneficiaries" on public.beneficiaries for all to authenticated using (public.has_module_permission('beneficiaries', 'edit') or public.has_module_permission('beneficiaries', 'delete')) with check (public.has_module_permission('beneficiaries', 'create') or public.has_module_permission('beneficiaries', 'edit'));
create policy "role_write_families" on public.families for all to authenticated using (public.has_module_permission('families', 'edit') or public.has_module_permission('families', 'delete')) with check (public.has_module_permission('families', 'create') or public.has_module_permission('families', 'edit'));
create policy "role_write_deliveries" on public.deliveries for all to authenticated using (public.has_module_permission('deliveries', 'edit') or public.has_module_permission('deliveries', 'delete')) with check (public.has_module_permission('deliveries', 'create') or public.has_module_permission('deliveries', 'edit'));
create policy "role_write_inventory_items" on public.inventory_items for all to authenticated using (public.has_module_permission('inventory', 'edit') or public.has_module_permission('inventory', 'delete')) with check (public.has_module_permission('inventory', 'create') or public.has_module_permission('inventory', 'edit'));
create policy "role_write_inventory_movements" on public.inventory_movements for all to authenticated using (public.has_module_permission('inventory', 'edit') or public.has_module_permission('inventory', 'delete')) with check (public.has_module_permission('inventory', 'create') or public.has_module_permission('inventory', 'edit'));
create policy "role_write_donors" on public.donors for all to authenticated using (public.has_module_permission('donations', 'edit') or public.has_module_permission('donations', 'delete')) with check (public.has_module_permission('donations', 'create') or public.has_module_permission('donations', 'edit'));
create policy "role_write_donations" on public.donations for all to authenticated using (public.has_module_permission('donations', 'edit') or public.has_module_permission('donations', 'delete')) with check (public.has_module_permission('donations', 'create') or public.has_module_permission('donations', 'edit'));
create policy "role_write_volunteers" on public.volunteers for all to authenticated using (public.has_module_permission('volunteers', 'edit') or public.has_module_permission('volunteers', 'delete')) with check (public.has_module_permission('volunteers', 'create') or public.has_module_permission('volunteers', 'edit'));
create policy "role_write_roles" on public.roles for all to authenticated using (public.has_module_permission('users', 'edit') or public.has_module_permission('users', 'delete')) with check (public.has_module_permission('users', 'create') or public.has_module_permission('users', 'edit'));
create policy "role_write_app_users" on public.app_users for all to authenticated using (public.has_module_permission('users', 'edit') or public.has_module_permission('users', 'delete')) with check (public.has_module_permission('users', 'create') or public.has_module_permission('users', 'edit'));
create policy "role_write_organization_settings" on public.organization_settings for all to authenticated using (public.has_module_permission('settings', 'edit')) with check (public.has_module_permission('settings', 'edit'));
create policy "role_write_audit_logs" on public.audit_logs for insert to authenticated with check (true);
