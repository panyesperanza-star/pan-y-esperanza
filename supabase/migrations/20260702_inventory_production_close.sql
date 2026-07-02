begin;

-- Inventario reutiliza las acciones existentes:
-- view = consultar, create = registrar movimientos,
-- edit = crear/editar productos, delete = eliminar productos.
update public.app_users
set permission_matrix = jsonb_set(
      coalesce(permission_matrix, '{}'::jsonb),
      '{inventory}',
      coalesce(permission_matrix -> 'inventory', '{}'::jsonb)
        || jsonb_build_object('delete', false),
      true
    )
where role <> 'Superadministrador';

update public.app_users
set permission_matrix = jsonb_set(
      coalesce(permission_matrix, '{}'::jsonb),
      '{inventory}',
      coalesce(permission_matrix -> 'inventory', '{}'::jsonb)
        || jsonb_build_object('view', true, 'create', false, 'edit', false, 'delete', false),
      true
    )
where role = 'Voluntario';

update public.app_users
set permission_matrix = jsonb_set(
      coalesce(permission_matrix, '{}'::jsonb),
      '{inventory}',
      coalesce(permission_matrix -> 'inventory', '{}'::jsonb)
        || jsonb_build_object('view', true, 'create', true, 'edit', false, 'delete', false),
      true
    )
where role in ('Coordinadora', 'Coordinador');

update public.app_users
set permission_matrix = jsonb_set(
      coalesce(permission_matrix, '{}'::jsonb),
      '{inventory}',
      coalesce(permission_matrix -> 'inventory', '{}'::jsonb)
        || jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', false),
      true
    )
where role in ('Presidenta', 'Presidente', 'Administrador');

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
begin
  select * into v_user
  from public.app_users u
  where (u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and u.is_active = true
    and coalesce(u.status, 'Activo') = 'Activo'
  limit 1;

  if v_user.id is null or not public.can_inventory_action('create') then
    raise exception 'No tienes permiso para registrar movimientos de inventario';
  end if;

  if p_movement_type is null or p_movement_type not in ('Entrada', 'Salida') then
    raise exception 'Tipo de movimiento no valido';
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

create or replace function public.apply_delivery_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  update public.beneficiaries
  set last_help_at = new.delivered_at
  where id = new.beneficiary_id;

  if new.inventory_item_id is not null then
    select * into v_item
    from public.inventory_items
    where id = new.inventory_item_id
    for update;

    if v_item.id is null then
      raise exception 'El producto de inventario no existe';
    end if;

    if v_item.stock < new.quantity then
      raise exception 'Stock insuficiente. Disponible: % %', v_item.stock, v_item.unit;
    end if;

    update public.inventory_items
    set stock = stock - new.quantity
    where id = new.inventory_item_id;

    insert into public.inventory_movements (
      item_id, item_name, movement_type, quantity, moved_at, responsible, notes
    ) values (
      v_item.id, v_item.name, 'Salida', new.quantity, new.delivered_at, new.responsible,
      'Salida automatica por entrega'
    );
  end if;

  return new;
end
$$;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_item_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_item_id_fkey
  foreign key (item_id) references public.inventory_items(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_low_stock_threshold_check'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_low_stock_threshold_check check (low_stock_threshold >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_items_required_text_check'
      and conrelid = 'public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_required_text_check check (
        length(btrim(name)) > 0
        and length(btrim(category)) > 0
        and length(btrim(unit)) > 0
      );
  end if;
end
$$;

drop policy if exists "authenticated_read_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_write_inventory_items" on public.inventory_items;
drop policy if exists "inventory_items_select_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_insert_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_update_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_delete_by_permission" on public.inventory_items;
drop policy if exists "inventory_items_delete_superadmin_only" on public.inventory_items;

create policy "inventory_items_select_by_permission"
on public.inventory_items for select to authenticated
using (public.can_inventory_action('view'));

create policy "inventory_items_insert_by_permission"
on public.inventory_items for insert to authenticated
with check (public.can_inventory_action('edit') and stock = 0);

create policy "inventory_items_update_by_permission"
on public.inventory_items for update to authenticated
using (public.can_inventory_action('edit'))
with check (public.can_inventory_action('edit'));

create policy "inventory_items_delete_superadmin_only"
on public.inventory_items for delete to authenticated
using (public.can_inventory_action('delete'));

drop policy if exists "authenticated_read_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_write_inventory_movements" on public.inventory_movements;
drop policy if exists "inventory_movements_select_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_insert_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_update_by_permission" on public.inventory_movements;
drop policy if exists "inventory_movements_delete_by_permission" on public.inventory_movements;

create policy "inventory_movements_select_by_permission"
on public.inventory_movements for select to authenticated
using (public.can_inventory_action('view'));

revoke insert, update on public.inventory_items from authenticated;
grant insert (
  name, category, lot, expires_at, donor, location, unit, low_stock_threshold, notes
) on public.inventory_items to authenticated;
grant update (
  name, category, lot, expires_at, donor, location, unit, low_stock_threshold, notes
) on public.inventory_items to authenticated;
grant select, delete on public.inventory_items to authenticated;

revoke insert, update, delete on public.inventory_movements from authenticated;
grant select on public.inventory_movements to authenticated;

create index if not exists inventory_expiry_idx
  on public.inventory_items (expires_at)
  where expires_at is not null;

create index if not exists inventory_movements_item_date_idx
  on public.inventory_movements (item_id, moved_at desc, created_at desc);

revoke all on function public.can_inventory_action(text) from public;
revoke all on function public.register_inventory_movement(uuid, text, numeric, date, text, text) from public;
grant execute on function public.can_inventory_action(text) to authenticated;
grant execute on function public.register_inventory_movement(uuid, text, numeric, date, text, text) to authenticated;

commit;
