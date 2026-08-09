alter table public.donations add column if not exists accounting_event_id uuid;
alter table public.donations add column if not exists accounting_contact_id uuid;
alter table public.donations add column if not exists inventory_item_id uuid;
alter table public.donations add column if not exists inventory_movement_id uuid;
alter table public.donations add column if not exists reference text;
alter table public.donations add column if not exists unit_value numeric(14,4);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_donor_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_donor_id_fkey
      foreign key (donor_id) references public.donors(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'donations_accounting_event_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_accounting_event_id_fkey
      foreign key (accounting_event_id) references public.accounting_events(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'donations_accounting_contact_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_accounting_contact_id_fkey
      foreign key (accounting_contact_id) references public.accounting_contacts(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'donations_inventory_item_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'donations_inventory_movement_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_inventory_movement_id_fkey
      foreign key (inventory_movement_id) references public.inventory_movements(id) on delete set null;
  end if;
end $$;

create table if not exists public.donation_products (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete set null,
  accounting_event_id uuid references public.accounting_events(id) on delete set null,
  accounting_contact_id uuid references public.accounting_contacts(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  inventory_movement_id uuid references public.inventory_movements(id) on delete set null,
  social_value_event_id uuid references public.social_value_events(id) on delete set null,
  product_name text not null,
  category text,
  lot text,
  unit text,
  quantity_received numeric(14,2) not null default 0 check (quantity_received >= 0),
  estimated_unit_value numeric(14,4) default 0 check (estimated_unit_value >= 0),
  estimated_total_value numeric(14,2) default 0 check (estimated_total_value >= 0),
  expires_at date,
  received_at date not null default current_date,
  status text not null default 'received',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_movements add column if not exists donation_id uuid;
alter table public.inventory_movements add column if not exists donation_product_id uuid;
alter table public.inventory_movements add column if not exists delivery_id uuid;
alter table public.inventory_movements add column if not exists source_module text;
alter table public.inventory_movements add column if not exists source_record_id uuid;

alter table public.deliveries add column if not exists donation_id uuid;
alter table public.deliveries add column if not exists donation_product_id uuid;
alter table public.deliveries add column if not exists inventory_lot text;

alter table public.social_value_events add column if not exists donation_id uuid;
alter table public.social_value_events add column if not exists donation_product_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_donation_id_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_donation_id_fkey
      foreign key (donation_id) references public.donations(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_donation_product_id_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_donation_product_id_fkey
      foreign key (donation_product_id) references public.donation_products(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_delivery_id_fkey'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_delivery_id_fkey
      foreign key (delivery_id) references public.deliveries(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_donation_id_fkey'
  ) then
    alter table public.deliveries
      add constraint deliveries_donation_id_fkey
      foreign key (donation_id) references public.donations(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_donation_product_id_fkey'
  ) then
    alter table public.deliveries
      add constraint deliveries_donation_product_id_fkey
      foreign key (donation_product_id) references public.donation_products(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'social_value_events_donation_id_fkey'
  ) then
    alter table public.social_value_events
      add constraint social_value_events_donation_id_fkey
      foreign key (donation_id) references public.donations(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'social_value_events_donation_product_id_fkey'
  ) then
    alter table public.social_value_events
      add constraint social_value_events_donation_product_id_fkey
      foreign key (donation_product_id) references public.donation_products(id) on delete set null;
  end if;
end $$;

create index if not exists idx_donation_products_donation_id on public.donation_products(donation_id);
create index if not exists idx_donation_products_donor_id on public.donation_products(donor_id);
create index if not exists idx_donation_products_inventory_item_id on public.donation_products(inventory_item_id);
create index if not exists idx_donation_products_received_at on public.donation_products(received_at desc);
create index if not exists idx_inventory_movements_donation_product_id on public.inventory_movements(donation_product_id);
create index if not exists idx_inventory_movements_delivery_id on public.inventory_movements(delivery_id);
create index if not exists idx_deliveries_donation_product_id on public.deliveries(donation_product_id);
create index if not exists idx_social_value_events_donation_product_id on public.social_value_events(donation_product_id);

drop trigger if exists donation_products_updated_at on public.donation_products;
create trigger donation_products_updated_at
before update on public.donation_products
for each row execute function public.set_updated_at();

alter table public.donation_products enable row level security;

drop policy if exists "donation_products_select_by_permission" on public.donation_products;
drop policy if exists "donation_products_insert_by_permission" on public.donation_products;
drop policy if exists "donation_products_update_by_permission" on public.donation_products;
drop policy if exists "donation_products_delete_superadmin_only" on public.donation_products;

create policy "donation_products_select_by_permission"
on public.donation_products for select to authenticated
using (
  public.can_app_permission('donations', 'view')
  or public.can_app_permission('donors', 'view')
  or public.can_app_permission('inventory', 'view')
  or public.can_app_permission('accounting', 'view')
);

create policy "donation_products_insert_by_permission"
on public.donation_products for insert to authenticated
with check (
  public.can_app_permission('donations', 'create')
  or public.can_app_permission('accounting', 'create')
);

create policy "donation_products_update_by_permission"
on public.donation_products for update to authenticated
using (
  public.can_app_permission('donations', 'edit')
  or public.can_app_permission('accounting', 'edit')
)
with check (
  public.can_app_permission('donations', 'edit')
  or public.can_app_permission('accounting', 'edit')
);

create policy "donation_products_delete_superadmin_only"
on public.donation_products for delete to authenticated
using (public.is_app_superadmin() or public.is_system_superadmin());

drop function if exists public.resolve_donation_product_for_inventory(uuid, numeric);

create function public.resolve_donation_product_for_inventory(
  p_item_id uuid,
  p_quantity numeric default 0
)
returns public.donation_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.donation_products;
begin
  select dp.* into v_product
  from public.donation_products dp
  where dp.inventory_item_id = p_item_id
    and coalesce(dp.status, 'received') not in ('voided', 'cancelled', 'anulada', 'anulado')
    and (
      dp.quantity_received - coalesce((
        select sum(im.quantity)
        from public.inventory_movements im
        where im.donation_product_id = dp.id
          and im.movement_type = 'Salida'
      ), 0)
    ) > 0
  order by dp.received_at asc, dp.created_at asc
  limit 1;

  return v_product;
end
$$;

drop function if exists public.register_inventory_movement(uuid, date, text, text, numeric, text);
drop function if exists public.register_inventory_movement(uuid, text, numeric, date, text, text);

create function public.register_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_moved_at date,
  p_responsible text,
  p_notes text,
  p_donation_id uuid default null,
  p_donation_product_id uuid default null,
  p_delivery_id uuid default null,
  p_source_module text default null,
  p_source_record_id uuid default null
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
  v_donation_product public.donation_products;
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

  if p_donation_product_id is not null then
    select * into v_donation_product
    from public.donation_products
    where id = p_donation_product_id;
  elsif p_movement_type = 'Salida' then
    v_donation_product := public.resolve_donation_product_for_inventory(p_item_id, p_quantity);
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
    notes,
    donation_id,
    donation_product_id,
    delivery_id,
    source_module,
    source_record_id
  ) values (
    v_item.id,
    v_item.name,
    p_movement_type,
    p_quantity,
    coalesce(p_moved_at, current_date),
    coalesce(nullif(trim(p_responsible), ''), v_user_name),
    nullif(trim(p_notes), ''),
    coalesce(p_donation_id, v_donation_product.donation_id),
    v_donation_product.id,
    p_delivery_id,
    nullif(trim(p_source_module), ''),
    p_source_record_id
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

revoke all on function public.register_inventory_movement(uuid, text, numeric, date, text, text, uuid, uuid, uuid, text, uuid) from public;
grant execute on function public.register_inventory_movement(uuid, text, numeric, date, text, text, uuid, uuid, uuid, text, uuid) to authenticated;

create or replace function public.apply_delivery_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_donation_product public.donation_products;
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

    v_donation_product := public.resolve_donation_product_for_inventory(new.inventory_item_id, new.quantity);

    update public.inventory_items
    set stock = stock - new.quantity
    where id = new.inventory_item_id;

    insert into public.inventory_movements (
      item_id,
      item_name,
      movement_type,
      quantity,
      moved_at,
      responsible,
      notes,
      donation_id,
      donation_product_id,
      delivery_id,
      source_module,
      source_record_id
    ) values (
      v_item.id,
      v_item.name,
      'Salida',
      new.quantity,
      new.delivered_at,
      new.responsible,
      'Salida automatica por entrega',
      v_donation_product.donation_id,
      v_donation_product.id,
      new.id,
      'deliveries',
      new.id
    );

    if v_donation_product.id is not null then
      update public.deliveries
      set donation_id = v_donation_product.donation_id,
          donation_product_id = v_donation_product.id,
          inventory_lot = v_item.lot
      where id = new.id;
    end if;
  end if;

  return new;
end
$$;

notify pgrst, 'reload schema';
