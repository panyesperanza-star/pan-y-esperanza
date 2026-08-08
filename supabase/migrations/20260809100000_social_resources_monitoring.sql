begin;

alter table public.social_resources
  add column if not exists official_url text not null default '',
  add column if not exists verified_by uuid references public.app_users(id) on delete set null,
  add column if not exists verified_by_name text not null default '';

alter table public.social_resources
  drop constraint if exists social_resources_status_check;

alter table public.social_resources
  add constraint social_resources_status_check
  check (status in ('Activo', 'Proximamente', 'Cerrado', 'Pendiente de verificar'));

create table if not exists public.social_resource_history (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.social_resources(id) on delete cascade,
  changed_by uuid references public.app_users(id) on delete set null,
  changed_by_name text not null default '',
  change_type text not null default 'updated',
  changed_fields jsonb not null default '[]'::jsonb,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists social_resource_history_resource_idx
  on public.social_resource_history(resource_id, created_at desc);

alter table public.social_resource_history enable row level security;

drop policy if exists "social_resource_history_select_by_permission" on public.social_resource_history;
drop policy if exists "social_resource_history_insert_by_permission" on public.social_resource_history;
drop policy if exists "social_resource_history_update_by_permission" on public.social_resource_history;
drop policy if exists "social_resource_history_delete_by_permission" on public.social_resource_history;

create policy "social_resource_history_select_by_permission" on public.social_resource_history
for select to authenticated using (public.can_module_action('social-resources', 'view'));

create policy "social_resource_history_insert_by_permission" on public.social_resource_history
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));

create policy "social_resource_history_update_by_permission" on public.social_resource_history
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));

create policy "social_resource_history_delete_by_permission" on public.social_resource_history
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

grant select, insert, update, delete on public.social_resource_history to authenticated;

notify pgrst, 'reload schema';

commit;
