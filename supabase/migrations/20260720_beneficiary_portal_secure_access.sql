-- Refuerzo de acceso del Portal Beneficiario.
-- Sustituye fecha de nacimiento como credencial por identificador privado + PIN.

alter table public.beneficiary_portal_accounts
  add column if not exists access_identifier text,
  add column if not exists pin_hash text,
  add column if not exists pin_salt text,
  add column if not exists pin_set_at timestamptz,
  add column if not exists failed_access_attempts integer not null default 0,
  add column if not exists last_failed_access_at timestamptz,
  add column if not exists last_successful_access_at timestamptz,
  add column if not exists locked_until timestamptz;

alter table public.beneficiary_portal_accounts
  drop constraint if exists beneficiary_portal_accounts_failed_attempts_check;

alter table public.beneficiary_portal_accounts
  add constraint beneficiary_portal_accounts_failed_attempts_check
  check (failed_access_attempts >= 0);

create or replace function public.generate_beneficiary_portal_identifier()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := 'PYE-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
    exit when not exists (
      select 1
      from public.beneficiary_portal_accounts
      where access_identifier = candidate
    );
  end loop;
  return candidate;
end;
$$;

update public.beneficiary_portal_accounts
set
  access_identifier = public.generate_beneficiary_portal_identifier(),
  updated_at = now()
where nullif(access_identifier, '') is null;

insert into public.beneficiary_portal_accounts (
  beneficiary_id,
  access_identifier,
  email,
  phone,
  status,
  access_level,
  notes,
  created_at,
  updated_at
)
select
  b.id,
  public.generate_beneficiary_portal_identifier(),
  b.email,
  b.phone,
  'draft',
  'beneficiary',
  'Acceso seguro pendiente de activacion y PIN.',
  now(),
  now()
from public.beneficiaries b
where not exists (
  select 1
  from public.beneficiary_portal_accounts a
  where a.beneficiary_id = b.id
);

alter table public.beneficiary_portal_accounts
  alter column access_identifier set default ('PYE-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  alter column access_identifier set not null;

create unique index if not exists beneficiary_portal_accounts_access_identifier_uidx
  on public.beneficiary_portal_accounts (access_identifier);

comment on column public.beneficiary_portal_accounts.access_identifier is
  'Identificador privado aleatorio para acceso al Portal Beneficiario. No usar fecha de nacimiento como credencial.';
comment on column public.beneficiary_portal_accounts.pin_hash is
  'Hash del PIN de acceso. El PIN nunca debe almacenarse en claro.';
comment on column public.beneficiary_portal_accounts.failed_access_attempts is
  'Contador de intentos fallidos de acceso al portal para limitar fuerza bruta.';
comment on column public.beneficiary_portal_accounts.locked_until is
  'Bloqueo temporal por exceso de intentos fallidos.';
