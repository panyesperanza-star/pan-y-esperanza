begin;

update public.app_users
set permissions = case
    when permissions ? '*' then permissions
    when not (permissions ? 'accounting') then permissions || '["accounting"]'::jsonb
    else permissions
  end,
  permission_matrix = jsonb_set(
    coalesce(permission_matrix, '{}'::jsonb),
    '{accounting}',
    case
      when role = 'Superadministrador' then jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', true)
      when role in ('Voluntario', 'Coordinadora', 'Coordinador') then jsonb_build_object('view', true, 'create', false, 'edit', false, 'delete', false)
      else jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', false)
    end,
    true
  )
where role in ('Superadministrador', 'Presidenta', 'Tesorera', 'Tesorero', 'Administrador', 'Coordinadora', 'Coordinador', 'Voluntario');

create or replace function public.can_app_permission(module_id text, action_id text default 'view')
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
        u.role = 'Superadministrador'
        or case
          when coalesce(u.permission_matrix, '{}'::jsonb) <> '{}'::jsonb
            then coalesce((u.permission_matrix -> module_id ->> action_id)::boolean, false)
          else action_id = 'view' and u.permissions ? module_id
        end
      )
      and case
        when module_id = 'accounting' and action_id = 'delete' then u.role = 'Superadministrador'
        when module_id = 'accounting' and u.role in ('Voluntario', 'Coordinadora', 'Coordinador') then action_id = 'view'
        else true
      end
  )
$$;

grant execute on function public.can_app_permission(text, text) to authenticated;

commit;
