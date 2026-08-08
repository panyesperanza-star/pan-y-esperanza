begin;

create table if not exists public.social_resource_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_name text not null default '',
  source_type text not null default 'organismo_publico',
  scope text not null default 'municipal',
  official_url text not null,
  feed_url text not null default '',
  access_method text not null default 'web_oficial',
  check_frequency_days integer not null default 7,
  status text not null default 'Activa',
  last_checked_at timestamptz,
  last_check_status text not null default '',
  notes text not null default '',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_resource_sources_status_check check (status in ('Activa', 'Pausada', 'Archivada')),
  constraint social_resource_sources_scope_check check (scope in ('municipal', 'autonomico', 'estatal', 'privado')),
  constraint social_resource_sources_access_method_check check (access_method in ('api', 'feed', 'web_oficial', 'manual'))
);

create table if not exists public.social_resource_detections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.social_resource_sources(id) on delete set null,
  resource_id uuid references public.social_resources(id) on delete set null,
  duplicate_resource_id uuid references public.social_resources(id) on delete set null,
  detection_type text not null default 'Nueva convocatoria',
  status text not null default 'Pendiente de revision',
  title text not null,
  official_url text not null,
  detected_at timestamptz not null default now(),
  detected_by text not null default 'Vigilancia oficial',
  change_summary text not null default '',
  changed_fields jsonb not null default '[]'::jsonb,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  compatibility_count integer not null default 0,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  decision text not null default '',
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_resource_detections_status_check check (status in ('Pendiente de revision', 'Aprobada', 'Descartada')),
  constraint social_resource_detections_type_check check (detection_type in (
    'Nueva convocatoria',
    'Apertura de plazo',
    'Cambio de requisitos',
    'Cambio de importe',
    'Cambio de documentacion',
    'Ampliacion de plazo',
    'Cierre/caducidad'
  ))
);

create index if not exists social_resource_sources_status_idx
  on public.social_resource_sources(status);

create index if not exists social_resource_sources_next_check_idx
  on public.social_resource_sources(status, last_checked_at);

create index if not exists social_resource_detections_status_idx
  on public.social_resource_detections(status, detected_at desc);

create index if not exists social_resource_detections_source_idx
  on public.social_resource_detections(source_id, detected_at desc);

create index if not exists social_resource_detections_resource_idx
  on public.social_resource_detections(resource_id, detected_at desc);

drop trigger if exists social_resource_sources_updated_at on public.social_resource_sources;
create trigger social_resource_sources_updated_at
before update on public.social_resource_sources
for each row execute function public.set_updated_at();

drop trigger if exists social_resource_detections_updated_at on public.social_resource_detections;
create trigger social_resource_detections_updated_at
before update on public.social_resource_detections
for each row execute function public.set_updated_at();

alter table public.social_resource_sources enable row level security;
alter table public.social_resource_detections enable row level security;

drop policy if exists "social_resource_sources_select_by_permission" on public.social_resource_sources;
drop policy if exists "social_resource_sources_insert_by_permission" on public.social_resource_sources;
drop policy if exists "social_resource_sources_update_by_permission" on public.social_resource_sources;
drop policy if exists "social_resource_sources_delete_by_permission" on public.social_resource_sources;

create policy "social_resource_sources_select_by_permission" on public.social_resource_sources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_sources_insert_by_permission" on public.social_resource_sources
for insert to authenticated with check (public.can_module_action('social-resources', 'create'));
create policy "social_resource_sources_update_by_permission" on public.social_resource_sources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_sources_delete_by_permission" on public.social_resource_sources
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

drop policy if exists "social_resource_detections_select_by_permission" on public.social_resource_detections;
drop policy if exists "social_resource_detections_insert_by_permission" on public.social_resource_detections;
drop policy if exists "social_resource_detections_update_by_permission" on public.social_resource_detections;
drop policy if exists "social_resource_detections_delete_by_permission" on public.social_resource_detections;

create policy "social_resource_detections_select_by_permission" on public.social_resource_detections
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_detections_insert_by_permission" on public.social_resource_detections
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_detections_update_by_permission" on public.social_resource_detections
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_detections_delete_by_permission" on public.social_resource_detections
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

grant select, insert, update, delete on public.social_resource_sources to authenticated;
grant select, insert, update, delete on public.social_resource_detections to authenticated;

notify pgrst, 'reload schema';

commit;
