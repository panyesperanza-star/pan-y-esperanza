begin;

alter table public.volunteers
  add column if not exists code text,
  add column if not exists status text not null default 'Activo',
  add column if not exists joined_at date,
  add column if not exists left_at timestamptz,
  add column if not exists leave_reason text,
  add column if not exists address text,
  add column if not exists emergency_contact text,
  add column if not exists emergency_phone text,
  add column if not exists functions text,
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  row_data record;
  raw_notes text;
  start_pos integer;
  end_pos integer;
  json_text text;
  visible_notes text;
  volunteer_meta jsonb;
  joined_date date;
  archived_at_value timestamptz;
begin
  for row_data in
    select v.*, row_number() over (order by v.created_at, v.full_name, v.id) as seq
    from public.volunteers v
  loop
    raw_notes := coalesce(row_data.notes, '');
    volunteer_meta := '{}'::jsonb;
    visible_notes := btrim(raw_notes);
    joined_date := null;
    archived_at_value := null;
    start_pos := position('[PYE_VOLUNTEER_META]' in raw_notes);
    end_pos := position('[/PYE_VOLUNTEER_META]' in raw_notes);

    if start_pos > 0 and end_pos > start_pos then
      json_text := btrim(substr(
        raw_notes,
        start_pos + length('[PYE_VOLUNTEER_META]'),
        end_pos - start_pos - length('[PYE_VOLUNTEER_META]')
      ));

      begin
        volunteer_meta := coalesce(json_text::jsonb, '{}'::jsonb);
      exception when others then
        volunteer_meta := '{}'::jsonb;
      end;

      visible_notes := btrim(concat_ws(
        E'\n',
        nullif(btrim(substr(raw_notes, 1, start_pos - 1)), ''),
        nullif(btrim(substr(raw_notes, end_pos + length('[/PYE_VOLUNTEER_META]'))), '')
      ));
    end if;

    if coalesce(volunteer_meta->>'joined_at', '') ~ '^\d{4}-\d{2}-\d{2}' then
      joined_date := (volunteer_meta->>'joined_at')::date;
    end if;

    if coalesce(volunteer_meta->>'archived_at', '') ~ '^\d{4}-\d{2}-\d{2}' then
      archived_at_value := (volunteer_meta->>'archived_at')::timestamptz;
    end if;

    update public.volunteers
    set
      code = coalesce(
        nullif(btrim(row_data.code), ''),
        nullif(btrim(volunteer_meta->>'code'), ''),
        'VOL-' || to_char(coalesce(joined_date, row_data.created_at::date, current_date), 'YYYY') || '-' || lpad(row_data.seq::text, 4, '0')
      ),
      status = coalesce(nullif(btrim(volunteer_meta->>'status'), ''), nullif(btrim(row_data.status), ''), 'Activo'),
      joined_at = coalesce(row_data.joined_at, joined_date, row_data.created_at::date, current_date),
      left_at = coalesce(row_data.left_at, archived_at_value),
      leave_reason = coalesce(nullif(btrim(row_data.leave_reason), ''), nullif(btrim(volunteer_meta->>'archive_reason'), '')),
      address = coalesce(nullif(btrim(row_data.address), ''), nullif(btrim(volunteer_meta->>'address'), '')),
      emergency_contact = coalesce(nullif(btrim(row_data.emergency_contact), ''), nullif(btrim(volunteer_meta->>'emergency_contact'), '')),
      emergency_phone = coalesce(nullif(btrim(row_data.emergency_phone), ''), nullif(btrim(volunteer_meta->>'emergency_phone'), '')),
      functions = coalesce(nullif(btrim(row_data.functions), ''), nullif(btrim(volunteer_meta->>'tasks'), '')),
      photo_data_url = coalesce(nullif(row_data.photo_data_url, ''), nullif(volunteer_meta->>'photo_data_url', '')),
      notes = nullif(visible_notes, ''),
      updated_at = now()
    where id = row_data.id;
  end loop;
end $$;

alter table public.volunteers
  alter column code set not null,
  alter column joined_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'volunteers_status_check'
      and conrelid = 'public.volunteers'::regclass
  ) then
    alter table public.volunteers
      add constraint volunteers_status_check
      check (status in ('Activo', 'Inactivo', 'Archivado', 'Baja'));
  end if;
end $$;

