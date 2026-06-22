alter table public.app_users
add column if not exists status text not null default 'Activo';

alter table public.app_users
drop constraint if exists app_users_status_check;

alter table public.app_users
add constraint app_users_status_check
check (status in ('Activo', 'Inactivo', 'Bloqueado'));

update public.app_users
set status = case when is_active then 'Activo' else 'Inactivo' end
where status is null or status = '';
