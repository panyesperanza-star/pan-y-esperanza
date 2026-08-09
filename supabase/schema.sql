create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beneficiary-photos', 'beneficiary-photos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-product-photos', 'inventory-product-photos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-signatures', 'delivery-signatures', false, 1048576, array['image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create table public.beneficiary_sequence (
  id smallint primary key default 1,
  last_value integer not null default 0,
  constraint beneficiary_sequence_single_row check (id = 1)
);

insert into public.beneficiary_sequence (id, last_value)
values (1, 0)
on conflict (id) do nothing;

create or replace function public.next_beneficiary_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  update public.beneficiary_sequence
  set last_value = last_value + 1
  where id = 1
  returning last_value into next_value;
  return 'PYE-' || lpad(next_value::text, 5, '0');
end;
$$;

create sequence if not exists public.official_credential_uid_sequence start with 1 increment by 1;

create table public.official_credential_registry (
  credential_uid text primary key,
  subject_type text not null check (subject_type in ('beneficiary', 'volunteer', 'collaborator')),
  subject_id uuid not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.next_official_credential_uid(p_subject_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_type text := lower(trim(coalesce(p_subject_type, '')));
  prefix text;
  next_value bigint;
  candidate text;
begin
  if normalized_type not in ('beneficiary', 'volunteer', 'collaborator') then
    raise exception 'Tipo de credencial no soportado: %', p_subject_type;
  end if;

  prefix := 'PE-' || to_char(current_date, 'YYYY') || '-';

  loop
    next_value := nextval('public.official_credential_uid_sequence'::regclass);
    candidate := prefix || lpad(next_value::text, 8, '0');

    exit when not exists (
      select 1 from public.official_credential_registry where credential_uid = candidate
      union all
      select 1 from public.beneficiaries where credential_uid = candidate
      union all
      select 1 from public.volunteers where credential_uid = candidate
      union all
      select 1 from public.collaborators where credential_uid = candidate
    );
  end loop;

  return candidate;
end;
$$;

create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.next_beneficiary_code(),
  credential_uid text not null default public.next_official_credential_uid('beneficiary'),
  full_name text not null,
  family_id uuid,
  family_relationship text,
  document_id text unique,
  address_full text,
  postal_code text,
  phone text,
  email text,
  photo_url text,
  photo_data_url text,
  birth_date date,
  sex text,
  nationality text,
  marital_status text,
  attached_document_name text,
  first_attention_at date,
  family_members integer not null default 1 check (family_members >= 1),
  minors_count integer not null default 0 check (minors_count >= 0),
  situation text not null default 'Activa' check (situation in ('Activa', 'Urgente', 'Seguimiento', 'Inactiva')),
  requested_help text,
  notes text,
  joined_at date not null default current_date,
  is_active boolean not null default true,
  last_help_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_settings (
  id text primary key default 'main',
  name text not null default 'Pan y Esperanza',
  cif text,
  address text,
  phone text,
  email text,
  website text,
  logo_path text,
  mail_sender_name text,
  mail_sender_email text,
  mail_provider text default 'Resend',
  smtp_host text,
  smtp_port integer default 587,
  smtp_user text,
  smtp_password text,
  smtp_secure boolean not null default false,
  paypal_settings jsonb not null default '{}'::jsonb,
  bizum_settings jsonb not null default '{}'::jsonb,
  stripe_settings jsonb not null default '{}'::jsonb,
  resend_settings jsonb not null default '{}'::jsonb,
  supabase_settings jsonb not null default '{}'::jsonb,
  public_variables jsonb not null default '{}'::jsonb,
  erp_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  family_code text not null unique,
  responsible_name text not null,
  address text,
  phone text,
  email text,
  dependents_count integer not null default 0,
  status text not null default 'Activa',
  notes text,
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.social_history (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references public.beneficiaries(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  date date not null default current_date,
  entry_type text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.beneficiary_documents (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references public.beneficiaries(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  document_type text not null,
  file_name text,
  file_data_url text,
  uploaded_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.beneficiary_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  access_identifier text not null default ('PYE-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  pin_hash text,
  pin_salt text,
  pin_set_at timestamptz,
  must_change_pin boolean not null default false,
  pin_changed_at timestamptz,
  temporary_pin_sent_at timestamptz,
  failed_access_attempts integer not null default 0 check (failed_access_attempts >= 0),
  last_failed_access_at timestamptz,
  last_successful_access_at timestamptz,
  locked_until timestamptz,
  email text,
  phone text,
  status text not null default 'draft' check (status in ('draft', 'invited', 'active', 'suspended', 'archived')),
  access_level text not null default 'beneficiary' check (access_level in ('beneficiary', 'family', 'guardian')),
  invited_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beneficiary_portal_accounts_beneficiary_unique unique (beneficiary_id)
);

create table if not exists public.beneficiary_portal_otps (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  email text,
  phone text,
  code text not null,
  action text not null default 'access',
  channel text not null default 'email',
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beneficiary_portal_notices (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  title text not null,
  message text not null,
  notice_type text not null default 'general',
  status text not null default 'unread' check (status in ('unread', 'read', 'archived')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beneficiary_portal_renewals (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  renewal_type text not null default 'general',
  renewal_due_at date,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'approved', 'rejected', 'resolved', 'expired')),
  notes text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beneficiary_portal_profile_updates (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  requested_changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  reviewed_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  portal text not null check (portal in ('beneficiary', 'collaborator', 'donor')),
  subject_type text not null,
  subject_id uuid not null,
  email text,
  channel text not null default 'email',
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  logged_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beneficiary_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  portal_session_id uuid references public.portal_sessions(id) on delete set null,
  session_id text,
  category text not null default 'general',
  user_message text not null,
  assistant_response text not null,
  action_performed text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint beneficiary_assistant_user_message_length check (char_length(user_message) <= 1200),
  constraint beneficiary_assistant_response_length check (char_length(assistant_response) <= 3000)
);

create index if not exists beneficiary_portal_accounts_beneficiary_idx on public.beneficiary_portal_accounts (beneficiary_id);
create index if not exists beneficiary_portal_accounts_auth_user_idx on public.beneficiary_portal_accounts (auth_user_id);
create unique index if not exists beneficiary_portal_accounts_access_identifier_uidx on public.beneficiary_portal_accounts (access_identifier);
create index if not exists beneficiary_portal_otps_beneficiary_idx on public.beneficiary_portal_otps (beneficiary_id, created_at desc);
create index if not exists beneficiary_portal_notices_beneficiary_idx on public.beneficiary_portal_notices (beneficiary_id, status);
create index if not exists beneficiary_portal_renewals_beneficiary_idx on public.beneficiary_portal_renewals (beneficiary_id, status, renewal_due_at);
create index if not exists beneficiary_portal_profile_updates_beneficiary_idx on public.beneficiary_portal_profile_updates (beneficiary_id, status);
create index if not exists beneficiary_assistant_messages_beneficiary_idx on public.beneficiary_assistant_messages (beneficiary_id, created_at desc);
create index if not exists beneficiary_assistant_messages_session_idx on public.beneficiary_assistant_messages (portal_session_id, created_at desc);
create index if not exists beneficiary_assistant_messages_category_idx on public.beneficiary_assistant_messages (category, created_at desc);
create index if not exists portal_sessions_subject_idx on public.portal_sessions (portal, subject_id, status, expires_at);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  category text not null check (length(btrim(category)) > 0),
  lot text,
  expires_at date,
  donor text,
  location text,
  unit text not null default 'unidades' check (length(btrim(unit)) > 0),
  stock numeric(12,2) not null default 0 check (stock >= 0),
  low_stock_threshold numeric(12,2) not null default 0 check (low_stock_threshold >= 0),
  notes text,
  photo_url text,
  photo_data_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  beneficiary_name text,
  family_id uuid,
  family_name text,
  delivered_at date not null default current_date,
  delivered_time time,
  responsible text,
  help_type text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_item_name text,
  receiver_name text,
  receiver_document_id text,
  reception_at timestamptz,
  signature_data_url text,
  signature_storage_bucket text,
  signature_storage_path text,
  signature_signed_at timestamptz,
  responsible_signature_data_url text,
  responsible_signature_storage_bucket text,
  responsible_signature_storage_path text,
  responsible_signature_signed_at timestamptz,
  attendance_status text not null default 'pending' check (attendance_status in ('pending', 'confirmed', 'unavailable', 'needs_contact')),
  attendance_confirmed_at timestamptz,
  attendance_source text check (attendance_source is null or attendance_source in ('portal', 'erp', 'system')),
  attendance_reason text,
  attendance_notes text,
  notes text,
  status text not null default 'Activa' check (status in ('Activa', 'Anulada')),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_by_name text,
  cancellation_reason text,
  created_at timestamptz not null default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  recipient text not null,
  sent_by text,
  receipts_count integer not null default 0,
  result text,
  subject text,
  message text,
  attachments jsonb not null default '[]'::jsonb,
  provider_id text,
  status text not null default 'Enviado',
  receipt_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor text not null,
  donor_kind text,
  donation_type text,
  donated_at date not null default current_date,
  estimated_value numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_incomes (
  id uuid primary key default gen_random_uuid(),
  income_at date not null default current_date,
  category text not null default 'Donaciones',
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  donor text,
  payment_method text,
  notes text,
  document_name text,
  created_at timestamptz not null default now()
);

create table public.treasury_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_at date not null default current_date,
  category text not null default 'Alimentacion',
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  supplier text,
  responsible text,
  invoice_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_loans (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  loan_at date not null default current_date,
  concept text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Pendiente de devolver' check (status in ('Pendiente', 'Pendiente de devolver', 'Devuelto', 'Parcialmente devuelto')),
  returned_at date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type text not null default 'Caja efectivo' check (account_type in ('Caja', 'Banco', 'Caja efectivo', 'Cuenta bancaria')),
  balance numeric(12,2) not null default 0,
  bank_name text,
  account_number text,
  movements text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  item_name text,
  movement_type text not null check (movement_type in ('Entrada', 'Salida')),
  quantity numeric(12,2) not null check (quantity > 0),
  moved_at date not null default current_date,
  responsible text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  credential_uid text not null default public.next_official_credential_uid('volunteer'),
  full_name text not null,
  document_id text,
  phone text,
  email text,
  training text,
  availability text,
  documentation text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.volunteer_history (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid references public.volunteers(id) on delete cascade,
  date date not null default current_date,
  activity text,
  hours numeric(6,2),
  notes text,
  created_at timestamptz not null default now()
);

create table public.roles (
  id text primary key,
  name text not null,
  modules jsonb not null default '[]'::jsonb
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_name text,
  user_email text,
  action text not null,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text,
  email text not null unique,
  phone text,
  role text not null check (role in ('Superadministrador', 'Superadministrador del sistema', 'Platform Owner', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Voluntario', 'Coordinador', 'Presidente', 'Tesorero', 'Secretario', 'Administrador', 'Consulta')),
  position text,
  status text not null default 'Activo' check (status in ('Activo', 'Inactivo', 'Bloqueado')),
  is_active boolean not null default true,
  permissions jsonb not null default '[]'::jsonb,
  permission_matrix jsonb not null default '{}'::jsonb,
  organization_scope text not null default 'organization' check (organization_scope in ('organization', 'platform')),
  platform_owner_provider text,
  profile_photo text,
  last_access_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  constraint app_users_platform_owner_scope_check check (
    role <> 'Platform Owner'
    or (organization_scope = 'platform' and platform_owner_provider = 'ALTHEMON')
  )
);

create table public.platform_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  operation_label text not null,
  operation_scope text not null,
  risk_level text not null check (risk_level in ('alto', 'critico')),
  status text not null check (status in ('prepared', 'password_failed', 'cancelled', 'executed', 'failed')),
  reason text not null,
  result text not null default '',
  provider text not null default 'ALTHEMON',
  requested_by uuid references public.app_users(id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  user_role text not null default '',
  user_agent text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campanas (
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
  volunteer_ids uuid[] not null default '{}',
  delivery_ids uuid[] not null default '{}',
  agenda_event_ids uuid[] not null default '{}',
  notification_ids uuid[] not null default '{}',
  origin_type text not null default 'Necesidad social',
  source_module text not null default '',
  source_record_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agenda_operativa (
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

create table public.campana_beneficiarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, beneficiary_id)
);

create table public.campana_productos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  product_id uuid not null references public.inventory_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);

create table public.campana_voluntarios (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, volunteer_id)
);

create table public.campana_entregas (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, delivery_id)
);

create table public.campana_agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campanas(id) on delete cascade,
  agenda_event_id uuid not null references public.agenda_operativa(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, agenda_event_id)
);

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'info' check (tipo in ('info', 'warning', 'reminder', 'urgent', 'error')),
  prioridad text not null default 'info' check (prioridad in ('info', 'warning', 'reminder', 'urgent', 'error')),
  modulo text not null check (modulo in ('beneficiaries', 'inventory', 'deliveries', 'donations', 'donors', 'collaborators', 'volunteers', 'resources', 'settings', 'agenda', 'dashboard')),
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

create table if not exists public.categorias_recursos (
  id uuid not null default gen_random_uuid(),
  slug text primary key,
  nombre text not null unique,
  icono text not null default '',
  descripcion text not null default '',
  orden integer not null default 0,
  sort_order integer not null default 0,
  activa boolean not null default true,
  estado text not null default 'active' check (estado in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorias_recursos_id_unico unique (id)
);

create table if not exists public.recursos (
  id text primary key,
  titulo text not null,
  slug text unique,
  descripcion text not null,
  categoria_slug text not null references public.categorias_recursos(slug) on update cascade,
  categoria_nombre text not null,
  provincia_slug text not null default 'madrid',
  provincia_nombre text not null default 'Madrid',
  provincia text not null default 'madrid',
  tipo text not null default 'Recurso',
  url text not null default '/#contacto',
  telefono text not null default '',
  email text not null default '',
  direccion text not null default '',
  etiquetas text[] not null default '{}',
  es_gratuito boolean not null default true,
  es_online boolean not null default false,
  publicado boolean not null default false,
  destacado boolean not null default false,
  es_destacado boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived')),
  published_at timestamptz,
  published_by uuid references public.app_users(id) on delete set null,
  unpublished_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  constraint recursos_titulo_minimo check (char_length(titulo) >= 3),
  constraint recursos_descripcion_minima check (char_length(descripcion) >= 10),
  constraint recursos_url_valida check (url = '' or url like '/%' or url like '#%' or url ~* '^(https?|mailto|tel):')
);

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
  official_url text not null default '',
  application_method text not null default '',
  status text not null default 'Activo',
  scope text not null default 'municipal',
  portal_visibility_scope text not null default 'none',
  visible_to_all_beneficiaries boolean not null default false,
  publish_in_beneficiary_portal boolean not null default false,
  last_verified_at date,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_by_name text not null default '',
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
  constraint social_resources_status_check check (status in ('Activo', 'Proximamente', 'Cerrado', 'Pendiente de verificar')),
  constraint social_resources_scope_check check (scope in ('municipal', 'autonomico', 'estatal', 'privado')),
  constraint social_resources_portal_visibility_scope_check check (portal_visibility_scope in ('none', 'all', 'compatible', 'selected')),
  constraint social_resources_age_check check (
    (age_min is null or age_min >= 0)
    and (age_max is null or age_max >= 0)
    and (age_min is null or age_max is null or age_min <= age_max)
  )
);

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
  next_check_at timestamptz,
  last_check_started_at timestamptz,
  last_check_finished_at timestamptz,
  last_check_status text not null default '',
  last_check_error text not null default '',
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
  raw_payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null default '',
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

create table if not exists public.social_resource_portal_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.social_resources(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint social_resource_portal_beneficiaries_unique unique (resource_id, beneficiary_id)
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

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  association_id text not null,
  association_name text not null,
  module text not null,
  record_type text not null,
  record_id text not null,
  record_label text,
  requester_id uuid references public.app_users(id) on delete set null,
  requester_name text,
  requester_email text,
  requested_at timestamptz not null default now(),
  reason text not null,
  notes text,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Aprobada', 'Rechazada')),
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(id) on delete set null,
  resolved_by_name text,
  resolved_by_email text,
  resolution_reason text,
  relations_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deletion_requests_reason_check check (char_length(trim(reason)) >= 5)
);

alter table public.deliveries
  add constraint deliveries_cancelled_by_fkey
  foreign key (cancelled_by) references public.app_users(id) on delete set null;

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index password_reset_tokens_email_idx on public.password_reset_tokens (lower(email));
create index password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

create or replace function public.can_write_treasury()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where is_active = true
      and role in ('Superadministrador', 'Superadministrador del sistema', 'Tesorera', 'Tesorero')
      and (
        auth_user_id = auth.uid()
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.official_credential_subject_type(table_name text)
returns text
language plpgsql
immutable
as $$
begin
  case table_name
    when 'beneficiaries' then
      return 'beneficiary';
    when 'volunteers' then
      return 'volunteer';
    when 'collaborators' then
      return 'collaborator';
    else
      raise exception 'Tabla sin tipo de credencial oficial: %', table_name;
  end case;
end;
$$;

create or replace function public.set_official_credential_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_type text := public.official_credential_subject_type(tg_table_name);
begin
  if tg_op = 'UPDATE' then
    if new.credential_uid is distinct from old.credential_uid then
      raise exception 'El ID de credencial oficial es inmutable y no puede modificarse.';
    end if;
    return new;
  end if;

  if nullif(trim(coalesce(new.credential_uid, '')), '') is null then
    new.credential_uid := public.next_official_credential_uid(subject_type);
  end if;

  return new;
end;
$$;

create or replace function public.register_official_credential_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_type text := public.official_credential_subject_type(tg_table_name);
begin
  insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
  values (new.credential_uid, subject_type, new.id);

  return new;
exception
  when unique_violation then
    raise exception 'El ID de credencial % ya existe y no puede duplicarse.', new.credential_uid;
end;
$$;

create trigger official_credential_registry_updated_at before update on public.official_credential_registry for each row execute function public.set_updated_at();
create trigger beneficiaries_updated_at before update on public.beneficiaries for each row execute function public.set_updated_at();
create trigger beneficiaries_set_official_credential_uid before insert or update of credential_uid on public.beneficiaries for each row execute function public.set_official_credential_uid();
create trigger beneficiaries_register_official_credential_uid after insert on public.beneficiaries for each row execute function public.register_official_credential_uid();
create trigger organization_settings_updated_at before update on public.organization_settings for each row execute function public.set_updated_at();
create trigger families_updated_at before update on public.families for each row execute function public.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger beneficiary_portal_accounts_updated_at before update on public.beneficiary_portal_accounts for each row execute function public.set_updated_at();
create trigger beneficiary_portal_otps_updated_at before update on public.beneficiary_portal_otps for each row execute function public.set_updated_at();
create trigger beneficiary_portal_notices_updated_at before update on public.beneficiary_portal_notices for each row execute function public.set_updated_at();
create trigger beneficiary_portal_renewals_updated_at before update on public.beneficiary_portal_renewals for each row execute function public.set_updated_at();
create trigger beneficiary_portal_profile_updates_updated_at before update on public.beneficiary_portal_profile_updates for each row execute function public.set_updated_at();
create trigger portal_sessions_updated_at before update on public.portal_sessions for each row execute function public.set_updated_at();
create trigger categorias_recursos_updated_at before update on public.categorias_recursos for each row execute function public.set_updated_at();
create trigger recursos_updated_at before update on public.recursos for each row execute function public.set_updated_at();
create trigger social_resources_updated_at before update on public.social_resources for each row execute function public.set_updated_at();
create trigger social_resource_sources_updated_at before update on public.social_resource_sources for each row execute function public.set_updated_at();
create trigger social_resource_detections_updated_at before update on public.social_resource_detections for each row execute function public.set_updated_at();
create trigger beneficiary_social_resources_updated_at before update on public.beneficiary_social_resources for each row execute function public.set_updated_at();
create trigger campanas_updated_at before update on public.campanas for each row execute function public.set_updated_at();
create trigger agenda_operativa_updated_at before update on public.agenda_operativa for each row execute function public.set_updated_at();
create trigger notificaciones_updated_at before update on public.notificaciones for each row execute function public.set_updated_at();
create trigger volunteers_set_official_credential_uid before insert or update of credential_uid on public.volunteers for each row execute function public.set_official_credential_uid();
create trigger volunteers_register_official_credential_uid after insert on public.volunteers for each row execute function public.register_official_credential_uid();

create or replace function public.apply_delivery_effects()
returns trigger
language plpgsql
as $$
begin
  update public.beneficiaries
  set last_help_at = new.delivered_at
  where id = new.beneficiary_id;

  if new.inventory_item_id is not null then
    update public.inventory_items
    set stock = greatest(stock - new.quantity, 0)
    where id = new.inventory_item_id;

    insert into public.inventory_movements (item_id, item_name, movement_type, quantity, moved_at, responsible, notes)
    values (new.inventory_item_id, new.inventory_item_name, 'Salida', new.quantity, new.delivered_at, new.responsible, 'Salida automatica por entrega');
  end if;

  return new;
end;
$$;

create trigger deliveries_apply_effects
after insert on public.deliveries
for each row execute function public.apply_delivery_effects();

alter table public.beneficiaries enable row level security;
alter table public.official_credential_registry enable row level security;
alter table public.organization_settings enable row level security;
alter table public.families enable row level security;
alter table public.social_history enable row level security;
alter table public.beneficiary_documents enable row level security;
alter table public.beneficiary_portal_accounts enable row level security;
alter table public.beneficiary_portal_otps enable row level security;
alter table public.beneficiary_portal_notices enable row level security;
alter table public.beneficiary_portal_renewals enable row level security;
alter table public.beneficiary_portal_profile_updates enable row level security;
alter table public.portal_sessions enable row level security;
alter table public.beneficiary_assistant_messages enable row level security;
alter table public.deliveries enable row level security;
alter table public.email_logs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.donations enable row level security;
alter table public.treasury_incomes enable row level security;
alter table public.treasury_expenses enable row level security;
alter table public.treasury_loans enable row level security;
alter table public.treasury_accounts enable row level security;
alter table public.volunteers enable row level security;
alter table public.volunteer_history enable row level security;
alter table public.categorias_recursos enable row level security;
alter table public.recursos enable row level security;
alter table public.social_resources enable row level security;
alter table public.beneficiary_social_resources enable row level security;
alter table public.social_resource_portal_beneficiaries enable row level security;
alter table public.social_resource_followups enable row level security;
alter table public.social_resource_history enable row level security;
alter table public.social_resource_sources enable row level security;
alter table public.social_resource_detections enable row level security;
alter table public.campanas enable row level security;
alter table public.agenda_operativa enable row level security;
alter table public.campana_beneficiarios enable row level security;
alter table public.campana_productos enable row level security;
alter table public.campana_voluntarios enable row level security;
alter table public.campana_entregas enable row level security;
alter table public.campana_agenda_eventos enable row level security;
alter table public.notificaciones enable row level security;
alter table public.roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_maintenance_logs enable row level security;
alter table public.app_users enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.password_reset_tokens enable row level security;

create policy "authenticated_read_beneficiaries" on public.beneficiaries for select to authenticated using (true);
create policy "authenticated_write_beneficiaries" on public.beneficiaries for all to authenticated using (true) with check (true);
create policy "official_credential_registry_select_authenticated" on public.official_credential_registry for select to authenticated using (true);
create policy "authenticated_read_organization_settings" on public.organization_settings for select to authenticated using (true);
create policy "authenticated_write_organization_settings" on public.organization_settings for all to authenticated using (true) with check (true);
create policy "authenticated_read_families" on public.families for select to authenticated using (true);
create policy "authenticated_write_families" on public.families for all to authenticated using (true) with check (true);
create policy "authenticated_read_social_history" on public.social_history for select to authenticated using (true);
create policy "authenticated_write_social_history" on public.social_history for all to authenticated using (true) with check (true);
create policy "authenticated_read_beneficiary_documents" on public.beneficiary_documents for select to authenticated using (true);
create policy "authenticated_write_beneficiary_documents" on public.beneficiary_documents for all to authenticated using (true) with check (true);
create policy "authenticated_read_deliveries" on public.deliveries for select to authenticated using (true);
create policy "authenticated_write_deliveries" on public.deliveries for all to authenticated using (true) with check (true);
create policy "authenticated_read_email_logs" on public.email_logs for select to authenticated using (true);
create policy "authenticated_write_email_logs" on public.email_logs for all to authenticated using (true) with check (true);
create policy "authenticated_read_inventory_items" on public.inventory_items for select to authenticated using (true);
create policy "authenticated_write_inventory_items" on public.inventory_items for all to authenticated using (true) with check (true);
create policy "authenticated_read_inventory_movements" on public.inventory_movements for select to authenticated using (true);
create policy "authenticated_write_inventory_movements" on public.inventory_movements for all to authenticated using (true) with check (true);
create policy "authenticated_read_donations" on public.donations for select to authenticated using (true);
create policy "authenticated_write_donations" on public.donations for all to authenticated using (true) with check (true);
create policy "treasury_incomes_select_accounting" on public.treasury_incomes for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_incomes_insert_accounting" on public.treasury_incomes for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_incomes_update_accounting" on public.treasury_incomes for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_incomes_delete_accounting" on public.treasury_incomes for delete to authenticated using (public.can_app_permission('accounting', 'delete'));
create policy "treasury_expenses_select_accounting" on public.treasury_expenses for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_expenses_insert_accounting" on public.treasury_expenses for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_expenses_update_accounting" on public.treasury_expenses for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_expenses_delete_accounting" on public.treasury_expenses for delete to authenticated using (public.can_app_permission('accounting', 'delete'));
create policy "treasury_loans_select_accounting" on public.treasury_loans for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_loans_insert_accounting" on public.treasury_loans for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_loans_update_accounting" on public.treasury_loans for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_loans_delete_accounting" on public.treasury_loans for delete to authenticated using (public.can_app_permission('accounting', 'delete'));
create policy "treasury_accounts_select_accounting" on public.treasury_accounts for select to authenticated using (public.can_app_permission('accounting', 'view'));
create policy "treasury_accounts_insert_accounting" on public.treasury_accounts for insert to authenticated with check (public.can_app_permission('accounting', 'create'));
create policy "treasury_accounts_update_accounting" on public.treasury_accounts for update to authenticated using (public.can_app_permission('accounting', 'edit')) with check (public.can_app_permission('accounting', 'edit'));
create policy "treasury_accounts_delete_accounting" on public.treasury_accounts for delete to authenticated using (public.can_app_permission('accounting', 'delete'));
create policy "authenticated_read_volunteers" on public.volunteers for select to authenticated using (true);
create policy "authenticated_write_volunteers" on public.volunteers for all to authenticated using (true) with check (true);
create policy "authenticated_read_volunteer_history" on public.volunteer_history for select to authenticated using (true);
create policy "authenticated_write_volunteer_history" on public.volunteer_history for all to authenticated using (true) with check (true);
create policy "public_read_active_resource_categories" on public.categorias_recursos for select using (activa = true or auth.role() = 'authenticated');
create policy "authenticated_write_resource_categories" on public.categorias_recursos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('settings', 'edit') or public.can_app_permission('resources', 'edit')
) with check (
  public.is_app_admin() or public.can_app_permission('settings', 'edit') or public.can_app_permission('resources', 'edit')
);
create policy "public_read_published_resources" on public.recursos for select using (
  (publicado = true and status = 'published') or auth.role() = 'authenticated'
);
create policy "authenticated_write_resources" on public.recursos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('settings', 'edit') or public.can_app_permission('resources', 'edit')
) with check (
  public.is_app_admin() or public.can_app_permission('settings', 'edit') or public.can_app_permission('resources', 'edit')
);
create policy "social_resources_select_by_permission" on public.social_resources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resources_insert_by_permission" on public.social_resources
for insert to authenticated with check (public.can_module_action('social-resources', 'create'));
create policy "social_resources_update_by_permission" on public.social_resources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resources_delete_by_permission" on public.social_resources
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));
create policy "beneficiary_social_resources_select_by_permission" on public.beneficiary_social_resources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "beneficiary_social_resources_insert_by_permission" on public.beneficiary_social_resources
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "beneficiary_social_resources_update_by_permission" on public.beneficiary_social_resources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "beneficiary_social_resources_delete_by_permission" on public.beneficiary_social_resources
for delete to authenticated using (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_portal_beneficiaries_select_by_permission" on public.social_resource_portal_beneficiaries
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_portal_beneficiaries_insert_by_permission" on public.social_resource_portal_beneficiaries
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_portal_beneficiaries_update_by_permission" on public.social_resource_portal_beneficiaries
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_portal_beneficiaries_delete_by_permission" on public.social_resource_portal_beneficiaries
for delete to authenticated using (public.can_module_action('social-resources', 'edit'));
grant select, insert, update, delete on public.social_resource_portal_beneficiaries to authenticated;
create policy "social_resource_followups_select_by_permission" on public.social_resource_followups
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_followups_insert_by_permission" on public.social_resource_followups
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_followups_update_by_permission" on public.social_resource_followups
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_followups_delete_by_permission" on public.social_resource_followups
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

create policy "social_resource_history_select_by_permission" on public.social_resource_history
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_history_insert_by_permission" on public.social_resource_history
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_history_update_by_permission" on public.social_resource_history
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_history_delete_by_permission" on public.social_resource_history
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

create policy "social_resource_sources_select_by_permission" on public.social_resource_sources
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_sources_insert_by_permission" on public.social_resource_sources
for insert to authenticated with check (public.can_module_action('social-resources', 'create'));
create policy "social_resource_sources_update_by_permission" on public.social_resource_sources
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_sources_delete_by_permission" on public.social_resource_sources
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));

create policy "social_resource_detections_select_by_permission" on public.social_resource_detections
for select to authenticated using (public.can_module_action('social-resources', 'view'));
create policy "social_resource_detections_insert_by_permission" on public.social_resource_detections
for insert to authenticated with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_detections_update_by_permission" on public.social_resource_detections
for update to authenticated using (public.can_module_action('social-resources', 'edit')) with check (public.can_module_action('social-resources', 'edit'));
create policy "social_resource_detections_delete_by_permission" on public.social_resource_detections
for delete to authenticated using (public.can_module_action('social-resources', 'delete'));
create policy "authenticated_read_campanas" on public.campanas for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campanas" on public.campanas for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_agenda_operativa" on public.agenda_operativa for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_agenda_operativa" on public.agenda_operativa for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create') or public.can_app_permission('agenda', 'delete')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_campana_beneficiarios" on public.campana_beneficiarios for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campana_beneficiarios" on public.campana_beneficiarios for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_campana_productos" on public.campana_productos for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campana_productos" on public.campana_productos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_campana_voluntarios" on public.campana_voluntarios for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campana_voluntarios" on public.campana_voluntarios for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_campana_entregas" on public.campana_entregas for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campana_entregas" on public.campana_entregas for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_campana_agenda_eventos" on public.campana_agenda_eventos for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'view')
);
create policy "authenticated_write_campana_agenda_eventos" on public.campana_agenda_eventos for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
) with check (
  public.is_app_admin() or public.can_app_permission('agenda', 'edit') or public.can_app_permission('agenda', 'create')
);
create policy "authenticated_read_notificaciones" on public.notificaciones for select to authenticated using (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
);
create policy "authenticated_write_notificaciones" on public.notificaciones for all to authenticated using (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
) with check (
  public.is_app_admin() or public.can_app_permission('notifications', 'view')
);
create policy "authenticated_read_roles" on public.roles for select to authenticated using (true);
create policy "authenticated_write_roles" on public.roles for all to authenticated using (true) with check (true);
create policy "authenticated_read_audit_logs" on public.audit_logs for select to authenticated using (true);
create policy "authenticated_write_audit_logs" on public.audit_logs for all to authenticated using (true) with check (true);
create index platform_maintenance_logs_created_idx on public.platform_maintenance_logs (created_at desc);
create index platform_maintenance_logs_operation_idx on public.platform_maintenance_logs (operation_id, created_at desc);
create policy "platform_maintenance_logs_select_owner" on public.platform_maintenance_logs for select to authenticated using (public.is_platform_owner());
create policy "platform_maintenance_logs_insert_owner" on public.platform_maintenance_logs for insert to authenticated with check (public.is_platform_owner());
create policy "platform_maintenance_logs_no_update" on public.platform_maintenance_logs for update to authenticated using (false) with check (false);
create policy "platform_maintenance_logs_no_delete" on public.platform_maintenance_logs for delete to authenticated using (false);
grant select, insert on public.platform_maintenance_logs to authenticated;
revoke update, delete on public.platform_maintenance_logs from authenticated;
create policy "password_reset_tokens_no_client_access" on public.password_reset_tokens for all to authenticated using (false) with check (false);

create or replace function public.current_app_user()
returns public.app_users
language sql
stable
security definer
set search_path = public
as $$
  select u
  from public.app_users u
  where u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
      and (
        u.role in ('Superadministrador', 'Presidenta', 'Secretaria', 'Administrador')
        or u.permissions ? 'users'
        or u.permissions ? '*'
        or coalesce((u.permission_matrix -> 'users' ->> 'create')::boolean, false) = true
        or coalesce((u.permission_matrix -> 'users' ->> 'edit')::boolean, false) = true
        or coalesce((u.permission_matrix -> 'users' ->> 'delete')::boolean, false) = true
      )
  )
$$;

create or replace function public.is_system_superadmin_role(role_name text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(role_name, ''))) in (
    'superadministrador del sistema',
    'superadministrador sistema',
    'system superadmin'
  )