create unique index if not exists volunteers_code_unique_idx
  on public.volunteers (upper(code))
  where code is not null and btrim(code) <> '';

drop trigger if exists volunteers_updated_at on public.volunteers;
create trigger volunteers_updated_at
before update on public.volunteers
for each row execute function public.set_updated_at();

do $$
declare
  volunteer_row record;
  identity_id uuid;
begin
  for volunteer_row in
    select *
    from public.volunteers
    where person_identity_id is null
    order by created_at, full_name, id
  loop
    insert into public.person_identities (
      full_name,
      document_id,
      email,
      phone,
      photo_data_url,
      source_type,
      source_id
    )
    values (
      volunteer_row.full_name,
      volunteer_row.document_id,
      volunteer_row.email,
      volunteer_row.phone,
      volunteer_row.photo_data_url,
      'volunteer',
      volunteer_row.id
    )
    returning id into identity_id;

    update public.volunteers
    set person_identity_id = identity_id
    where id = volunteer_row.id;

    insert into public.person_identity_link_audit (
      person_identity_id,
      volunteer_id,
      app_user_id,
      action,
      actor_name,
      reason,
      previous_values,
      next_values
    )
    values (
      identity_id,
      volunteer_row.id,
      null,
      'created',
      'Sistema',
      'Identidad creada al normalizar expediente profesional del voluntario',
      '{}'::jsonb,
      jsonb_build_object('volunteer_id', volunteer_row.id)
    );
  end loop;
end $$;

