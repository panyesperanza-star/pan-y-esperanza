begin;

alter table public.social_resources
  add column if not exists portal_visibility_scope text not null default 'none';

alter table public.social_resources
  drop constraint if exists social_resources_portal_visibility_scope_check;

alter table public.social_resources
  add constraint social_resources_portal_visibility_scope_check
  check (portal_visibility_scope in ('none', 'all', 'compatible', 'selected'));

update public.social_resources
set portal_visibility_scope = case
  when publish_in_beneficiary_portal is not true then 'none'
  when visible_to_all_beneficiaries is true then 'all'
  when portal_visibility_scope is null or portal_visibility_scope = 'none' then 'selected'
  else portal_visibility_scope
end;

create table if not exists public.social_resource_portal_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.social_resources(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint social_resource_portal_beneficiaries_unique unique (resource_id, beneficiary_id)
);

alter table public.social_resource_portal_beneficiaries enable row level security;

drop policy if exists "social_resource_portal_beneficiaries_select_by_permission" on public.social_resource_portal_beneficiaries;
drop policy if exists "social_resource_portal_beneficiaries_insert_by_permission" on public.social_resource_portal_beneficiaries;
drop policy if exists "social_resource_portal_beneficiaries_update_by_permission" on public.social_resource_portal_beneficiaries;
drop policy if exists "social_resource_portal_beneficiaries_delete_by_permission" on public.social_resource_portal_beneficiaries;

create policy "social_resource_portal_beneficiaries_select_by_permission" on public.social_resource_portal_beneficiaries
for select to authenticated using (public.can_module_action('social-resources', 'view'));

create policy "social_resource_portal_beneficiaries_insert_by_permission" on public.social_resource_portal_beneficiaries
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));

create policy "social_resource_portal_beneficiaries_update_by_permission" on public.social_resource_portal_beneficiaries
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));

create policy "social_resource_portal_beneficiaries_delete_by_permission" on public.social_resource_portal_beneficiaries
for delete to authenticated using (public.can_module_action('social-resources', 'edit'));

create index if not exists social_resources_portal_visibility_idx
  on public.social_resources(portal_visibility_scope, status, deadline_at);

create index if not exists social_resource_portal_beneficiaries_beneficiary_idx
  on public.social_resource_portal_beneficiaries(beneficiary_id);

create index if not exists social_resource_portal_beneficiaries_resource_idx
  on public.social_resource_portal_beneficiaries(resource_id);

grant select, insert, update, delete on public.social_resource_portal_beneficiaries to authenticated;

notify pgrst, 'reload schema';

commit;
