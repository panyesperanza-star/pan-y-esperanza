begin;

create table if not exists public.volunteer_time_entries (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  person_identity_id uuid references public.person_identities(id) on delete set null,
  activity_type text not null default 'General',
  activity_label text,
  linked_entity_type text,
  linked_entity_id uuid,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  total_minutes integer,
  method text not null default 'manual',
  credential_uid text,
  device_info text,
  registered_by_user_id uuid references public.app_users(id) on delete set null,
  registered_by_name text,
  status text not null default 'open',
  incident_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_time_entries_method_check check (method in ('qr', 'usb', 'manual')),
  constraint volunteer_time_entries_status_check check (status in ('open', 'closed', 'incident', 'corrected', 'voided')),
  constraint volunteer_time_entries_total_minutes_check check (total_minutes is null or total_minutes >= 0),
  constraint volunteer_time_entries_checkout_after_check check (check_out_at is null or check_out_at >= check_in_at)
);

create index if not exists volunteer_time_entries_volunteer_idx on public.volunteer_time_entries(volunteer_id, check_in_at desc);
create index if not exists volunteer_time_entries_person_identity_idx on public.volunteer_time_entries(person_identity_id);
create index if not exists volunteer_time_entries_status_idx on public.volunteer_time_entries(status);
create unique index if not exists volunteer_time_entries_one_open_per_volunteer_idx
  on public.volunteer_time_entries(volunteer_id)
  where status = 'open' and check_out_at is null;

drop trigger if exists volunteer_time_entries_updated_at on public.volunteer_time_entries;
create trigger volunteer_time_entries_updated_at
before update on public.volunteer_time_entries
for each row execute function public.set_updated_at();

create table if not exists public.volunteer_time_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.volunteer_time_entries(id) on delete cascade,
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  previous_values jsonb not null default '{}'::jsonb,
  next_values jsonb not null default '{}'::jsonb,
  reason text not null,
  corrected_by_user_id uuid references public.app_users(id) on delete set null,
  corrected_by_name text,
  corrected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists volunteer_time_entry_corrections_entry_idx on public.volunteer_time_entry_corrections(time_entry_id);
create index if not exists volunteer_time_entry_corrections_volunteer_idx on public.volunteer_time_entry_corrections(volunteer_id, corrected_at desc);

alter table public.volunteer_time_entries enable row level security;
alter table public.volunteer_time_entry_corrections enable row level security;

drop policy if exists "volunteer_time_entries_select_by_permission" on public.volunteer_time_entries;
drop policy if exists "volunteer_time_entries_insert_by_permission" on public.volunteer_time_entries;
drop policy if exists "volunteer_time_entries_update_by_permission" on public.volunteer_time_entries;
drop policy if exists "volunteer_time_entries_delete_by_permission" on public.volunteer_time_entries;

create policy "volunteer_time_entries_select_by_permission"
on public.volunteer_time_entries for select to authenticated
using (public.can_module_action('volunteers', 'view'));

create policy "volunteer_time_entries_insert_by_permission"
on public.volunteer_time_entries for insert to authenticated
with check (public.can_module_action('volunteers', 'edit') or public.can_module_action('volunteers', 'create'));

create policy "volunteer_time_entries_update_by_permission"
on public.volunteer_time_entries for update to authenticated
using (public.can_module_action('volunteers', 'edit'))
with check (public.can_module_action('volunteers', 'edit'));

create policy "volunteer_time_entries_delete_by_permission"
on public.volunteer_time_entries for delete to authenticated
using (public.can_module_action('volunteers', 'delete'));

drop policy if exists "volunteer_time_entry_corrections_select_by_permission" on public.volunteer_time_entry_corrections;
drop policy if exists "volunteer_time_entry_corrections_insert_by_permission" on public.volunteer_time_entry_corrections;
drop policy if exists "volunteer_time_entry_corrections_update_by_permission" on public.volunteer_time_entry_corrections;
drop policy if exists "volunteer_time_entry_corrections_delete_by_permission" on public.volunteer_time_entry_corrections;

create policy "volunteer_time_entry_corrections_select_by_permission"
on public.volunteer_time_entry_corrections for select to authenticated
using (public.can_module_action('volunteers', 'view'));

create policy "volunteer_time_entry_corrections_insert_by_permission"
on public.volunteer_time_entry_corrections for insert to authenticated
with check (public.can_module_action('volunteers', 'edit'));

create policy "volunteer_time_entry_corrections_update_by_permission"
on public.volunteer_time_entry_corrections for update to authenticated
using (false)
with check (false);

create policy "volunteer_time_entry_corrections_delete_by_permission"
on public.volunteer_time_entry_corrections for delete to authenticated
using (public.can_module_action('volunteers', 'delete'));

grant select, insert, update, delete on public.volunteer_time_entries to authenticated;
grant select, insert, update, delete on public.volunteer_time_entry_corrections to authenticated;

notify pgrst, 'reload schema';

commit;
