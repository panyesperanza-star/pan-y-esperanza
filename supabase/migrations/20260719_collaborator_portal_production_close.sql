create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'Empresa',
  name text not null,
  contact_name text,
  email text not null unique,
  phone text,
  address text,
  logo_path text,
  is_active boolean not null default true,
  impact jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborator_portal_otps (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  email text not null,
  code text not null,
  action text not null default 'access',
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborator_portal_profile_updates (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  requested_changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'cancelled')),
  notes text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborator_portal_requests (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  request_type text not null default 'general',
  campaign_id uuid references public.campanas(id) on delete set null,
  title text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'resolved')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collaborator_certificates (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references public.collaborators(id) on delete cascade,
  title text not null,
  certificate_type text not null default 'individual',
  status text not null default 'Disponible',
  issued_at date,
  file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.donations add column if not exists collaborator_id uuid;
alter table public.recursos add column if not exists collaborator_id uuid references public.collaborators(id) on delete set null;
alter table public.recursos add column if not exists colaborador_id uuid references public.collaborators(id) on delete set null;
alter table public.recursos add column if not exists created_by_email text;
alter table public.recursos add column if not exists review_status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_collaborator_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_collaborator_id_fkey
      foreign key (collaborator_id) references public.collaborators(id) on delete set null;
  end if;
end $$;

create index if not exists idx_collaborators_email on public.collaborators(lower(email));
create index if not exists idx_collaborator_portal_otps_collaborator on public.collaborator_portal_otps(collaborator_id, created_at desc);
create index if not exists idx_collaborator_profile_updates_collaborator on public.collaborator_portal_profile_updates(collaborator_id, created_at desc);
create index if not exists idx_collaborator_requests_collaborator on public.collaborator_portal_requests(collaborator_id, created_at desc);
create index if not exists idx_collaborator_certificates_collaborator on public.collaborator_certificates(collaborator_id, issued_at desc);
create index if not exists idx_donations_collaborator_id on public.donations(collaborator_id);
create index if not exists idx_recursos_collaborator_id on public.recursos(collaborator_id);

drop trigger if exists collaborators_updated_at on public.collaborators;
drop trigger if exists collaborator_portal_otps_updated_at on public.collaborator_portal_otps;
drop trigger if exists collaborator_portal_profile_updates_updated_at on public.collaborator_portal_profile_updates;
drop trigger if exists collaborator_portal_requests_updated_at on public.collaborator_portal_requests;
drop trigger if exists collaborator_certificates_updated_at on public.collaborator_certificates;
create trigger collaborators_updated_at before update on public.collaborators for each row execute function public.set_updated_at();
create trigger collaborator_portal_otps_updated_at before update on public.collaborator_portal_otps for each row execute function public.set_updated_at();
create trigger collaborator_portal_profile_updates_updated_at before update on public.collaborator_portal_profile_updates for each row execute function public.set_updated_at();
create trigger collaborator_portal_requests_updated_at before update on public.collaborator_portal_requests for each row execute function public.set_updated_at();
create trigger collaborator_certificates_updated_at before update on public.collaborator_certificates for each row execute function public.set_updated_at();

create or replace function public.can_collaborator_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('donations', action_id)
    or public.can_app_permission('resources', action_id)
    or public.can_app_permission('settings', 'edit')
$$;

alter table public.collaborators enable row level security;
alter table public.collaborator_portal_otps enable row level security;
alter table public.collaborator_portal_profile_updates enable row level security;
alter table public.collaborator_portal_requests enable row level security;
alter table public.collaborator_certificates enable row level security;

drop policy if exists "collaborators_select_by_permission" on public.collaborators;
drop policy if exists "collaborators_insert_by_permission" on public.collaborators;
drop policy if exists "collaborators_update_by_permission" on public.collaborators;
drop policy if exists "collaborator_portal_otps_select_by_permission" on public.collaborator_portal_otps;
drop policy if exists "collaborator_portal_otps_insert_by_permission" on public.collaborator_portal_otps;
drop policy if exists "collaborator_portal_otps_update_by_permission" on public.collaborator_portal_otps;
drop policy if exists "collaborator_profile_updates_select_by_permission" on public.collaborator_portal_profile_updates;
drop policy if exists "collaborator_profile_updates_insert_by_permission" on public.collaborator_portal_profile_updates;
drop policy if exists "collaborator_profile_updates_update_by_permission" on public.collaborator_portal_profile_updates;
drop policy if exists "collaborator_requests_select_by_permission" on public.collaborator_portal_requests;
drop policy if exists "collaborator_requests_insert_by_permission" on public.collaborator_portal_requests;
drop policy if exists "collaborator_requests_update_by_permission" on public.collaborator_portal_requests;
drop policy if exists "collaborator_certificates_select_by_permission" on public.collaborator_certificates;
drop policy if exists "collaborator_certificates_insert_by_permission" on public.collaborator_certificates;
drop policy if exists "collaborator_certificates_update_by_permission" on public.collaborator_certificates;

create policy "collaborators_select_by_permission" on public.collaborators for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborators_insert_by_permission" on public.collaborators for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborators_update_by_permission" on public.collaborators for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));
create policy "collaborator_portal_otps_select_by_permission" on public.collaborator_portal_otps for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_portal_otps_insert_by_permission" on public.collaborator_portal_otps for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_portal_otps_update_by_permission" on public.collaborator_portal_otps for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));
create policy "collaborator_profile_updates_select_by_permission" on public.collaborator_portal_profile_updates for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_profile_updates_insert_by_permission" on public.collaborator_portal_profile_updates for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_profile_updates_update_by_permission" on public.collaborator_portal_profile_updates for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));
create policy "collaborator_requests_select_by_permission" on public.collaborator_portal_requests for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_requests_insert_by_permission" on public.collaborator_portal_requests for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_requests_update_by_permission" on public.collaborator_portal_requests for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));
create policy "collaborator_certificates_select_by_permission" on public.collaborator_certificates for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_certificates_insert_by_permission" on public.collaborator_certificates for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_certificates_update_by_permission" on public.collaborator_certificates for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

grant execute on function public.can_collaborator_portal_action(text) to authenticated;
grant select, insert, update on public.collaborators to authenticated;
grant select, insert, update on public.collaborator_portal_otps to authenticated;
grant select, insert, update on public.collaborator_portal_profile_updates to authenticated;
grant select, insert, update on public.collaborator_portal_requests to authenticated;
grant select, insert, update on public.collaborator_certificates to authenticated;
revoke delete on public.collaborators from authenticated;
revoke delete on public.collaborator_portal_otps from authenticated;
revoke delete on public.collaborator_portal_profile_updates from authenticated;
revoke delete on public.collaborator_portal_requests from authenticated;
revoke delete on public.collaborator_certificates from authenticated;
