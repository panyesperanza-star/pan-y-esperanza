begin;

-- Cierre de integracion: Contabilidad puede crear productos/lotes y entradas
-- de inventario desde el motor economico, pero no obtiene permisos generales
-- para salidas, edicion manual ni borrado de Inventario.
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
      and public.can_app_permission('inventory', action_id)
      and case
        when u.role = 'Superadministrador' then action_id in ('view', 'create', 'edit', 'delete')
        when action_id = 'delete' then false
        when u.role = 'Voluntario' then action_id = 'view'
        when u.role in ('Coordinadora', 'Coordinador') then action_id in ('view', 'create')
        else action_id in ('view', 'create', 'edit')
      end
  )
$$;

drop policy if exists "inventory_items_insert_by_accounting_operation" on public.inventory_items;
create policy "inventory_items_insert_by_accounting_operation"
on public.inventory_items for insert to authenticated
with check (public.can_app_permission('accounting', 'create') and stock = 0);

create or replace function public.register_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_moved_at date,
  p_responsible text,
  p_notes text
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_item public.inventory_items;
  v_movement public.inventory_movements;
  v_user_name text;
  v_can_inventory_create boolean;
  v_can_accounting_entry boolean;
begin
  select * into v_user
  from public.app_users u
  where (u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and u.is_active = true
    and coalesce(u.status, 'Activo') = 'Activo'
  limit 1;

  if v_user.id is null then
    raise exception 'No tienes permiso para registrar movimientos de inventario';
  end if;

  if p_movement_type is null or p_movement_type not in ('Entrada', 'Salida') then
    raise exception 'Tipo de movimiento no valido';
  end if;

  v_can_inventory_create := public.can_inventory_action('create');
  v_can_accounting_entry := p_movement_type = 'Entrada' and public.can_app_permission('accounting', 'create');

  if not (v_can_inventory_create or v_can_accounting_entry) then
    raise exception 'No tienes permiso para registrar movimientos de inventario';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'El producto no existe';
  end if;

  if p_movement_type = 'Salida' and v_item.stock < p_quantity then
    raise exception 'Stock insuficiente. Disponible: % %', v_item.stock, v_item.unit;
  end if;

  update public.inventory_items
  set stock = case
    when p_movement_type = 'Entrada' then stock + p_quantity
    else stock - p_quantity
  end
  where id = p_item_id;

  v_user_name := trim(concat_ws(' ', v_user.first_name, v_user.last_name));
  if v_user_name = '' then v_user_name := v_user.email; end if;

  insert into public.inventory_movements (
    item_id,
    item_name,
    movement_type,
    quantity,
    moved_at,
    responsible,
    notes
  ) values (
    v_item.id,
    v_item.name,
    p_movement_type,
    p_quantity,
    coalesce(p_moved_at, current_date),
    coalesce(nullif(trim(p_responsible), ''), v_user_name),
    nullif(trim(p_notes), '')
  )
  returning * into v_movement;

  insert into public.audit_logs (user_name, user_email, action, happened_at)
  values (
    v_user_name,
    v_user.email,
    'Registro ' || lower(p_movement_type) || ' de inventario: ' || v_item.name,
    now()
  );

  return v_movement;
end
$$;

grant execute on function public.can_inventory_action(text) to authenticated;
grant execute on function public.register_inventory_movement(uuid, text, numeric, date, text, text) to authenticated;

commit;
