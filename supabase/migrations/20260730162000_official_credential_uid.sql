-- Identificador unico e inmutable de acreditacion ALTHEMON.
-- Beneficiarios, voluntarios y colaboradores reciben un ID estable para credencial, QR y validaciones.

create sequence if not exists public.official_credential_uid_sequence start with 1 increment by 1;

create table if not exists public.official_credential_registry (
  credential_uid text primary key,
  subject_type text not null check (subject_type in ('beneficiary', 'volunteer', 'collaborator')),
  subject_id uuid not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_type, subject_id)
);

alter table public.official_credential_registry add column if not exists issued_at timestamptz not null default now();

alter table public.beneficiaries add column if not exists credential_uid text;
alter table public.volunteers add column if not exists credential_uid text;
alter table public.collaborators add column if not exists credential_uid text;

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
    ) and not exists (
      select 1 from public.beneficiaries where credential_uid = candidate
    ) and not exists (
      select 1 from public.volunteers where credential_uid = candidate
    ) and not exists (
      select 1 from public.collaborators where credential_uid = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.beneficiaries alter column credential_uid set default public.next_official_credential_uid('beneficiary');
alter table public.volunteers alter column credential_uid set default public.next_official_credential_uid('volunteer');
alter table public.collaborators alter column credential_uid set default public.next_official_credential_uid('collaborator');

do $$
declare
  item record;
begin
  for item in select id from public.beneficiaries where nullif(trim(coalesce(credential_uid, '')), '') is null loop
    update public.beneficiaries
    set credential_uid = public.next_official_credential_uid('beneficiary')
    where id = item.id;
  end loop;

  for item in select id from public.volunteers where nullif(trim(coalesce(credential_uid, '')), '') is null loop
    update public.volunteers
    set credential_uid = public.next_official_credential_uid('volunteer')
    where id = item.id;
  end loop;

  for item in select id from public.collaborators where nullif(trim(coalesce(credential_uid, '')), '') is null loop
    update public.collaborators
    set credential_uid = public.next_official_credential_uid('collaborator')
    where id = item.id;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from (
      select credential_uid from public.beneficiaries
      union all
      select credential_uid from public.volunteers
      union all
      select credential_uid from public.collaborators
    ) credentials
    where credential_uid is not null
    group by credential_uid
    having count(*) > 1
  ) then
    raise exception 'Existen credential_uid duplicados entre tablas de acreditacion.';
  end if;
end;
$$;

alter table public.beneficiaries alter column credential_uid set not null;
alter table public.volunteers alter column credential_uid set not null;
alter table public.collaborators alter column credential_uid set not null;

create unique index if not exists beneficiaries_credential_uid_uidx on public.beneficiaries (credential_uid);
create unique index if not exists volunteers_credential_uid_uidx on public.volunteers (credential_uid);
create unique index if not exists collaborators_credential_uid_uidx on public.collaborators (credential_uid);
create index if not exists official_credential_registry_subject_idx on public.official_credential_registry (subject_type, subject_id);

insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
select credential_uid, 'beneficiary', id from public.beneficiaries
where credential_uid is not null
on conflict (credential_uid) do update
set subject_type = excluded.subject_type,
    subject_id = excluded.subject_id,
    updated_at = now();

insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
select credential_uid, 'volunteer', id from public.volunteers
where credential_uid is not null
on conflict (credential_uid) do update
set subject_type = excluded.subject_type,
    subject_id = excluded.subject_id,
    updated_at = now();

insert into public.official_credential_registry (credential_uid, subject_type, subject_id)
select credential_uid, 'collaborator', id from public.collaborators
where credential_uid is not null
on conflict (credential_uid) do update
set subject_type = excluded.subject_type,
    subject_id = excluded.subject_id,
    updated_at = now();

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

drop trigger if exists official_credential_registry_updated_at on public.official_credential_registry;
create trigger official_credential_registry_updated_at
before update on public.official_credential_registry
for each row execute function public.set_updated_at();

drop trigger if exists beneficiaries_set_official_credential_uid on public.beneficiaries;
create trigger beneficiaries_set_official_credential_uid
before insert or update of credential_uid on public.beneficiaries
for each row execute function public.set_official_credential_uid();

drop trigger if exists volunteers_set_official_credential_uid on public.volunteers;
create trigger volunteers_set_official_credential_uid
before insert or update of credential_uid on public.volunteers
for each row execute function public.set_official_credential_uid();

drop trigger if exists collaborators_set_official_credential_uid on public.collaborators;
create trigger collaborators_set_official_credential_uid
before insert or update of credential_uid on public.collaborators
for each row execute function public.set_official_credential_uid();

drop trigger if exists beneficiaries_register_official_credential_uid on public.beneficiaries;
create trigger beneficiaries_register_official_credential_uid
after insert on public.beneficiaries
for each row execute function public.register_official_credential_uid();

drop trigger if exists volunteers_register_official_credential_uid on public.volunteers;
create trigger volunteers_register_official_credential_uid
after insert on public.volunteers
for each row execute function public.register_official_credential_uid();

drop trigger if exists collaborators_register_official_credential_uid on public.collaborators;
create trigger collaborators_register_official_credential_uid
after insert on public.collaborators
for each row execute function public.register_official_credential_uid();

alter table public.official_credential_registry enable row level security;
drop policy if exists "official_credential_registry_select_authenticated" on public.official_credential_registry;
create policy "official_credential_registry_select_authenticated" on public.official_credential_registry
for select to authenticated using (true);
