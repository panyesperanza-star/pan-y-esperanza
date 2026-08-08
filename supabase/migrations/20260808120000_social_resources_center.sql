begin;

create table if not exists public.social_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_name text not null default '',
  category text not null default 'Otros',
  description text not null default '',
  requirements text not null default '',
  target_audience text not null default '',
  required_documents text not null default '',
  benefit text not null default '',
  opens_at date,
  deadline_at date,
  address text not null default '',
  municipality text not null default '',
  phone text not null default '',
  email text not null default '',
  web_url text not null default '',
  application_method text not null default '',
  status text not null default 'Activo',
  scope text not null default 'municipal',
  last_verified_at date,
  age_min integer,
  age_max integer,
  family_situation text not null default '',
  employment_situation text not null default '',
  housing_situation text not null default '',
  notes text not null default '',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_resources_status_check check (status in ('Activo', 'Proximamente', 'Cerrado')),
  constraint social_resources_scope_check check (scope in ('municipal', 'autonomico', 'estatal', 'privado')),
  constraint social_resources_age_check check (
    (age_min is null or age_min >= 0)
    and (age_max is null or age_max >= 0)
    and (age_min is null or age_max is null or age_min <= age_max)
  )
);

create table if not exists public.beneficiary_social_resources (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  resource_id uuid not null references public.social_resources(id) on delete cascade,
  status text not null default 'saved',
  observations text not null default '',
  linked_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beneficiary_social_resources_status_check check (status in (
    'saved',
    'interested',
    'started',
    'documents_pending',
    'submitted',
    'granted',
    'denied',
    'not_applicable'
  )),
  constraint beneficiary_social_resources_unique unique (beneficiary_id, resource_id)
);

create table if not exists public.social_resource_followups (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  resource_id uuid not null references public.social_resources(id) on delete cascade,
  beneficiary_resource_id uuid references public.beneficiary_social_resources(id) on delete cascade,
  status text not null,
  observations text not null default '',
  user_id uuid references public.app_users(id) on delete set null,
  user_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists social_resources_category_idx on public.social_resources (category);
create index if not exists social_resources_status_idx on public.social_resources (status);
create index if not exists social_resources_deadline_idx on public.social_resources (deadline_at);
create index if not exists social_resources_municipality_idx on public.social_resources (municipality);
create index if not exists beneficiary_social_resources_beneficiary_idx on public.beneficiary_social_resources (beneficiary_id);
create index if not exists beneficiary_social_resources_resource_idx on public.beneficiary_social_resources (resource_id);
create index if not exists social_resource_followups_link_idx on public.social_resource_followups (beneficiary_resource_id);
create index if not exists social_resource_followups_beneficiary_idx on public.social_resource_followups (beneficiary_id);

drop trigger if exists social_resources_updated_at on public.social_resources;
create trigger social_resources_updated_at
before update on public.social_resources
for each row execute function public.set_updated_at();

drop trigger if exists beneficiary_social_resources_updated_at on public.beneficiary_social_resources;
create trigger beneficiary_social_resources_updated_at
before update on public.beneficiary_social_resources
for each row execute function public.set_updated_at();

alter table public.social_resources enable row level security;
alter table public.beneficiary_social_resources enable row level security;
alter table public.social_resource_followups enable row level security;

drop policy if exists "social_resources_select_by_permission" on public.social_resources;
drop policy if exists "social_resources_insert_by_permission" on public.social_resources;
drop policy if exists "social_resources_update_by_permission" on public.social_resources;
drop policy if exists "social_resources_delete_by_permission" on public.social_resources;

create policy "social_resources_select_by_permission" on public.social_resources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resources_insert_by_permission" on public.social_resources
for insert to authenticated with check (public.can_module_action('social-resources', 'create'));
create policy "social_resources_update_by_permission" on public.social_resources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resources_delete_by_permission" on public.social_resources
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

drop policy if exists "beneficiary_social_resources_select_by_permission" on public.beneficiary_social_resources;
drop policy if exists "beneficiary_social_resources_insert_by_permission" on public.beneficiary_social_resources;
drop policy if exists "beneficiary_social_resources_update_by_permission" on public.beneficiary_social_resources;
drop policy if exists "beneficiary_social_resources_delete_by_permission" on public.beneficiary_social_resources;

create policy "beneficiary_social_resources_select_by_permission" on public.beneficiary_social_resources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "beneficiary_social_resources_insert_by_permission" on public.beneficiary_social_resources
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "beneficiary_social_resources_update_by_permission" on public.beneficiary_social_resources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "beneficiary_social_resources_delete_by_permission" on public.beneficiary_social_resources
for delete to authenticated using (public.can_module_action('social-resources', 'edit'));

drop policy if exists "social_resource_followups_select_by_permission" on public.social_resource_followups;
drop policy if exists "social_resource_followups_insert_by_permission" on public.social_resource_followups;
drop policy if exists "social_resource_followups_update_by_permission" on public.social_resource_followups;
drop policy if exists "social_resource_followups_delete_by_permission" on public.social_resource_followups;

create policy "social_resource_followups_select_by_permission" on public.social_resource_followups
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_followups_insert_by_permission" on public.social_resource_followups
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_followups_update_by_permission" on public.social_resource_followups
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_followups_delete_by_permission" on public.social_resource_followups
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

grant select, insert, update, delete on public.social_resources to authenticated;
grant select, insert, update, delete on public.beneficiary_social_resources to authenticated;
grant select, insert, update, delete on public.social_resource_followups to authenticated;

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["social-resources"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{social-resources}', '{"view":true,"create":true,"edit":true,"delete":true}'::jsonb, true)
      else permission_matrix
    end
where role in ('Presidenta', 'Administrador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'social-resources');

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["social-resources"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{social-resources}', '{"view":true,"create":true,"edit":true,"delete":false}'::jsonb, true)
      else permission_matrix
    end
where role in ('Secretaria', 'Coordinadora', 'Coordinador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'social-resources');

notify pgrst, 'reload schema';

commit;
