begin;

alter table public.collaborators
  add column if not exists code text,
  add column if not exists tax_id text,
  add column if not exists access_email text,
  add column if not exists status text not null default 'Activo',
  add column if not exists portal_status text not null default 'Activo',
  add column if not exists last_otp_sent_at timestamptz,
  add column if not exists last_access_at timestamptz,
  add column if not exists portal_activated_at timestamptz,
  add column if not exists portal_deactivated_at timestamptz;

update public.collaborators
set
  access_email = coalesce(nullif(access_email, ''), email),
  status = coalesce(nullif(status, ''), 'Activo'),
  portal_status = case when is_active = false then 'Inactivo' else coalesce(nullif(portal_status, ''), 'Activo') end,
  updated_at = now()
where access_email is null
   or access_email = ''
   or status is null
   or status = ''
   or portal_status is null
   or portal_status = '';

alter table public.donors
  add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null;

update public.donors d
set collaborator_id = c.id,
    updated_at = now()
from public.collaborators c
where d.collaborator_id is null
  and lower(d.email) in (lower(c.email), lower(coalesce(c.access_email, c.email)));

update public.donations dn
set collaborator_id = c.id,
    updated_at = now()
from public.collaborators c
where dn.collaborator_id is null
  and lower(coalesce(dn.donor_email, '')) in (lower(c.email), lower(coalesce(c.access_email, c.email)));

create unique index if not exists idx_collaborators_code_unique on public.collaborators(code) where code is not null and code <> '';
create index if not exists idx_collaborators_access_email on public.collaborators(lower(access_email));
create index if not exists idx_collaborators_type_status on public.collaborators(type, status);
create index if not exists idx_donors_collaborator_id on public.donors(collaborator_id);

create or replace function public.can_collaborator_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('collaborators', action_id)
    or public.can_app_permission('donations', action_id)
    or public.can_app_permission('resources', action_id)
    or public.can_app_permission('settings', 'edit')
$$;

update public.app_users
set permissions = case
    when permissions ? '*' then permissions
    when permissions ? 'collaborators' then permissions
    else permissions || '["collaborators"]'::jsonb
  end,
  permission_matrix = jsonb_set(
    coalesce(permission_matrix, '{}'::jsonb),
    '{collaborators}',
    case
      when role = 'Superadministrador' then '{"view": true, "create": true, "edit": true, "delete": true}'::jsonb
      when role in ('Presidenta', 'Administrador', 'Coordinadora', 'Coordinador', 'Tesorera') then '{"view": true, "create": true, "edit": true, "delete": false}'::jsonb
      else '{"view": true, "create": false, "edit": false, "delete": false}'::jsonb
    end,
    true
  )
where role in ('Superadministrador', 'Presidenta', 'Administrador', 'Coordinadora', 'Coordinador', 'Tesorera')
  or permissions ? 'donations'
  or permissions ? 'settings';

commit;
