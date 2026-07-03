begin;

-- El motor unico de operaciones economicas reutiliza Inventario para compras
-- y donaciones en especie. Permite crear entradas/lotes desde Contabilidad
-- sin conceder eliminacion ni abrir acciones de salida no autorizadas.
create or replace function public.can_inventory_action(action_id text)
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
        public.can_app_permission('inventory', action_id)
        or (
          action_id in ('create', 'edit')
          and public.can_app_permission('accounting', 'create')
        )
      )
      and case
        when u.role = 'Superadministrador' then action_id in ('view', 'create', 'edit', 'delete')
        when action_id = 'delete' then false
        when u.role = 'Voluntario' then action_id = 'view'
        when u.role in ('Coordinadora', 'Coordinador') then action_id in ('view', 'create')
        else action_id in ('view', 'create', 'edit')
      end
  )
$$;

grant execute on function public.can_inventory_action(text) to authenticated;

commit;
