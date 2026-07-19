create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'info' check (tipo in ('info', 'warning', 'reminder', 'urgent', 'error')),
  prioridad text not null default 'info' check (prioridad in ('info', 'warning', 'reminder', 'urgent', 'error')),
  modulo text not null check (modulo in ('beneficiaries', 'inventory', 'deliveries', 'donations', 'volunteers', 'resources', 'settings', 'dashboard')),
  origen text,
  titulo text not null,
  mensaje text not null,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Leida', 'Archivada')),
  leida boolean not null default false,
  read_at timestamptz,
  read_by uuid references public.app_users(id) on delete set null,
  entity_type text,
  entity_id text,
  action_url text,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notificaciones_updated_at on public.notificaciones;
create trigger notificaciones_updated_at
before update on public.notificaciones
for each row execute function public.set_updated_at();

alter table public.notificaciones enable row level security;

drop policy if exists "authenticated_read_notificaciones" on public.notificaciones;
create policy "authenticated_read_notificaciones" on public.notificaciones
for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
);

drop policy if exists "authenticated_write_notificaciones" on public.notificaciones;
create policy "authenticated_write_notificaciones" on public.notificaciones
for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
) with check (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
);

create index if not exists notificaciones_created_idx on public.notificaciones (created_at desc);
create index if not exists notificaciones_pending_idx on public.notificaciones (leida, created_at desc) where leida = false;
create index if not exists notificaciones_module_priority_idx on public.notificaciones (modulo, prioridad, created_at desc);
