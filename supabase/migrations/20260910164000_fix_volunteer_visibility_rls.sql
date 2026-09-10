begin;

-- Voluntarios debe ser visible por permiso de modulo, no por condiciones
-- dependientes de cada fila. Se normalizan las policies de la tabla para
-- retirar cualquier policy previa que pueda dejar expedientes validos fuera.
alter table public.volunteers enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'volunteers'
  loop
    execute format('drop policy if exists %I on public.volunteers', policy_record.policyname);
  end loop;
end $$;

create policy "volunteers_select_by_permission"
on public.volunteers for select to authenticated
using (public.can_module_action('volunteers', 'view'));

create policy "volunteers_insert_by_permission"
on public.volunteers for insert to authenticated
with check (public.can_module_action('volunteers', 'create'));

create policy "volunteers_update_by_permission"
on public.volunteers for update to authenticated
using (public.can_module_action('volunteers', 'edit'))
with check (public.can_module_action('volunteers', 'edit'));

create policy "volunteers_delete_by_permission"
on public.volunteers for delete to authenticated
using (public.can_module_action('volunteers', 'delete'));

grant select, insert, update, delete on public.volunteers to authenticated;

create or replace function public.list_visible_volunteers()
returns setof public.volunteers
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_module_action('volunteers', 'view') then
    raise exception 'No tienes permiso para ver voluntarios.' using errcode = '42501';
  end if;

  return query
  select volunteers.*
  from public.volunteers as volunteers
  order by volunteers.created_at desc, volunteers.id desc;
end;
$$;

revoke all on function public.list_visible_volunteers() from public;
grant execute on function public.list_visible_volunteers() to authenticated;

notify pgrst, 'reload schema';

commit;
