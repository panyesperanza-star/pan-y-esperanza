begin;

alter table public.social_resource_sources
  add column if not exists next_check_at timestamptz,
  add column if not exists last_check_started_at timestamptz,
  add column if not exists last_check_finished_at timestamptz,
  add column if not exists last_check_error text not null default '';

alter table public.social_resource_detections
  add column if not exists dedupe_key text not null default '',
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create unique index if not exists social_resource_detections_dedupe_key_uidx
  on public.social_resource_detections(dedupe_key)
  where dedupe_key <> '';

create index if not exists social_resource_sources_due_check_idx
  on public.social_resource_sources(status, next_check_at, last_checked_at);

notify pgrst, 'reload schema';

commit;
