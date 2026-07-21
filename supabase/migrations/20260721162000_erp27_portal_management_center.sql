begin;

alter table public.donors add column if not exists code text;
alter table public.donors add column if not exists access_email text;
alter table public.donors add column if not exists address text;
alter table public.donors add column if not exists type text;
alter table public.donors add column if not exists status text;
alter table public.donors add column if not exists portal_status text;
alter table public.donors add column if not exists last_otp_sent_at timestamptz;
alter table public.donors add column if not exists last_access_at timestamptz;
alter table public.donors add column if not exists portal_activated_at timestamptz;
alter table public.donors add column if not exists portal_deactivated_at timestamptz;
alter table public.donors add column if not exists notes text;

alter table public.donors alter column type set default 'Particular';
alter table public.donors alter column status set default 'Activo';
alter table public.donors alter column portal_status set default 'Activo';

update public.donors
set access_email = lower(coalesce(nullif(access_email, ''), email)),
    type = coalesce(nullif(type, ''), 'Particular'),
    status = coalesce(nullif(status, ''), case when is_active = false then 'Inactivo' else 'Activo' end),
    portal_status = coalesce(nullif(portal_status, ''), case when is_active = false then 'Inactivo' else 'Activo' end),
    portal_activated_at = case
      when is_active = true and portal_activated_at is null then coalesce(created_at, now())
      else portal_activated_at
    end,
    updated_at = now();

alter table public.donors alter column type set not null;
alter table public.donors alter column status set not null;
alter table public.donors alter column portal_status set not null;

update public.donors
set code = 'DON-' || lpad((substring(code from 'DON-(\d+)'))::integer::text, 6, '0'),
    updated_at = now()
where code ~* '^DON-\d{1,5}$';

with base as (
  select coalesce(max((substring(code from 'DON-(\d+)'))::integer), 0) as max_code
  from public.donors
  where code ~* '^DON-\d+$'
),
numbered as (
  select donors.id, base.max_code + row_number() over (order by donors.created_at, donors.id) as next_code
  from public.donors donors
  cross join base
  where coalesce(donors.code, '') = ''
)
update public.donors donors
set code = 'DON-' || lpad(numbered.next_code::text, 6, '0'),
    updated_at = now()
from numbered
where donors.id = numbered.id;

update public.collaborators
set code = 'COL-' || lpad((substring(code from 'COL-(\d+)'))::integer::text, 6, '0'),
    updated_at = now()
where code ~* '^COL-\d{1,5}$';

with base as (
  select coalesce(max((substring(code from 'COL-(\d+)'))::integer), 0) as max_code
  from public.collaborators
  where code ~* '^COL-\d+$'
),
numbered as (
  select collaborators.id, base.max_code + row_number() over (order by collaborators.created_at, collaborators.id) as next_code
  from public.collaborators collaborators
  cross join base
  where coalesce(collaborators.code, '') = ''
)
update public.collaborators collaborators
set code = 'COL-' || lpad(numbered.next_code::text, 6, '0'),
    updated_at = now()
from numbered
where collaborators.id = numbered.id;

create unique index if not exists idx_donors_code_unique on public.donors(code) where code is not null and code <> '';
create index if not exists idx_donors_access_email on public.donors(lower(access_email));
create index if not exists idx_donors_type_status on public.donors(type, status);
create unique index if not exists idx_collaborators_code_unique on public.collaborators(code) where code is not null and code <> '';
create index if not exists idx_collaborators_access_email on public.collaborators(lower(access_email));
create index if not exists idx_collaborators_type_status on public.collaborators(type, status);

drop trigger if exists donors_updated_at on public.donors;
create trigger donors_updated_at before update on public.donors for each row execute function public.set_updated_at();

alter table public.notificaciones drop constraint if exists notificaciones_modulo_check;
alter table public.notificaciones add constraint notificaciones_modulo_check
check (modulo in ('beneficiaries', 'inventory', 'deliveries', 'donations', 'donors', 'collaborators', 'volunteers', 'resources', 'settings', 'agenda', 'dashboard'));

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

create or replace function public.can_donor_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('donors', action_id)
    or public.can_app_permission('donations', action_id)
    or public.can_app_permission('settings', 'edit')
$$;

update public.roles
set modules = modules || '["donors"]'::jsonb
where name in ('Presidenta', 'Tesorera', 'Coordinadora', 'Administrador', 'Coordinador')
  and not (modules ? '*')
  and not (modules ? 'donors');

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["donors"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{donors}', '{"view":true,"create":true,"edit":true,"delete":true}'::jsonb, true)
      else permission_matrix
    end
where role in ('Presidenta', 'Tesorera', 'Administrador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'donors');

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["donors"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{donors}', '{"view":true,"create":true,"edit":true,"delete":false}'::jsonb, true)
      else permission_matrix
    end
where role in ('Coordinadora', 'Coordinador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'donors');

commit;