create table if not exists public.volunteer_documents (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  document_type text not null,
  status text not null default 'Pendiente',
  file_name text,
  file_data_url text,
  uploaded_at date,
  expires_at date,
  reviewed_at timestamptz,
  reviewed_by text,
  notes text,
  history jsonb not null default '[]'::jsonb,
  source_history_id uuid references public.volunteer_history(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_documents_status_check check (status in ('Vigente', 'Pendiente', 'Caducado', 'No requerido'))
);

create index if not exists volunteer_documents_volunteer_idx on public.volunteer_documents(volunteer_id);
create index if not exists volunteer_documents_status_idx on public.volunteer_documents(status);
create unique index if not exists volunteer_documents_source_history_unique_idx
  on public.volunteer_documents(source_history_id)
  where source_history_id is not null;

drop trigger if exists volunteer_documents_updated_at on public.volunteer_documents;
create trigger volunteer_documents_updated_at
before update on public.volunteer_documents
for each row execute function public.set_updated_at();

create table if not exists public.volunteer_training (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  course_name text not null,
  course_date date,
  hours numeric(7,2),
  entity text,
  certificate_file_name text,
  certificate_file_data_url text,
  expires_at date,
  status text not null default 'Vigente',
  notes text,
  source_history_id uuid references public.volunteer_history(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_training_status_check check (status in ('Vigente', 'Pendiente', 'Caducado', 'No requerido'))
);

create index if not exists volunteer_training_volunteer_idx on public.volunteer_training(volunteer_id);
create index if not exists volunteer_training_status_idx on public.volunteer_training(status);
create unique index if not exists volunteer_training_source_history_unique_idx
  on public.volunteer_training(source_history_id)
  where source_history_id is not null;

drop trigger if exists volunteer_training_updated_at on public.volunteer_training;
create trigger volunteer_training_updated_at
before update on public.volunteer_training
for each row execute function public.set_updated_at();

insert into public.volunteer_documents (
  volunteer_id,
  document_type,
  status,
  file_name,
  file_data_url,
  uploaded_at,
  notes,
  history,
  source_history_id,
  created_at,
  updated_at
)
select
  vh.volunteer_id,
  coalesce(nullif(btrim(regexp_replace(coalesce(vh.activity, 'Documento'), '^Documento:\s*', '', 'i')), ''), 'Documento'),
  'Vigente',
  null,
  null,
  vh.date,
  nullif(vh.notes, ''),
  jsonb_build_array(jsonb_build_object('date', vh.date, 'event', 'Documento migrado desde historial', 'user', 'Sistema')),
  vh.id,
  vh.created_at,
  now()
from public.volunteer_history vh
where vh.volunteer_id is not null
  and lower(coalesce(vh.activity, '')) like '%document%'
  and not exists (
    select 1 from public.volunteer_documents vd where vd.source_history_id = vh.id
  );

insert into public.volunteer_documents (
  volunteer_id,
  document_type,
  status,
  uploaded_at,
  notes,
  history,
  created_at,
  updated_at
)
select
  v.id,
  'Documentación indicada en ficha',
  'Pendiente',
  coalesce(v.joined_at, v.created_at::date, current_date),
  v.documentation,
  jsonb_build_array(jsonb_build_object('date', coalesce(v.joined_at, v.created_at::date, current_date), 'event', 'Documento migrado desde ficha', 'user', 'Sistema')),
  now(),
  now()
from public.volunteers v
where nullif(btrim(coalesce(v.documentation, '')), '') is not null
  and not exists (
    select 1
    from public.volunteer_documents vd
    where vd.volunteer_id = v.id
      and vd.document_type = 'Documentación indicada en ficha'
  );

insert into public.volunteer_training (
  volunteer_id,
  course_name,
  course_date,
  hours,
  notes,
  source_history_id,
  created_at,
  updated_at
)
select
  vh.volunteer_id,
  coalesce(nullif(btrim(regexp_replace(coalesce(vh.activity, 'Formación'), '^Formaci[oó]n:\s*', '', 'i')), ''), 'Formación'),
  vh.date,
  vh.hours,
  vh.notes,
  vh.id,
  vh.created_at,
  now()
from public.volunteer_history vh
where vh.volunteer_id is not null
  and lower(coalesce(vh.activity, '')) like '%formaci%'
  and not exists (
    select 1 from public.volunteer_training vt where vt.source_history_id = vh.id
  );

insert into public.volunteer_training (
  volunteer_id,
  course_name,
  course_date,
  notes,
  created_at,
  updated_at
)
select
  v.id,
  v.training,
  coalesce(v.joined_at, v.created_at::date, current_date),
  'Formación indicada en la ficha original.',
  now(),
  now()
from public.volunteers v
where nullif(btrim(coalesce(v.training, '')), '') is not null
  and not exists (
    select 1
    from public.volunteer_training vt
    where vt.volunteer_id = v.id
      and vt.course_name = v.training
  );

alter table public.volunteer_documents enable row level security;
alter table public.volunteer_training enable row level security;

drop policy if exists "volunteer_documents_select_by_permission" on public.volunteer_documents;
drop policy if exists "volunteer_documents_insert_by_permission" on public.volunteer_documents;
drop policy if exists "volunteer_documents_update_by_permission" on public.volunteer_documents;
drop policy if exists "volunteer_documents_delete_by_permission" on public.volunteer_documents;

create policy "volunteer_documents_select_by_permission"
on public.volunteer_documents for select to authenticated
using (public.can_module_action('volunteers', 'view'));

create policy "volunteer_documents_insert_by_permission"
on public.volunteer_documents for insert to authenticated
with check (public.can_module_action('volunteers', 'create') or public.can_module_action('volunteers', 'edit'));

create policy "volunteer_documents_update_by_permission"
on public.volunteer_documents for update to authenticated
using (public.can_module_action('volunteers', 'edit'))
with check (public.can_module_action('volunteers', 'edit'));

create policy "volunteer_documents_delete_by_permission"
on public.volunteer_documents for delete to authenticated
using (public.can_module_action('volunteers', 'delete'));

drop policy if exists "volunteer_training_select_by_permission" on public.volunteer_training;
drop policy if exists "volunteer_training_insert_by_permission" on public.volunteer_training;
drop policy if exists "volunteer_training_update_by_permission" on public.volunteer_training;
drop policy if exists "volunteer_training_delete_by_permission" on public.volunteer_training;

create policy "volunteer_training_select_by_permission"
on public.volunteer_training for select to authenticated
using (public.can_module_action('volunteers', 'view'));

create policy "volunteer_training_insert_by_permission"
on public.volunteer_training for insert to authenticated
with check (public.can_module_action('volunteers', 'create') or public.can_module_action('volunteers', 'edit'));

create policy "volunteer_training_update_by_permission"
on public.volunteer_training for update to authenticated
using (public.can_module_action('volunteers', 'edit'))
with check (public.can_module_action('volunteers', 'edit'));

create policy "volunteer_training_delete_by_permission"
on public.volunteer_training for delete to authenticated
using (public.can_module_action('volunteers', 'delete'));

grant select, insert, update, delete on public.volunteer_documents to authenticated;
grant select, insert, update, delete on public.volunteer_training to authenticated;

notify pgrst, 'reload schema';

commit;
