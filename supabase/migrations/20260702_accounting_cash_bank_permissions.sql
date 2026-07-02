begin;

update public.roles
set modules = case
  when modules ? '*' then modules
  when not (modules ? 'accounting') then modules || '["accounting"]'::jsonb
  else modules
end
where name in ('Voluntario', 'Coordinadora', 'Coordinador', 'Administrador', 'Presidenta', 'Tesorera', 'Tesorero', 'Superadministrador');

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
      when role = 'Voluntario' then jsonb_build_object('view', true, 'create', false, 'edit', false, 'delete', false)
      when role in ('Coordinadora', 'Coordinador') then jsonb_build_object('view', true, 'create', true, 'edit', false, 'delete', false)
      else jsonb_build_object('view', true, 'create', true, 'edit', true, 'delete', false)
    end,
    true
  )
where role in ('Superadministrador', 'Presidenta', 'Tesorera', 'Tesorero', 'Administrador', 'Coordinadora', 'Coordinador', 'Voluntario');

commit;
