-- Sistema oficial de credenciales ALTHEMON v1.0.
-- Automatizacion, seguridad, historial, impresion y verificacion publica.

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
    update public.official_credential_registry
    set qr_version = qr_version + 1,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
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
      'Verificacion publica',
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
    'Verificacion publica',
    'Consulta publica de validez de credencial.'
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
