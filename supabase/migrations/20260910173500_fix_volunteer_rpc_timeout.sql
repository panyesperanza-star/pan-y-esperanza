begin;

-- La RPC anterior era SECURITY DEFINER y duplicaba la comprobacion de permisos
-- dentro de la funcion. El modulo ya tiene RLS por public.can_module_action(),
-- asi que la funcion debe ser una consulta invoker simple o no usarse.
create or replace function public.list_visible_volunteers()
returns setof public.volunteers
language sql
stable
security invoker
set search_path = public
as $$
  select volunteers.*
  from public.volunteers as volunteers
  order by volunteers.created_at desc, volunteers.id desc
$$;

grant execute on function public.list_visible_volunteers() to authenticated;

notify pgrst, 'reload schema';

commit;
