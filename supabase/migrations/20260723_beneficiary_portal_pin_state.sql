alter table public.beneficiary_portal_accounts
  add column if not exists must_change_pin boolean not null default false,
  add column if not exists pin_changed_at timestamptz,
  add column if not exists temporary_pin_sent_at timestamptz;

comment on column public.beneficiary_portal_accounts.must_change_pin is
  'Indica que el PIN actual es temporal y debe cambiarse tras el acceso.';

comment on column public.beneficiary_portal_accounts.pin_changed_at is
  'Fecha en la que el beneficiario cambio su PIN temporal por uno propio.';

comment on column public.beneficiary_portal_accounts.temporary_pin_sent_at is
  'Fecha del ultimo envio de PIN temporal al beneficiario.';
