begin;

alter table public.volunteer_time_entries
  add column if not exists incident_review_status text not null default 'pending',
  add column if not exists incident_reviewed_at timestamptz,
  add column if not exists incident_reviewed_by uuid references public.app_users(id) on delete set null,
  add column if not exists incident_reviewed_by_name text not null default '',
  add column if not exists incident_review_notes text not null default '';

alter table public.volunteer_time_entries
  drop constraint if exists volunteer_time_entries_incident_review_status_check;

alter table public.volunteer_time_entries
  add constraint volunteer_time_entries_incident_review_status_check
  check (incident_review_status in ('pending', 'reviewed', 'resolved', 'dismissed'));

create index if not exists volunteer_time_entries_pending_incident_idx
  on public.volunteer_time_entries (check_in_at desc)
  where incident_review_status = 'pending'
    and nullif(btrim(coalesce(incident_type, '')), '') is not null;

-- These are historical, already closed excessive-duration incidents from before
-- the application recorded an explicit review state. The incident and timing
-- remain intact; only their review lifecycle is normalized.
update public.volunteer_time_entries
set incident_review_status = 'reviewed',
    incident_reviewed_at = coalesce(updated_at, check_out_at, now()),
    incident_reviewed_by = null,
    incident_reviewed_by_name = 'Sistema (normalización histórica)',
    incident_review_notes = 'Incidencia histórica cerrada y normalizada al introducir el estado de revisión.'
where incident_review_status = 'pending'
  and status = 'incident'
  and incident_type = 'Fichaje excesivamente largo'
  and check_out_at is not null
  and check_in_at < timestamptz '2026-09-16 00:00:00+00';

notify pgrst, 'reload schema';
commit;
