begin;

alter table public.deliveries
  add column if not exists status text not null default 'Activa',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.app_users(id) on delete set null,
  add column if not exists cancelled_by_name text,
  add column if not exists cancellation_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deliveries_status_check'
      and conrelid = 'public.deliveries'::regclass
  ) then
    alter table public.deliveries
      add constraint deliveries_status_check check (status in ('Activa', 'Anulada'));
  end if;
end
$$;

create or replace function public.is_app_superadmin()
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
      and u.role = 'Superadministrador'
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

create or replace function public.cancel_delivery(p_delivery_id uuid, p_reason text)
returns public.deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_delivery public.deliveries;
  v_user_name text;
begin
  select * into v_user
  from public.app_users u
  where (u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and u.is_active = true
    and coalesce(u.status, 'Activo') = 'Activo'
  limit 1;

  if v_user.id is null then
    raise exception 'Usuario no autorizado';
  end if;

  if not (
    public.can_app_permission('deliveries', 'edit')
    or public.can_app_permission('deliveries', 'create')
  ) then
    raise exception 'No tienes permiso para anular entregas';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'El motivo de anulacion debe tener al menos 5 caracteres';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'La entrega no existe';
  end if;

  if v_delivery.status = 'Anulada' then
    raise exception 'La entrega ya esta anulada';
  end if;

  v_user_name := trim(concat_ws(' ', v_user.first_name, v_user.last_name));
  if v_user_name = '' then v_user_name := v_user.email; end if;

  update public.deliveries
  set status = 'Anulada',
      cancelled_at = now(),
      cancelled_by = v_user.id,
      cancelled_by_name = v_user_name,
      cancellation_reason = trim(p_reason)
  where id = p_delivery_id;

  if v_delivery.inventory_item_id is not null then
    update public.inventory_items
    set stock = stock + v_delivery.quantity
    where id = v_delivery.inventory_item_id;

    insert into public.inventory_movements (
      item_id, item_name, movement_type, quantity, moved_at, responsible, notes
    ) values (
      v_delivery.inventory_item_id,
      v_delivery.inventory_item_name,
      'Entrada',
      v_delivery.quantity,
      current_date,
      v_user_name,
      'Reversion por anulacion de entrega: ' || trim(p_reason)
    );
  end if;

  update public.beneficiaries
  set last_help_at = (
    select max(d.delivered_at)
    from public.deliveries d
    where d.beneficiary_id = v_delivery.beneficiary_id
      and d.status = 'Activa'
  )
  where id = v_delivery.beneficiary_id;

  insert into public.audit_logs (user_name, user_email, action, happened_at)
  values (
    v_user_name,
    v_user.email,
    'Anulo entrega ' || coalesce(v_delivery.receipt_number, v_delivery.id::text) || '. Motivo: ' || trim(p_reason),
    now()
  );

  select * into v_delivery from public.deliveries where id = p_delivery_id;
  return v_delivery;
end
$$;

drop policy if exists "deliveries_update_by_permission" on public.deliveries;
create policy "deliveries_update_superadmin_only"
on public.deliveries for update to authenticated
using (public.is_app_superadmin())
with check (public.is_app_superadmin());

drop policy if exists "deliveries_delete_by_permission" on public.deliveries;
create policy "deliveries_delete_superadmin_only"
on public.deliveries for delete to authenticated
using (public.is_app_superadmin());

revoke all on function public.cancel_delivery(uuid, text) from public;
revoke all on function public.is_app_superadmin() from public;
grant execute on function public.cancel_delivery(uuid, text) to authenticated;
grant execute on function public.is_app_superadmin() to authenticated;

commit;
