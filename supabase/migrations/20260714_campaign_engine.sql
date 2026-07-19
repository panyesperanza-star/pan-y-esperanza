alter table public.campanas
  add column if not exists volunteer_ids uuid[] not null default '{}',
  add column if not exists delivery_ids uuid[] not null default '{}',
  add column if not exists agenda_event_ids uuid[] not null default '{}',
  add column if not exists notification_ids uuid[] not null default '{}',
  add column if not exists origin_type text not null default 'Necesidad social',
  add column if not exists source_module text not null default '',
  add column if not exists source_record_id text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.campana_voluntarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, volunteer_id)
);

create table if not exists public.campana_entregas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, delivery_id)
);

create table if not exists public.campana_agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  agenda_event_id uuid not null references public.agenda_operativa(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, agenda_event_id)
);

alter table public.campana_voluntarios enable row level security;
alter table public.campana_entregas enable row level security;
alter table public.campana_agenda_eventos enable row level security;

drop policy if exists "authenticated_read_campana_voluntarios" on public.campana_voluntarios;
create policy "authenticated_read_campana_voluntarios" on public.campana_voluntarios for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campana_voluntarios" on public.campana_voluntarios;
create policy "authenticated_write_campana_voluntarios" on public.campana_voluntarios for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

drop policy if exists "authenticated_read_campana_entregas" on public.campana_entregas;
create policy "authenticated_read_campana_entregas" on public.campana_entregas for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campana_entregas" on public.campana_entregas;
create policy "authenticated_write_campana_entregas" on public.campana_entregas for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

drop policy if exists "authenticated_read_campana_agenda_eventos" on public.campana_agenda_eventos;
create policy "authenticated_read_campana_agenda_eventos" on public.campana_agenda_eventos for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campana_agenda_eventos" on public.campana_agenda_eventos;
create policy "authenticated_write_campana_agenda_eventos" on public.campana_agenda_eventos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

create index if not exists campanas_origin_idx on public.campanas (origin_type, status);
create index if not exists campana_voluntarios_campaign_idx on public.campana_voluntarios (campaign_id);
create index if not exists campana_entregas_campaign_idx on public.campana_entregas (campaign_id);
create index if not exists campana_agenda_eventos_campaign_idx on public.campana_agenda_eventos (campaign_id);
