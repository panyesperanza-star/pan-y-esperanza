alter table public.deliveries
  add column if not exists attendance_status text not null default 'pending'
    check (attendance_status in ('pending', 'confirmed', 'unavailable', 'needs_contact')),
  add column if not exists attendance_confirmed_at timestamptz,
  add column if not exists attendance_source text
    check (attendance_source is null or attendance_source in ('portal', 'erp', 'system')),
  add column if not exists attendance_reason text,
  add column if not exists attendance_notes text;

create index if not exists deliveries_attendance_status_idx
  on public.deliveries (attendance_status, delivered_at);

create index if not exists deliveries_beneficiary_attendance_idx
  on public.deliveries (beneficiary_id, attendance_status, delivered_at);