$$;

create or replace function public.is_platform_owner_role(role_name text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(role_name, ''))) = 'platform owner'
$$;

create or replace function public.is_system_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and public.is_system_superadmin_role(u.role)
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and public.is_platform_owner_role(u.role)
      and u.organization_scope = 'platform'
      and u.platform_owner_provider = 'ALTHEMON'
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

create policy "app_users_select_self_or_admin" on public.app_users for select to authenticated using (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);
create policy "app_users_insert_admin" on public.app_users for insert to authenticated with check (
  public.is_system_superadmin()
  or (public.is_app_admin() and not public.is_system_superadmin_role(role) and not public.is_platform_owner_role(role))
);
create policy "app_users_update_self_or_admin" on public.app_users for update to authenticated using (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
) with check (
  public.is_system_superadmin()
  or public.is_platform_owner()
  or (
    not public.is_system_superadmin_role(role)
    and not public.is_platform_owner_role(role)
    and (
      public.is_app_admin()
      or auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);
create policy "app_users_delete_admin" on public.app_users for delete to authenticated using (
  public.is_system_superadmin()
  or (public.is_app_admin() and not public.is_system_superadmin_role(role) and not public.is_platform_owner_role(role))
);
grant execute on function public.current_app_user() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_system_superadmin_role(text) to authenticated;
grant execute on function public.is_system_superadmin() to authenticated;
grant execute on function public.is_platform_owner_role(text) to authenticated;
grant execute on function public.is_platform_owner() to authenticated;

create policy "authenticated_read_documentos" on storage.objects for select to authenticated using (bucket_id = 'documentos');
create policy "authenticated_write_documentos" on storage.objects for all to authenticated using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
create policy "beneficiary_photos_select_by_permission" on storage.objects for select to authenticated using (
  bucket_id = 'beneficiary-photos'
);
create policy "beneficiary_photos_insert_by_permission" on storage.objects for insert to authenticated with check (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
);
create policy "beneficiary_photos_delete_by_permission" on storage.objects for delete to authenticated using (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
);

create policy "inventory_product_photos_select_by_permission" on storage.objects for select to authenticated using (
  bucket_id = 'inventory-product-photos'
  and public.can_app_permission('inventory', 'view')
);
create policy "inventory_product_photos_insert_by_permission" on storage.objects for insert to authenticated with check (
  bucket_id = 'inventory-product-photos'
  and (storage.foldername(name))[1] = 'products'
  and public.can_app_permission('inventory', 'edit')
);
create policy "inventory_product_photos_delete_by_permission" on storage.objects for delete to authenticated using (
  bucket_id = 'inventory-product-photos'
  and (storage.foldername(name))[1] = 'products'
  and public.can_app_permission('inventory', 'edit')
);

create policy "delivery_signatures_select_by_permission" on storage.objects for select to authenticated using (
  bucket_id = 'delivery-signatures'
);
create policy "delivery_signatures_insert_by_permission" on storage.objects for insert to authenticated with check (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);
create policy "delivery_signatures_update_by_permission" on storage.objects for update to authenticated using (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
) with check (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);
create policy "delivery_signatures_delete_by_permission" on storage.objects for delete to authenticated using (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);
create index official_credential_registry_subject_idx on public.official_credential_registry (subject_type, subject_id);
create unique index beneficiaries_credential_uid_uidx on public.beneficiaries (credential_uid);
create index beneficiaries_search_idx on public.beneficiaries (full_name, document_id, code);
create index beneficiaries_family_idx on public.beneficiaries (family_id);
create index beneficiary_documents_family_idx on public.beneficiary_documents (family_id, uploaded_at desc);
create index social_history_family_idx on public.social_history (family_id, date desc);
create index deliveries_beneficiary_idx on public.deliveries (beneficiary_id, delivered_at desc);
create index if not exists deliveries_attendance_status_idx on public.deliveries (attendance_status, delivered_at);
create index if not exists deliveries_beneficiary_attendance_idx on public.deliveries (beneficiary_id, attendance_status, delivered_at);
create index inventory_low_stock_idx on public.inventory_items (stock, low_stock_threshold);
create index agenda_operativa_event_at_idx on public.agenda_operativa (event_at, status);
create index agenda_operativa_campaign_idx on public.agenda_operativa (campaign_id, event_at);
create index campanas_status_date_idx on public.campanas (status, start_date, end_date);
create index campanas_origin_idx on public.campanas (origin_type, status);
create index campana_beneficiarios_campaign_idx on public.campana_beneficiarios (campaign_id);
create index campana_productos_campaign_idx on public.campana_productos (campaign_id);
create index campana_voluntarios_campaign_idx on public.campana_voluntarios (campaign_id);
create index campana_entregas_campaign_idx on public.campana_entregas (campaign_id);
create index campana_agenda_eventos_campaign_idx on public.campana_agenda_eventos (campaign_id);
create index notificaciones_created_idx on public.notificaciones (created_at desc);
create index notificaciones_pending_idx on public.notificaciones (leida, created_at desc) where leida = false;
create index notificaciones_module_priority_idx on public.notificaciones (modulo, prioridad, created_at desc);
create index treasury_incomes_date_idx on public.treasury_incomes (income_at desc);
create index treasury_expenses_date_idx on public.treasury_expenses (expense_at desc);
create index treasury_loans_status_idx on public.treasury_loans (status, loan_at desc);
create unique index volunteers_credential_uid_uidx on public.volunteers (credential_uid);
create unique index volunteers_code_unique_idx
  on public.volunteers (
    upper(substring(
      coalesce(notes, '')
      from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'
    ))
  )
  where substring(
    coalesce(notes, '')
    from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'
  ) is not null;

-- Cierre de produccion del modulo Inventario.
-- view = consultar, create = registrar movimientos,
-- edit = crear/editar productos, delete = eliminar productos.
create or replace function public.can_app_permission(module_id text, action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
      and (
        u.role = 'Superadministrador'
        or case
          when coalesce(u.permission_matrix, '{}'::jsonb) <> '{}'::jsonb
            then coalesce((u.permission_matrix -> module_id ->> action_id)::boolean, false)
          else action_id = 'view' and u.permissions ? module_id
        end
      )
      and case
        when module_id = 'accounting' and action_id = 'delete' then u.role = 'Superadministrador'
        when module_id = 'accounting' and u.role in ('Voluntario', 'Coordinadora', 'Coordinador') then action_id = 'view'
        else true
      end
  )
$$;

create or replace function public.can_beneficiary_portal_action(action_id text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission('beneficiaries', action_id)
    or public.can_app_permission('settings', 'edit')
    or (
      action_id = 'view'
      and public.can_app_permission('deliveries', 'view')
    )
$$;

create policy "beneficiary_portal_accounts_select_by_permission"
on public.beneficiary_portal_accounts for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_accounts_insert_by_permission"
on public.beneficiary_portal_accounts for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_accounts_update_by_permission"
on public.beneficiary_portal_accounts for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_otps_access"
on public.beneficiary_portal_otps for all to authenticated
using (public.can_beneficiary_portal_action('view'))
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_notices_select_by_permission"
on public.beneficiary_portal_notices for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_notices_insert_by_permission"
on public.beneficiary_portal_notices for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_notices_update_by_permission"
on public.beneficiary_portal_notices for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_renewals_select_by_permission"
on public.beneficiary_portal_renewals for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_renewals_insert_by_permission"
on public.beneficiary_portal_renewals for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_renewals_update_by_permission"
on public.beneficiary_portal_renewals for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_profile_updates_select_by_permission"
on public.beneficiary_portal_profile_updates for select to authenticated
using (public.can_beneficiary_portal_action('view'));

create policy "beneficiary_portal_profile_updates_insert_by_permission"
on public.beneficiary_portal_profile_updates for insert to authenticated
with check (public.can_beneficiary_portal_action('create') or public.can_beneficiary_portal_action('edit'));

create policy "beneficiary_portal_profile_updates_update_by_permission"
on public.beneficiary_portal_profile_updates for update to authenticated
using (public.can_beneficiary_portal_action('edit'))
with check (public.can_beneficiary_portal_action('edit'));

create policy "portal_sessions_access_by_authenticated"
on public.portal_sessions for all to authenticated
using (
  public.is_app_admin()
  or public.can_app_permission('beneficiaries', 'view')
  or public.can_app_permission('donations', 'view')
  or public.can_app_permission('resources', 'view')
  or public.can_app_permission('settings', 'edit')
)
with check (
  public.is_app_admin()
  or public.can_app_permission('beneficiaries', 'create')
  or public.can_app_permission('donations', 'create')
  or public.can_app_permission('resources', 'create')
  or public.can_app_permission('settings', 'edit')
);

create policy "deletion_requests_select_scoped" on public.deletion_requests for select to authenticated using (public.is_system_superadmin() or requester_id = (public.current_app_user()).id or public.can_app_permission('settings', 'view') or public.can_app_permission('users', 'view'));
create policy "deletion_requests_insert_requester" on public.deletion_requests for insert to authenticated with check (not public.is_system_superadmin() and status = 'Pendiente' and requester_id = (public.current_app_user()).id);
create policy "deletion_requests_update_system_superadmin" on public.deletion_requests for update to authenticated using (public.is_system_superadmin()) with check (public.is_system_superadmin());
create policy "deletion_requests_no_delete" on public.deletion_requests for delete to authenticated using (false);
grant select, insert, update on public.deletion_requests to authenticated;
revoke delete on public.deletion_requests from authenticated;

create or replace function public.can_inventory_action(action_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (u.auth_user_id = auth.uid()
       or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
      and public.can_app_permission('inventory', action_id)
      and case
        when u.role = 'Superadministrador' then action_id in ('view', 'create', 'edit', 'delete')
        when action_id = 'delete' then false
        when u.role = 'Voluntario' then action_id = 'view'
        when u.role in ('Coordinadora', 'Coordinador') then action_id in ('view', 'create')
        else action_id in ('view', 'create', 'edit')
      end
  )
$$;

drop function if exists public.register_inventory_movement(uuid, date, text, text, numeric, text);

create or replace function public.register_inventory_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_moved_at date,
  p_responsible text,
  p_notes text
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_item public.inventory_items;
  v_movement public.inventory_movements;
  v_user_name text;
  v_can_inventory_create boolean;
  v_can_accounting_entry boolean;
begin
  select * into v_user
  from public.app_users u
  where (u.auth_user_id = auth.uid()
     or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and u.is_active = true
    and coalesce(u.status, 'Activo') = 'Activo'
  limit 1;

  if v_user.id is null then
    raise exception 'No tienes permiso para registrar movimientos de inventario';
  end if;

  if p_movement_type is null or p_movement_type not in ('Entrada', 'Salida') then
    raise exception 'Tipo de movimiento no valido';
  end if;

  v_can_inventory_create := public.can_inventory_action('create');
  v_can_accounting_entry := p_movement_type = 'Entrada' and public.can_app_permission('accounting', 'create');

  if not (v_can_inventory_create or v_can_accounting_entry) then
    raise exception 'No tienes permiso para registrar movimientos de inventario';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if v_item.id is null then
    raise exception 'El producto no existe';
  end if;

  if p_movement_type = 'Salida' and v_item.stock < p_quantity then
    raise exception 'Stock insuficiente. Disponible: % %', v_item.stock, v_item.unit;
  end if;

  update public.inventory_items
  set stock = case
    when p_movement_type = 'Entrada' then stock + p_quantity
    else stock - p_quantity
  end
  where id = p_item_id;

  v_user_name := trim(concat_ws(' ', v_user.first_name, v_user.last_name));
  if v_user_name = '' then v_user_name := v_user.email; end if;

  insert into public.inventory_movements (
    item_id,
    item_name,
    movement_type,
    quantity,
    moved_at,
    responsible,
    notes
  ) values (
    v_item.id,
    v_item.name,
    p_movement_type,
    p_quantity,
    coalesce(p_moved_at, current_date),
    coalesce(nullif(trim(p_responsible), ''), v_user_name),
    nullif(trim(p_notes), '')
  )
  returning * into v_movement;

  insert into public.audit_logs (user_name, user_email, action, happened_at)
  values (
    v_user_name,
    v_user.email,
    'Registro ' || lower(p_movement_type) || ' de inventario: ' || v_item.name,
    now()
  );

  return v_movement;
end
$$;

create or replace function public.apply_delivery_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  update public.beneficiaries
  set last_help_at = new.delivered_at
  where id = new.beneficiary_id;

  if new.inventory_item_id is not null then
    select * into v_item
    from public.inventory_items
    where id = new.inventory_item_id
    for update;

    if v_item.id is null then
      raise exception 'El producto de inventario no existe';
    end if;

    if v_item.stock < new.quantity then
      raise exception 'Stock insuficiente. Disponible: % %', v_item.stock, v_item.unit;
    end if;

    update public.inventory_items
    set stock = stock - new.quantity
    where id = new.inventory_item_id;

    insert into public.inventory_movements (
      item_id, item_name, movement_type, quantity, moved_at, responsible, notes
    ) values (
      v_item.id, v_item.name, 'Salida', new.quantity, new.delivered_at, new.responsible,
      'Salida automatica por entrega'
    );
  end if;

  return new;
end
$$;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_item_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_item_id_fkey
  foreign key (item_id) references public.inventory_items(id) on delete restrict;

drop policy if exists "authenticated_read_inventory_items" on public.inventory_items;
drop policy if exists "authenticated_write_inventory_items" on public.inventory_items;

create policy "inventory_items_select_by_permission"
on public.inventory_items for select to authenticated
using (public.can_inventory_action('view'));

create policy "inventory_items_insert_by_permission"
on public.inventory_items for insert to authenticated
with check (public.can_inventory_action('edit') and stock = 0);

create policy "inventory_items_insert_by_accounting_operation"
on public.inventory_items for insert to authenticated
with check (public.can_app_permission('accounting', 'create') and stock = 0);

create policy "inventory_items_update_by_permission"
on public.inventory_items for update to authenticated
using (public.can_inventory_action('edit'))
with check (public.can_inventory_action('edit'));

create policy "inventory_items_delete_superadmin_only"
on public.inventory_items for delete to authenticated
using (public.can_inventory_action('delete') or public.is_system_superadmin());

drop policy if exists "authenticated_read_inventory_movements" on public.inventory_movements;
drop policy if exists "authenticated_write_inventory_movements" on public.inventory_movements;

create policy "inventory_movements_select_by_permission"
on public.inventory_movements for select to authenticated
using (public.can_inventory_action('view'));

revoke insert, update on public.inventory_items from authenticated;
grant insert (
  name, category, lot, expires_at, donor, location, unit, low_stock_threshold, notes, photo_url, photo_data_url
) on public.inventory_items to authenticated;
grant update (
  name, category, lot, expires_at, donor, location, unit, low_stock_threshold, notes, photo_url, photo_data_url
) on public.inventory_items to authenticated;
grant select, delete on public.inventory_items to authenticated;

revoke insert, update, delete on public.inventory_movements from authenticated;
grant select on public.inventory_movements to authenticated;

create index inventory_expiry_idx
  on public.inventory_items (expires_at)
  where expires_at is not null;

create index inventory_movements_item_date_idx
  on public.inventory_movements (item_id, moved_at desc, created_at desc);

revoke all on function public.can_inventory_action(text) from public;
revoke all on function public.register_inventory_movement(uuid, text, numeric, date, text, text) from public;
grant execute on function public.can_app_permission(text, text) to authenticated;
grant execute on function public.can_beneficiary_portal_action(text) to authenticated;
grant execute on function public.can_inventory_action(text) to authenticated;
grant execute on function public.register_inventory_movement(uuid, text, numeric, date, text, text) to authenticated;

notify pgrst, 'reload schema';

grant select, insert, update on public.beneficiary_portal_accounts to authenticated;
grant select, insert, update on public.beneficiary_portal_otps to authenticated;
grant select, insert, update on public.beneficiary_portal_notices to authenticated;
grant select, insert, update on public.beneficiary_portal_renewals to authenticated;
grant select, insert, update on public.beneficiary_portal_profile_updates to authenticated;
grant select, insert, update on public.portal_sessions to authenticated;
revoke all on table public.beneficiary_assistant_messages from anon;
revoke all on table public.beneficiary_assistant_messages from authenticated;
revoke delete on public.beneficiary_portal_accounts from authenticated;
revoke delete on public.beneficiary_portal_otps from authenticated;
revoke delete on public.beneficiary_portal_notices from authenticated;
revoke delete on public.beneficiary_portal_renewals from authenticated;
revoke delete on public.beneficiary_portal_profile_updates from authenticated;
revoke delete on public.portal_sessions from authenticated;

create or replace function public.is_app_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users u
    where (
        u.auth_user_id = auth.uid()
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and u.role = 'Superadministrador'
      and u.is_active = true
      and coalesce(u.status, 'Activo') = 'Activo'
  )
$$;

create or replace function public.cancel_delivery(p_delivery_id uuid, p_reason text)
returns public.deliveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
  v_delivery public.deliveries;
  v_item public.inventory_items;
  v_user_name text;
  v_reason text;
begin
  v_reason := trim(coalesce(p_reason, ''));

  select *
  into v_user
  from public.app_users u
  where (
      u.auth_user_id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and u.is_active = true
    and coalesce(u.status, 'Activo') = 'Activo'
  limit 1;

  if v_user.id is null then
    raise exception 'Usuario no autorizado';
  end if;

  if not (
    public.can_app_permission('deliveries', 'edit')
    or public.can_app_permission('deliveries', 'create')
    or v_user.role = 'Superadministrador'
  ) then
    raise exception 'No tienes permiso para anular entregas';
  end if;

  if length(v_reason) < 5 then
    raise exception 'El motivo de anulacion debe tener al menos 5 caracteres';
  end if;

  select *
  into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'La entrega no existe';
  end if;

  if v_delivery.status = 'Anulada' then
    raise exception 'La entrega ya esta anulada';
  end if;

  v_user_name := trim(concat_ws(' ', v_user.first_name, v_user.last_name));
  if v_user_name = '' then
    v_user_name := v_user.email;
  end if;

  update public.deliveries
  set status = 'Anulada',
      cancelled_at = now(),
      cancelled_by = v_user.id,
      cancelled_by_name = v_user_name,
      cancellation_reason = v_reason
  where id = p_delivery_id;

  if v_delivery.inventory_item_id is not null then
    select *
    into v_item
    from public.inventory_items
    where id = v_delivery.inventory_item_id
    for update;

    if v_item.id is not null then
      update public.inventory_items
      set stock = stock + v_delivery.quantity
      where id = v_delivery.inventory_item_id;

      insert into public.inventory_movements (
        item_id,
        item_name,
        movement_type,
        quantity,
        moved_at,
        responsible,
        notes
      )
      values (
        v_item.id,
        v_item.name,
        'Entrada',
        v_delivery.quantity,
        current_date,
        v_user_name,
        'Reversion por anulacion de entrega: ' || v_reason
      );
    end if;
  end if;

  update public.social_value_events
  set status = 'voided',
      voided_at = now(),
      void_reason = v_reason,
      updated_at = now()
  where status = 'active'
    and event_type = 'delivery'
    and (
      (source_module = 'deliveries' and source_record_id = v_delivery.id)
      or (
        source_module = 'beneficiaries'
        and source_record_id = v_delivery.beneficiary_id
        and social_value_at = v_delivery.delivered_at
      )
    );

  update public.beneficiaries
  set last_help_at = (
    select max(d.delivered_at)
    from public.deliveries d
    where d.beneficiary_id = v_delivery.beneficiary_id
      and d.status = 'Activa'
  )
  where id = v_delivery.beneficiary_id;

  insert into public.audit_logs (
    user_name,
    user_email,
    action,
    happened_at
  )
  values (
    v_user_name,
    v_user.email,
    'Anulo entrega ' || coalesce(v_delivery.receipt_number, v_delivery.id::text) || '. Motivo: ' || v_reason,
    now()
  );

  select *
  into v_delivery
  from public.deliveries
  where id = p_delivery_id;

  return v_delivery;
end;
$$;

drop policy if exists "deliveries_update_by_permission" on public.deliveries;
drop policy if exists "deliveries_update_superadmin_only" on public.deliveries;
drop policy if exists "authenticated_write_deliveries" on public.deliveries;
drop policy if exists "deliveries_insert_by_permission" on public.deliveries;
create policy "deliveries_insert_by_permission"
on public.deliveries for insert to authenticated
with check (public.can_app_permission('deliveries', 'create'));

create policy "deliveries_update_superadmin_only"
on public.deliveries for update to authenticated
using (public.is_app_superadmin())
with check (public.is_app_superadmin());

drop policy if exists "deliveries_delete_by_permission" on public.deliveries;
drop policy if exists "deliveries_delete_superadmin_only" on public.deliveries;
drop policy if exists "authenticated_write_deliveries" on public.deliveries;
create policy "deliveries_delete_superadmin_only"
on public.deliveries for delete to authenticated
using (public.is_app_superadmin() or public.is_system_superadmin());

revoke all on function public.cancel_delivery(uuid, text) from public;
revoke all on function public.is_app_superadmin() from public;
grant execute on function public.cancel_delivery(uuid, text) to authenticated;
grant execute on function public.is_app_superadmin() to authenticated;

alter table public.donations add column if not exists donor_id uuid;
alter table public.donations add column if not exists collaborator_id uuid;
alter table public.donations add column if not exists donor_email text;
alter table public.donations add column if not exists status text default 'Registrada';
alter table public.donations add column if not exists state text default 'Registrada';
alter table public.donations add column if not exists payment_method text;
alter table public.donations add column if not exists amount numeric(12,2) default 0;
alter table public.donations add column if not exists quantity text;
alter table public.donations add column if not exists campaign_id uuid;
alter table public.donations add column if not exists frequency text;
alter table public.donations add column if not exists stripe_session_id text;
alter table public.donations add column if not exists stripe_payment_intent_id text;
alter table public.donations add column if not exists stripe_customer_id text;
alter table public.donations add column if not exists pickup_requested boolean default false;
alter table public.donations add column if not exists proposed_pickup_at date;
alter table public.donations add column if not exists updated_at timestamptz not null default now();

create table if not exists public.collaborators (
  id uuid primary key default gen_random_uuid(),
  code text,
  credential_uid text not null default public.next_official_credential_uid('collaborator'),
  type text not null default 'Empresa',
  name text not null,
  tax_id text,
  contact_name text,
  email text not null unique,
  access_email text,
  phone text,
  address text,
  logo_path text,
  photo_url text,
  photo_data_url text,
  status text not null default 'Activo',
  is_active boolean not null default true,
  portal_status text not null default 'Activo',
  last_otp_sent_at timestamptz,
  last_access_at timestamptz,
  portal_activated_at timestamptz,
  portal_deactivated_at timestamptz,
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
create unique index if not exists idx_collaborators_code_unique on public.collaborators(code) where code is not null and code <> '';
create unique index if not exists collaborators_credential_uid_uidx on public.collaborators(credential_uid);
create index if not exists idx_collaborators_access_email on public.collaborators(lower(access_email));
create index if not exists idx_collaborators_type_status on public.collaborators(type, status);
create index if not exists idx_collaborator_portal_otps_collaborator on public.collaborator_portal_otps(collaborator_id, created_at desc);
create index if not exists idx_collaborator_profile_updates_collaborator on public.collaborator_portal_profile_updates(collaborator_id, created_at desc);
create index if not exists idx_collaborator_requests_collaborator on public.collaborator_portal_requests(collaborator_id, created_at desc);
create index if not exists idx_collaborator_certificates_collaborator on public.collaborator_certificates(collaborator_id, issued_at desc);
create index if not exists idx_donations_collaborator_id on public.donations(collaborator_id);
create index if not exists idx_recursos_collaborator_id on public.recursos(collaborator_id);
create index if not exists social_resources_category_idx on public.social_resources(category);
create index if not exists social_resources_status_idx on public.social_resources(status);
create index if not exists social_resources_portal_publication_idx on public.social_resources(publish_in_beneficiary_portal, visible_to_all_beneficiaries, status, deadline_at);
create index if not exists social_resources_portal_visibility_idx on public.social_resources(portal_visibility_scope, status, deadline_at);
create index if not exists social_resources_deadline_idx on public.social_resources(deadline_at);
create index if not exists social_resources_municipality_idx on public.social_resources(municipality);
create index if not exists beneficiary_social_resources_beneficiary_idx on public.beneficiary_social_resources(beneficiary_id);
create index if not exists beneficiary_social_resources_resource_idx on public.beneficiary_social_resources(resource_id);
create index if not exists social_resource_portal_beneficiaries_beneficiary_idx on public.social_resource_portal_beneficiaries(beneficiary_id);
create index if not exists social_resource_portal_beneficiaries_resource_idx on public.social_resource_portal_beneficiaries(resource_id);
create index if not exists social_resource_followups_link_idx on public.social_resource_followups(beneficiary_resource_id);
create index if not exists social_resource_followups_beneficiary_idx on public.social_resource_followups(beneficiary_id);
create index if not exists social_resource_history_resource_idx on public.social_resource_history(resource_id, created_at desc);
create index if not exists social_resource_sources_status_idx on public.social_resource_sources(status);
create index if not exists social_resource_sources_next_check_idx on public.social_resource_sources(status, last_checked_at);
create index if not exists social_resource_sources_due_check_idx on public.social_resource_sources(status, next_check_at, last_checked_at);
create index if not exists social_resource_detections_status_idx on public.social_resource_detections(status, detected_at desc);
create index if not exists social_resource_detections_source_idx on public.social_resource_detections(source_id, detected_at desc);
create index if not exists social_resource_detections_resource_idx on public.social_resource_detections(resource_id, detected_at desc);
create unique index if not exists social_resource_detections_dedupe_key_uidx on public.social_resource_detections(dedupe_key) where dedupe_key <> '';

create trigger collaborators_updated_at before update on public.collaborators for each row execute function public.set_updated_at();
create trigger collaborators_set_official_credential_uid before insert or update of credential_uid on public.collaborators for each row execute function public.set_official_credential_uid();
create trigger collaborators_register_official_credential_uid after insert on public.collaborators for each row execute function public.register_official_credential_uid();
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
    or public.can_app_permission('collaborators', action_id)
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

create policy "collaborators_select_by_permission" on public.collaborators
for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborators_insert_by_permission" on public.collaborators
for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborators_update_by_permission" on public.collaborators
for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

create policy "collaborator_portal_otps_select_by_permission" on public.collaborator_portal_otps
for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_portal_otps_insert_by_permission" on public.collaborator_portal_otps
for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_portal_otps_update_by_permission" on public.collaborator_portal_otps
for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

create policy "collaborator_profile_updates_select_by_permission" on public.collaborator_portal_profile_updates
for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_profile_updates_insert_by_permission" on public.collaborator_portal_profile_updates
for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_profile_updates_update_by_permission" on public.collaborator_portal_profile_updates
for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

create policy "collaborator_requests_select_by_permission" on public.collaborator_portal_requests
for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_requests_insert_by_permission" on public.collaborator_portal_requests
for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_requests_update_by_permission" on public.collaborator_portal_requests
for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

create policy "collaborator_certificates_select_by_permission" on public.collaborator_certificates
for select to authenticated using (public.can_collaborator_portal_action('view'));
create policy "collaborator_certificates_insert_by_permission" on public.collaborator_certificates
for insert to authenticated with check (public.can_collaborator_portal_action('create'));
create policy "collaborator_certificates_update_by_permission" on public.collaborator_certificates
for update to authenticated using (public.can_collaborator_portal_action('edit')) with check (public.can_collaborator_portal_action('edit'));

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

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  email text not null unique,
  collaborator_id uuid references public.collaborators(id) on delete set null,
  phone text,
  access_email text,
  address text,
  photo_url text,
  photo_data_url text,
  type text not null default 'Particular',
  status text not null default 'Activo',
  is_active boolean not null default true,
  portal_status text not null default 'Activo',
  last_otp_sent_at timestamptz,
  last_access_at timestamptz,
  portal_activated_at timestamptz,
  portal_deactivated_at timestamptz,
  impact jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donor_portal_otps (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete cascade,
  email text not null,
  code text not null,
  action text not null default 'access',
  status text not null default 'pending',
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donor_portal_profile_updates (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete cascade,
  requested_changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  notes text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donor_certificates (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete cascade,
  title text not null,
  certificate_type text not null default 'individual',
  status text not null default 'Disponible',
  issued_at date,
  file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_donors_email on public.donors(email);
create unique index if not exists idx_donors_code_unique on public.donors(code) where code is not null and code <> '';
create index if not exists idx_donors_access_email on public.donors(lower(access_email));
create index if not exists idx_donors_collaborator_id on public.donors(collaborator_id);
create index if not exists idx_donors_type_status on public.donors(type, status);
create index if not exists idx_donor_portal_otps_donor on public.donor_portal_otps(donor_id, created_at desc);
create index if not exists idx_donor_profile_updates_donor on public.donor_portal_profile_updates(donor_id, created_at desc);
create index if not exists idx_donor_certificates_donor on public.donor_certificates(donor_id, issued_at desc);
create index if not exists idx_donations_donor_id on public.donations(donor_id);
create index if not exists idx_donations_donor_email on public.donations(donor_email);
create unique index if not exists idx_donations_stripe_session_id_unique on public.donations(stripe_session_id) where stripe_session_id is not null;
create index if not exists idx_donations_stripe_payment_intent on public.donations(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists idx_donations_stripe_customer on public.donations(stripe_customer_id) where stripe_customer_id is not null;

drop trigger if exists donors_updated_at on public.donors;
create trigger donors_updated_at before update on public.donors for each row execute function public.set_updated_at();

alter table public.donors enable row level security;
alter table public.donor_portal_otps enable row level security;
alter table public.donor_portal_profile_updates enable row level security;
alter table public.donor_certificates enable row level security;

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

drop policy if exists "authenticated_read_donors" on public.donors;
drop policy if exists "authenticated_write_donors" on public.donors;
drop policy if exists "authenticated_read_donor_portal_otps" on public.donor_portal_otps;
drop policy if exists "authenticated_write_donor_portal_otps" on public.donor_portal_otps;
drop policy if exists "authenticated_read_donor_profile_updates" on public.donor_portal_profile_updates;
drop policy if exists "authenticated_write_donor_profile_updates" on public.donor_portal_profile_updates;
drop policy if exists "authenticated_read_donor_certificates" on public.donor_certificates;
drop policy if exists "authenticated_write_donor_certificates" on public.donor_certificates;

create policy "authenticated_read_donors" on public.donors for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donors" on public.donors for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_portal_otps" on public.donor_portal_otps for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_portal_otps" on public.donor_portal_otps for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_profile_updates" on public.donor_portal_profile_updates for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_profile_updates" on public.donor_portal_profile_updates for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
create policy "authenticated_read_donor_certificates" on public.donor_certificates for select to authenticated using (public.can_donor_portal_action('view'));
create policy "authenticated_write_donor_certificates" on public.donor_certificates for all to authenticated using (public.can_donor_portal_action('edit')) with check (public.can_donor_portal_action('create') or public.can_donor_portal_action('edit'));
grant execute on function public.can_donor_portal_action(text) to authenticated;
grant select, insert, update on public.donors to authenticated;
grant select, insert, update on public.donor_portal_otps to authenticated;
grant select, insert, update on public.donor_portal_profile_updates to authenticated;
grant select, insert, update on public.donor_certificates to authenticated;
revoke delete on public.donors from authenticated;
revoke delete on public.donor_portal_otps from authenticated;
revoke delete on public.donor_portal_profile_updates from authenticated;
revoke delete on public.donor_certificates from authenticated;

-- Sistema oficial de credenciales ALTHEMON v1.0.
-- Automatización, seguridad, historial, impresión y verificación pública.

alter table public.official_credential_registry
  add column if not exists status text not null default 'active',
  add column if not exists status_reason text not null default '',
  add column if not exists expires_at date,
  add column if not exists qr_version integer not null default 1,
  add column if not exists last_printed_at timestamptz,
  add column if not exists last_printed_by uuid references public.app_users(id) on delete set null,
  add column if not exists print_count integer not null default 0,
  add column if not exists last_validated_at timestamptz,
  add column if not exists validation_count integer not null default 0,
  add column if not exists suspended_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
declare
  check_name text;
begin
  select conname
  into check_name
  from pg_constraint
  where conrelid = 'public.official_credential_registry'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%subject_type%'
  limit 1;

  if check_name is not null then
    execute format('alter table public.official_credential_registry drop constraint %I', check_name);
  end if;
end $$;

alter table public.official_credential_registry
  add constraint official_credential_registry_subject_type_check
  check (subject_type in ('beneficiary', 'volunteer', 'collaborator', 'donor', 'user'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'official_credential_registry_status_check'
      and conrelid = 'public.official_credential_registry'::regclass
  ) then
    alter table public.official_credential_registry
      add constraint official_credential_registry_status_check
      check (status in ('active', 'suspended', 'revoked', 'expired'));
  end if;
end $$;

alter table public.donors add column if not exists credential_uid text;
alter table public.app_users add column if not exists credential_uid text;
alter table public.volunteers add column if not exists photo_data_url text;

create or replace function public.next_official_credential_uid(p_subject_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_type text := lower(trim(coalesce(p_subject_type, '')));
  next_value bigint;
  candidate text;
begin
  if normalized_type not in ('beneficiary', 'volunteer', 'collaborator', 'donor', 'user') then
    raise exception 'Tipo de credencial no soportado: %', p_subject_type;
  end if;

  loop
    next_value := nextval('public.official_credential_uid_sequence'::regclass);
    candidate := 'PE-' || to_char(current_date, 'YYYY') || '-' || lpad(next_value::text, 8, '0');

    exit when not exists (select 1 from public.official_credential_registry where credential_uid = candidate)
      and not exists (select 1 from public.beneficiaries where credential_uid = candidate)
      and not exists (select 1 from public.volunteers where credential_uid = candidate)
      and not exists (select 1 from public.collaborators where credential_uid = candidate)
      and not exists (select 1 from public.donors where credential_uid = candidate)
      and not exists (select 1 from public.app_users where credential_uid = candidate);
  end loop;

  return candidate;
end;
$$;

alter table public.beneficiaries alter column credential_uid set default public.next_official_credential_uid('beneficiary');
alter table public.volunteers alter column credential_uid set default public.next_official_credential_uid('volunteer');
alter table public.collaborators alter column credential_uid set default public.next_official_credential_uid('collaborator');
alter table public.donors alter column credential_uid set default public.next_official_credential_uid('donor');
alter table public.app_users alter column credential_uid set default public.next_official_credential_uid('user');

do $$
declare
  item record;
begin
  for item in select id from public.donors where nullif(trim(coalesce(credential_uid, '')), '') is null loop
    update public.donors
    set credential_uid = public.next_official_credential_uid('donor')
    where id = item.id;
  end loop;

  for item in select id from public.app_users where nullif(trim(coalesce(credential_uid, '')), '') is null loop
    update public.app_users
    set credential_uid = public.next_official_credential_uid('user')
    where id = item.id;
  end loop;
end;
$$;

alter table public.donors alter column credential_uid set not null;
alter table public.app_users alter column credential_uid set not null;

create unique index if not exists donors_credential_uid_uidx on public.donors (credential_uid);
create unique index if not exists app_users_credential_uid_uidx on public.app_users (credential_uid);
create index if not exists official_credential_registry_status_idx on public.official_credential_registry (status, expires_at);

create table if not exists public.official_credential_events (
  id uuid primary key default gen_random_uuid(),
  credential_uid text not null references public.official_credential_registry(credential_uid) on delete cascade,
  subject_type text not null check (subject_type in ('beneficiary', 'volunteer', 'collaborator', 'donor', 'user')),
  subject_id uuid not null,
  event_type text not null,
  status_from text,
  status_to text,
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text not null default '',
  actor_email text not null default '',
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists official_credential_events_uid_idx on public.official_credential_events (credential_uid, created_at desc);
create index if not exists official_credential_events_subject_idx on public.official_credential_events (subject_type, subject_id, created_at desc);

create or replace function public.official_credential_subject_type(table_name text)
returns text
language plpgsql
immutable
as $$
begin
  case table_name
    when 'beneficiaries' then
      return 'beneficiary';
    when 'volunteers' then
      return 'volunteer';
    when 'collaborators' then
      return 'collaborator';
    when 'donors' then
      return 'donor';
    when 'app_users' then
      return 'user';
    else
      raise exception 'Tabla sin tipo de credencial oficial: %', table_name;
  end case;
end;
$$;

create or replace function public.official_credential_module(p_subject_type text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_subject_type, '')))
    when 'beneficiary' then 'beneficiaries'
    when 'volunteer' then 'volunteers'
    when 'collaborator' then 'collaborators'
    when 'donor' then 'donors'
    when 'user' then 'users'
    else ''
  end
$$;

create or replace function public.can_official_credential_action(p_subject_type text, p_action_id text default 'generate-credential')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or public.can_app_permission(
      public.official_credential_module(p_subject_type),
      case
        when p_action_id in ('view', 'print', 'download_pdf') then 'view'
        else 'edit'
      end
    )
$$;

create or replace function public.register_official_credential_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_type text := public.official_credential_subject_type(tg_table_name);
begin
  insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
  values (new.credential_uid, subject_type, new.id)
  on conflict (credential_uid) do update
    set subject_type = excluded.subject_type,
        subject_id = excluded.subject_id,
        updated_at = now();

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_to,
    actor_name,
    reason,
    metadata
  )
  values (
    new.credential_uid,
    subject_type,
    new.id,
    'created',
    'active',
    'Sistema',
    'Credencial oficial creada automaticamente.',
    '{}'::jsonb
  )
  on conflict do nothing;

  return new;
exception
  when unique_violation then
    raise exception 'El ID de credencial % ya existe y no puede duplicarse.', new.credential_uid;
end;
$$;

drop trigger if exists donors_set_official_credential_uid on public.donors;
create trigger donors_set_official_credential_uid
before insert or update of credential_uid on public.donors
for each row execute function public.set_official_credential_uid();

drop trigger if exists app_users_set_official_credential_uid on public.app_users;
create trigger app_users_set_official_credential_uid
before insert or update of credential_uid on public.app_users
for each row execute function public.set_official_credential_uid();

drop trigger if exists donors_register_official_credential_uid on public.donors;
create trigger donors_register_official_credential_uid
after insert on public.donors
for each row execute function public.register_official_credential_uid();

drop trigger if exists app_users_register_official_credential_uid on public.app_users;
create trigger app_users_register_official_credential_uid
after insert on public.app_users
for each row execute function public.register_official_credential_uid();

insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
select credential_uid, 'donor', id from public.donors
where credential_uid is not null
on conflict (credential_uid) do update
set subject_type = excluded.subject_type,
    subject_id = excluded.subject_id,
    updated_at = now();

insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
select credential_uid, 'user', id from public.app_users
where credential_uid is not null
on conflict (credential_uid) do update
set subject_type = excluded.subject_type,
    subject_id = excluded.subject_id,
    updated_at = now();

insert into public.official_credential_events (
  credential_uid,
  subject_type,
  subject_id,
  event_type,
  status_to,
  actor_name,
  reason
)
select registry.credential_uid, registry.subject_type, registry.subject_id, 'created', registry.status, 'Sistema', 'Credencial oficial registrada.'
from public.official_credential_registry registry
where not exists (
  select 1
  from public.official_credential_events events
  where events.credential_uid = registry.credential_uid
    and events.event_type = 'created'
);

create or replace function public.official_credential_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_status, '')))
    when 'active' then 'Activa'
    when 'suspended' then 'Suspendida'
    when 'revoked' then 'Revocada'
    when 'expired' then 'Caducada'
    else 'Desconocida'
  end
$$;

create or replace function public.manage_official_credential(
  p_credential_uid text,
  p_action text,
  p_reason text default ''
)
returns public.official_credential_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  actor public.app_users%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  previous_status text;
  next_status text;
  now_value timestamptz := now();
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''))
  for update;

  if not found then
    raise exception 'La credencial oficial no existe.';
  end if;

  if not public.can_official_credential_action(target.subject_type, normalized_action) then
    raise exception 'No tienes permiso para gestionar esta credencial.';
  end if;

  select *
  into actor
  from public.app_users
  where (auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and is_active = true
  order by created_at asc
  limit 1;

  previous_status := target.status;
  next_status := target.status;

  if normalized_action = 'suspend' then
    next_status := 'suspended';
    update public.official_credential_registry
    set status = next_status,
        status_reason = trim(coalesce(p_reason, '')),
        suspended_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'revoke' then
    next_status := 'revoked';
    update public.official_credential_registry
    set status = next_status,
        status_reason = trim(coalesce(p_reason, '')),
        revoked_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'reactivate' then
    next_status := 'active';
    update public.official_credential_registry
    set status = next_status,
        status_reason = '',
        suspended_at = null,
        revoked_at = null,
        expired_at = null,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'expire' then
    next_status := 'expired';
    update public.official_credential_registry
    set status = next_status,
        status_reason = trim(coalesce(p_reason, '')),
        expires_at = coalesce(expires_at, current_date),
        expired_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'regenerate_qr' then
    raise exception 'Para generar un nuevo QR debe sustituirse la credencial y emitirse un nuevo ID.';
  elsif normalized_action in ('print', 'reprint') then
    update public.official_credential_registry
    set print_count = print_count + 1,
        last_printed_at = now_value,
        last_printed_by = actor.id,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'download_pdf' then
    update public.official_credential_registry
    set updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  else
    raise exception 'Accion de credencial no soportada: %', p_action;
  end if;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_from,
    status_to,
    actor_id,
    actor_name,
    actor_email,
    reason,
    metadata
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    normalized_action,
    previous_status,
    next_status,
    actor.id,
    coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
    coalesce(actor.email, ''),
    trim(coalesce(p_reason, '')),
    jsonb_build_object('qr_version', target.qr_version, 'print_count', target.print_count)
  );

  return target;
end;
$$;

drop function if exists public.verify_official_credential(text);
drop function if exists public.verify_official_credential(text, integer);

create or replace function public.verify_official_credential(p_credential_uid text, p_qr_version integer default null)
returns table (
  credential_uid text,
  subject_type text,
  subject_id uuid,
  display_name text,
  credential_code text,
  role_label text,
  status text,
  status_label text,
  issued_at date,
  expires_at date,
  photo_url text,
  photo_data_url text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  effective_status text;
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''));

  if not found then
    return;
  end if;

  if p_qr_version is not null and p_qr_version <> target.qr_version then
    insert into public.official_credential_events (
      credential_uid,
      subject_type,
      subject_id,
      event_type,
      status_to,
      actor_name,
      reason,
      metadata
    )
    values (
      target.credential_uid,
      target.subject_type,
      target.subject_id,
      'validation_rejected',
      target.status,
      'Verificación pública',
      'QR obsoleto o no vigente.',
      jsonb_build_object('requested_qr_version', p_qr_version, 'current_qr_version', target.qr_version)
    );
    return;
  end if;

  effective_status := case
    when target.expires_at is not null and target.expires_at < current_date then 'expired'
    else target.status
  end;

  update public.official_credential_registry
  set last_validated_at = now(),
      validation_count = validation_count + 1,
      updated_at = now()
  where official_credential_registry.credential_uid = target.credential_uid;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_to,
    actor_name,
    reason
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    'validated_public',
    effective_status,
    'Verificación pública',
    'Consulta pública de validez de credencial.'
  );

  if target.subject_type = 'beneficiary' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           b.full_name,
           b.code,
           'BENEFICIARIO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.issued_at::date,
           target.expires_at,
           b.photo_url,
           b.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.beneficiaries b
    where b.id = target.subject_id;
  elsif target.subject_type = 'volunteer' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           v.full_name,
           coalesce(substring(coalesce(v.notes, '') from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'), target.credential_uid),
           'VOLUNTARIO ACREDITADO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.issued_at::date,
           target.expires_at,
           null::text,
           v.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.volunteers v
    where v.id = target.subject_id;
  elsif target.subject_type = 'collaborator' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           c.name,
           coalesce(c.code, target.credential_uid),
           'COLABORADOR',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.issued_at::date,
           target.expires_at,
           c.photo_url,
           c.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.collaborators c
    where c.id = target.subject_id;
  elsif target.subject_type = 'donor' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           d.name,
           coalesce(d.code, target.credential_uid),
           'DONANTE',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.issued_at::date,
           target.expires_at,
           d.photo_url,
           d.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.donors d
    where d.id = target.subject_id;
  elsif target.subject_type = 'user' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           trim(u.first_name || ' ' || coalesce(u.last_name, '')),
           target.credential_uid,
           upper(coalesce(nullif(u.position, ''), 'USUARIO DEL ERP')),
           effective_status,
           public.official_credential_status_label(effective_status),
           target.issued_at::date,
           target.expires_at,
           u.profile_photo,
           u.profile_photo,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.app_users u
    where u.id = target.subject_id;
  end if;
end;
$$;

alter table public.official_credential_events enable row level security;
alter table public.official_credential_registry enable row level security;

drop policy if exists "official_credential_registry_select_authenticated" on public.official_credential_registry;
drop policy if exists "official_credential_registry_update_by_permission" on public.official_credential_registry;
drop policy if exists "official_credential_events_select_authenticated" on public.official_credential_events;
drop policy if exists "official_credential_events_insert_by_permission" on public.official_credential_events;

create policy "official_credential_registry_select_authenticated" on public.official_credential_registry
for select to authenticated using (true);

create policy "official_credential_registry_update_by_permission" on public.official_credential_registry
for update to authenticated
using (public.can_official_credential_action(subject_type, 'edit'))
with check (public.can_official_credential_action(subject_type, 'edit'));

create policy "official_credential_events_select_authenticated" on public.official_credential_events
for select to authenticated using (true);

create policy "official_credential_events_insert_by_permission" on public.official_credential_events
for insert to authenticated
with check (public.can_official_credential_action(subject_type, event_type));

grant select, update on public.official_credential_registry to authenticated;
grant select, insert on public.official_credential_events to authenticated;
grant execute on function public.next_official_credential_uid(text) to authenticated;
grant execute on function public.manage_official_credential(text, text, text) to authenticated;
grant execute on function public.verify_official_credential(text, integer) to anon, authenticated;
grant execute on function public.official_credential_status_label(text) to anon, authenticated;

-- Ciclo de vida oficial de credenciales ALTHEMON v1.0.
-- Permite conservar historial completo y garantiza una sola credencial activa por persona.

alter table public.official_credential_registry
  add column if not exists replaces_credential_uid text references public.official_credential_registry(credential_uid) on delete set null,
  add column if not exists replaced_by_credential_uid text references public.official_credential_registry(credential_uid) on delete set null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'official_credential_registry'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) key(attnum)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
      ) = array['subject_id', 'subject_type']
  loop
    execute format('alter table public.official_credential_registry drop constraint %I', constraint_record.conname);
  end loop;
end $$;

drop index if exists public.official_credential_registry_subject_unique_idx;
create unique index if not exists official_credential_registry_active_subject_uidx
on public.official_credential_registry(subject_type, subject_id)
where status = 'active';

create or replace function public.set_official_credential_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_type text := public.official_credential_subject_type(tg_table_name);
  rotation_allowed boolean := lower(coalesce(current_setting('app.allow_credential_uid_rotation', true), 'off')) = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.credential_uid is distinct from old.credential_uid and not rotation_allowed then
      raise exception 'El ID de credencial oficial es inmutable y solo puede sustituirse desde el ciclo oficial de credenciales.';
    end if;
    return new;
  end if;

  if nullif(trim(coalesce(new.credential_uid, '')), '') is null then
    new.credential_uid := public.next_official_credential_uid(subject_type);
  end if;

  return new;
end;
$$;

create or replace function public.manage_official_credential(
  p_credential_uid text,
  p_action text,
  p_reason text default ''
)
returns public.official_credential_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  actor public.app_users%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  clean_reason text := trim(coalesce(p_reason, ''));
  previous_status text;
  next_status text;
  now_value timestamptz := now();
  new_credential_uid text;
  new_credential public.official_credential_registry%rowtype;
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''))
  for update;

  if not found then
    raise exception 'La credencial oficial no existe.';
  end if;

  if not public.can_official_credential_action(target.subject_type, normalized_action) then
    raise exception 'No tienes permiso para gestionar esta credencial.';
  end if;

  select *
  into actor
  from public.app_users
  where (auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and is_active = true
  order by created_at asc
  limit 1;

  previous_status := target.status;
  next_status := target.status;

  if normalized_action = 'replace' then
    if target.status = 'revoked' then
      raise exception 'Una credencial revocada no puede sustituirse de nuevo.';
    end if;

    clean_reason := coalesce(nullif(clean_reason, ''), 'Sustitución de credencial.');
    new_credential_uid := public.next_official_credential_uid(target.subject_type);

    update public.official_credential_registry
    set status = 'revoked',
        status_reason = clean_reason,
        revoked_at = now_value,
        replaced_by_credential_uid = new_credential_uid,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;

    insert into public.official_credential_registry (
      credential_uid,
      subject_type,
      subject_id,
      status,
      status_reason,
      issued_at,
      qr_version,
      replaces_credential_uid,
      metadata,
      created_at,
      updated_at
    )
    values (
      new_credential_uid,
      target.subject_type,
      target.subject_id,
      'active',
      '',
      now_value,
      1,
      target.credential_uid,
      jsonb_build_object('replacement_reason', clean_reason),
      now_value,
      now_value
    )
    returning * into new_credential;

    perform set_config('app.allow_credential_uid_rotation', 'on', true);

    if target.subject_type = 'beneficiary' then
      update public.beneficiaries
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'volunteer' then
      update public.volunteers
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'collaborator' then
      update public.collaborators
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'donor' then
      update public.donors
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'user' then
      update public.app_users
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    end if;

    if not found then
      raise exception 'La credencial seleccionada ya no es la credencial activa de esta persona.';
    end if;

    insert into public.official_credential_events (
      credential_uid,
      subject_type,
      subject_id,
      event_type,
      status_from,
      status_to,
      actor_id,
      actor_name,
      actor_email,
      reason,
      metadata
    )
    values (
      target.credential_uid,
      target.subject_type,
      target.subject_id,
      'replaced',
      previous_status,
      'revoked',
      actor.id,
      coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
      coalesce(actor.email, ''),
      clean_reason,
      jsonb_build_object('new_credential_uid', new_credential_uid)
    ), (
      new_credential_uid,
      target.subject_type,
      target.subject_id,
      'created',
      null,
      'active',
      actor.id,
      coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
      coalesce(actor.email, ''),
      'Nueva credencial emitida por sustitución.',
      jsonb_build_object('previous_credential_uid', target.credential_uid, 'replacement_reason', clean_reason)
    );

    return new_credential;
  end if;

  if normalized_action = 'suspend' then
    next_status := 'suspended';
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        suspended_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'revoke' then
    next_status := 'revoked';
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        revoked_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'reactivate' then
    if target.status = 'revoked' then
      raise exception 'Una credencial revocada no puede reactivarse. Debe emitirse una nueva credencial.';
    end if;
    next_status := 'active';
    update public.official_credential_registry
    set status = next_status,
        status_reason = '',
        suspended_at = null,
        expired_at = null,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'expire' then
    next_status := 'expired';
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        expires_at = coalesce(expires_at, current_date),
        expired_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'regenerate_qr' then
    raise exception 'Para generar un nuevo QR debe sustituirse la credencial y emitirse un nuevo ID.';
  elsif normalized_action in ('print', 'reprint') then
    update public.official_credential_registry
    set print_count = print_count + 1,
        last_printed_at = now_value,
        last_printed_by = actor.id,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'download_pdf' then
    update public.official_credential_registry
    set updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  else
    raise exception 'Acción de credencial no soportada: %', p_action;
  end if;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_from,
    status_to,
    actor_id,
    actor_name,
    actor_email,
    reason,
    metadata
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    normalized_action,
    previous_status,
    next_status,
    actor.id,
    coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
    coalesce(actor.email, ''),
    clean_reason,
    jsonb_build_object('qr_version', target.qr_version, 'print_count', target.print_count)
  );

  return target;
end;
$$;

drop function if exists public.verify_official_credential(text);
drop function if exists public.verify_official_credential(text, integer);

create or replace function public.verify_official_credential(p_credential_uid text, p_qr_version integer default null)
returns table (
  credential_uid text,
  subject_type text,
  subject_id uuid,
  display_name text,
  credential_code text,
  role_label text,
  status text,
  status_label text,
  status_reason text,
  issued_at date,
  expires_at date,
  revoked_at timestamptz,
  photo_url text,
  photo_data_url text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  effective_status text;
  invalid_reason text;
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''));

  if not found then
    return;
  end if;

  if p_qr_version is not null and p_qr_version <> target.qr_version then
    invalid_reason := 'QR obsoleto o no vigente.';

    insert into public.official_credential_events (
      credential_uid,
      subject_type,
      subject_id,
      event_type,
      status_to,
      actor_name,
      reason,
      metadata
    )
    values (
      target.credential_uid,
      target.subject_type,
      target.subject_id,
      'validation_rejected',
      target.status,
      'Verificación pública',
      invalid_reason,
      jsonb_build_object('requested_qr_version', p_qr_version, 'current_qr_version', target.qr_version)
    );

    return query
    select target.credential_uid,
           target.subject_type,
           null::uuid,
           null::text,
           null::text,
           null::text,
           'revoked',
           public.official_credential_status_label('revoked'),
           invalid_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           null::text,
           'Esta credencial ya no es válida.';
    return;
  end if;

  effective_status := case
    when target.expires_at is not null and target.expires_at < current_date then 'expired'
    else target.status
  end;

  update public.official_credential_registry
  set last_validated_at = now(),
      validation_count = validation_count + 1,
      updated_at = now()
  where official_credential_registry.credential_uid = target.credential_uid;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_to,
    actor_name,
    reason
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    'validated_public',
    effective_status,
    'Verificación pública',
    'Consulta pública de validez de credencial.'
  );

  if effective_status <> 'active' then
    return query
    select target.credential_uid,
           target.subject_type,
           null::uuid,
           null::text,
           null::text,
           null::text,
           effective_status,
           public.official_credential_status_label(effective_status),
           coalesce(nullif(target.status_reason, ''), case when effective_status = 'expired' then 'Credencial caducada.' else 'Credencial no activa.' end),
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           null::text,
           case
             when effective_status = 'expired' then 'Esta credencial ha caducado y ya no es válida.'
             else 'Esta credencial ya no es válida.'
           end;
    return;
  end if;

  if target.subject_type = 'beneficiary' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           b.full_name,
           b.code,
           'BENEFICIARIO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           b.photo_url,
           b.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.beneficiaries b
    where b.id = target.subject_id;
  elsif target.subject_type = 'volunteer' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           v.full_name,
           coalesce(substring(coalesce(v.notes, '') from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'), target.credential_uid),
           'VOLUNTARIO ACREDITADO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           v.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.volunteers v
    where v.id = target.subject_id;
  elsif target.subject_type = 'collaborator' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           c.name,
           coalesce(c.code, target.credential_uid),
           'COLABORADOR',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           c.photo_url,
           c.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.collaborators c
    where c.id = target.subject_id;
  elsif target.subject_type = 'donor' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           d.name,
           coalesce(d.code, target.credential_uid),
           'DONANTE',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           d.photo_url,
           d.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.donors d
    where d.id = target.subject_id;
  elsif target.subject_type = 'user' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           trim(u.first_name || ' ' || coalesce(u.last_name, '')),
           target.credential_uid,
           upper(coalesce(nullif(u.position, ''), 'USUARIO DEL ERP')),
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           u.profile_photo,
           u.profile_photo,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.app_users u
    where u.id = target.subject_id;
  end if;
end;
$$;

grant execute on function public.verify_official_credential(text, integer) to anon, authenticated;
