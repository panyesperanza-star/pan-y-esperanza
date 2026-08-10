begin;

-- QA-044: Identidad unica Voluntario <-> Usuario ERP.
-- No fusiona tablas ni vincula automaticamente registros existentes.

create table if not exists public.person_identities (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  document_id text,
  email text,
  phone text,
  photo_data_url text,
  source_type text not null default 'manual' check (source_type in ('manual', 'volunteer', 'user')),
  source_id uuid,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volunteers
  add column if not exists person_identity_id uuid references public.person_identities(id) on delete set null;

alter table public.app_users
  add column if not exists document_id text,
  add column if not exists person_identity_id uuid references public.person_identities(id) on delete set null;

alter table public.official_credential_registry
  add column if not exists person_identity_id uuid references public.person_identities(id) on delete set null;

create index if not exists person_identities_document_idx
  on public.person_identities (upper(regexp_replace(coalesce(document_id, ''), '[^A-Za-z0-9]', '', 'g')));
create index if not exists person_identities_email_idx
  on public.person_identities (lower(coalesce(email, '')));
create index if not exists person_identities_phone_idx
  on public.person_identities (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'));
create index if not exists volunteers_person_identity_idx on public.volunteers(person_identity_id);
create index if not exists app_users_person_identity_idx on public.app_users(person_identity_id);
create index if not exists official_credential_registry_person_identity_idx on public.official_credential_registry(person_identity_id);

create unique index if not exists volunteers_person_identity_unique_idx
  on public.volunteers(person_identity_id)
  where person_identity_id is not null;

create unique index if not exists app_users_person_identity_unique_idx
  on public.app_users(person_identity_id)
  where person_identity_id is not null;

create table if not exists public.person_identity_link_audit (
  id uuid primary key default gen_random_uuid(),
  person_identity_id uuid references public.person_identities(id) on delete set null,
  volunteer_id uuid references public.volunteers(id) on delete set null,
  app_user_id uuid references public.app_users(id) on delete set null,
  action text not null check (action in ('created', 'linked', 'unlinked', 'updated')),
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  reason text,
  previous_values jsonb not null default '{}'::jsonb,
  next_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists person_identity_link_audit_identity_idx on public.person_identity_link_audit(person_identity_id);
create index if not exists person_identity_link_audit_volunteer_idx on public.person_identity_link_audit(volunteer_id);
create index if not exists person_identity_link_audit_user_idx on public.person_identity_link_audit(app_user_id);

create or replace function public.set_person_identity_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists person_identities_updated_at on public.person_identities;
create trigger person_identities_updated_at
before update on public.person_identities
for each row execute function public.set_person_identity_updated_at();

create or replace function public.resolve_subject_person_identity(p_subject_type text, p_subject_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved uuid;
begin
  if p_subject_type = 'volunteer' then
    select person_identity_id into resolved from public.volunteers where id = p_subject_id;
  elsif p_subject_type = 'user' then
    select person_identity_id into resolved from public.app_users where id = p_subject_id;
  else
    resolved := null;
  end if;
  return resolved;
end;
$$;

create or replace function public.set_official_credential_person_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_identity_id is null then
    new.person_identity_id := public.resolve_subject_person_identity(new.subject_type, new.subject_id);
  end if;
  return new;
end;
$$;

drop trigger if exists official_credential_registry_person_identity on public.official_credential_registry;
create trigger official_credential_registry_person_identity
before insert or update of subject_type, subject_id, person_identity_id
on public.official_credential_registry
for each row execute function public.set_official_credential_person_identity();

update public.official_credential_registry registry
set person_identity_id = public.resolve_subject_person_identity(registry.subject_type, registry.subject_id)
where registry.person_identity_id is null
  and registry.subject_type in ('volunteer', 'user')
  and public.resolve_subject_person_identity(registry.subject_type, registry.subject_id) is not null;

alter table public.person_identities enable row level security;
alter table public.person_identity_link_audit enable row level security;

drop policy if exists "person_identities_select_by_permission" on public.person_identities;
drop policy if exists "person_identities_insert_by_permission" on public.person_identities;
drop policy if exists "person_identities_update_by_permission" on public.person_identities;
drop policy if exists "person_identity_link_audit_select_by_permission" on public.person_identity_link_audit;
drop policy if exists "person_identity_link_audit_insert_by_permission" on public.person_identity_link_audit;

create policy "person_identities_select_by_permission"
on public.person_identities for select to authenticated
using (
  public.can_app_permission('volunteers', 'view')
  or public.can_app_permission('users', 'view')
  or public.can_module_action('volunteers', 'view')
  or public.can_module_action('users', 'view')
);

create policy "person_identities_insert_by_permission"
on public.person_identities for insert to authenticated
with check (
  public.can_app_permission('volunteers', 'create')
  or public.can_app_permission('users', 'create')
  or public.can_module_action('volunteers', 'create')
  or public.can_module_action('users', 'create')
);

create policy "person_identities_update_by_permission"
on public.person_identities for update to authenticated
using (
  public.can_app_permission('volunteers', 'edit')
  or public.can_app_permission('users', 'edit')
  or public.can_module_action('volunteers', 'edit')
  or public.can_module_action('users', 'edit')
)
with check (
  public.can_app_permission('volunteers', 'edit')
  or public.can_app_permission('users', 'edit')
  or public.can_module_action('volunteers', 'edit')
  or public.can_module_action('users', 'edit')
);

create policy "person_identity_link_audit_select_by_permission"
on public.person_identity_link_audit for select to authenticated
using (
  public.can_app_permission('volunteers', 'view')
  or public.can_app_permission('users', 'view')
  or public.can_module_action('volunteers', 'view')
  or public.can_module_action('users', 'view')
);

create policy "person_identity_link_audit_insert_by_permission"
on public.person_identity_link_audit for insert to authenticated
with check (
  public.can_app_permission('volunteers', 'edit')
  or public.can_app_permission('users', 'edit')
  or public.can_module_action('volunteers', 'edit')
  or public.can_module_action('users', 'edit')
);

grant select, insert, update on public.person_identities to authenticated;
grant select, insert on public.person_identity_link_audit to authenticated;

notify pgrst, 'reload schema';
commit;
