begin;

update public.app_users as app_user
set permission_matrix = (
  select jsonb_object_agg(
    module_id,
    coalesce(
      app_user.permission_matrix -> module_id,
      jsonb_build_object(
        'view', app_user.permissions ? module_id,
        'create', false,
        'edit', false,
        'delete', false
      )
    )
  )
  from unnest(array[
    'dashboard',
    'beneficiaries',
    'communications',
    'families',
    'deliveries',
    'receipts',
    'inventory',
    'donations',
    'treasury',
    'volunteers',
    'reports',
    'users',
    'settings',
    'backup'
  ]::text[]) as module_id
);

update public.app_users
set permissions = permissions - '*'
where role <> 'Superadministrador'
  and permissions ? '*';

-- El perfil Voluntario antiguo incluía Tesorería por defecto. Se revoca
-- durante la migracion; un administrador puede concederla despues de forma explicita.
update public.app_users
set permission_matrix = jsonb_set(
      permission_matrix,
      '{treasury,view}',
      'false'::jsonb,
      true
    ),
    permissions = permissions - 'treasury'
where role = 'Voluntario';

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
  )
$$;

grant execute on function public.can_app_permission(text, text) to authenticated;

commit;
