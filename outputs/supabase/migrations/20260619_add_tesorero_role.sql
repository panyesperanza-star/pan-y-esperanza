alter table public.app_users
drop constraint if exists app_users_role_check;

alter table public.app_users
add constraint app_users_role_check
check (role in ('Superadministrador', 'Administrador', 'Tesorero', 'Coordinador', 'Voluntario', 'Consulta'));

insert into public.roles (id, name, modules)
values ('treasurer', 'Tesorero', '["donations", "reports", "receipts"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;
