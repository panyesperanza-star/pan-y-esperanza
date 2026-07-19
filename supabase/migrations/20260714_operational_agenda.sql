create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  start_date date,
  end_date date,
  status text not null default 'Planificada' check (status in ('Planificada', 'Activa', 'Finalizada', 'Cancelada')),
  responsible text not null default '',
  observations text not null default '',
  beneficiary_ids uuid[] not null default '{}',
  product_ids uuid[] not null default '{}',
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agenda_operativa (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  event_type text not null check (event_type in ('Entrega', 'Campana', 'Recogida', 'Reunion', 'Evento', 'Voluntariado', 'Aviso', 'Caducidad')),
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Programado', 'En curso', 'Completado', 'Cancelado')),
  event_at timestamptz,
  end_at timestamptz,
  campaign_id uuid references public.campanas(id) on delete set null,
  responsible text not null default '',
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  product_id uuid references public.inventory_items(id) on delete set null,
  volunteer_id uuid references public.volunteers(id) on delete set null,
  origin_module text not null default '',
  source_record_id text not null default '',
  priority text not null default 'Normal',
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campana_beneficiarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, beneficiary_id)
);

create table if not exists public.campana_productos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  product_id uuid not null references public.inventory_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

drop trigger if exists campanas_updated_at on public.campanas;
create trigger campanas_updated_at
before update on public.campanas
for each row execute function public.set_updated_at();

drop trigger if exists agenda_operativa_updated_at on public.agenda_operativa;
create trigger agenda_operativa_updated_at
before update on public.agenda_operativa
for each row execute function public.set_updated_at();

alter table public.campanas enable row level security;
alter table public.agenda_operativa enable row level security;
alter table public.campana_beneficiarios enable row level security;
alter table public.campana_productos enable row level security;

drop policy if exists "authenticated_read_campanas" on public.campanas;
create policy "authenticated_read_campanas" on public.campanas for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campanas" on public.campanas;
create policy "authenticated_write_campanas" on public.campanas for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

drop policy if exists "authenticated_read_agenda_operativa" on public.agenda_operativa;
create policy "authenticated_read_agenda_operativa" on public.agenda_operativa for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_agenda_operativa" on public.agenda_operativa;
create policy "authenticated_write_agenda_operativa" on public.agenda_operativa for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create') or public.can_app_permission('agenda', 'delete')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

drop policy if exists "authenticated_read_campana_beneficiarios" on public.campana_beneficiarios;
create policy "authenticated_read_campana_beneficiarios" on public.campana_beneficiarios for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campana_beneficiarios" on public.campana_beneficiarios;
create policy "authenticated_write_campana_beneficiarios" on public.campana_beneficiarios for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

drop policy if exists "authenticated_read_campana_productos" on public.campana_productos;
create policy "authenticated_read_campana_productos" on public.campana_productos for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);

drop policy if exists "authenticated_write_campana_productos" on public.campana_productos;
create policy "authenticated_write_campana_productos" on public.campana_productos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notificaciones'
  ) then
    alter table public.notificaciones drop constraint if exists notificaciones_modulo_check;
    alter table public.notificaciones add constraint notificaciones_modulo_check
      check (modulo in ('beneficiaries', 'inventory', 'deliveries', 'donations', 'volunteers', 'resources', 'settings', 'agenda', 'dashboard'));
  end if;
end $$;

create index if not exists agenda_operativa_event_at_idx on public.agenda_operativa (event_at, status);
create index if not exists agenda_operativa_campaign_idx on public.agenda_operativa (campaign_id, event_at);
create index if not exists campanas_status_date_idx on public.campanas (status, start_date, end_date);
create index if not exists campana_beneficiarios_campaign_idx on public.campana_beneficiarios (campaign_id);
create index if not exists campana_productos_campaign_idx on public.campana_productos (campaign_id);
