begin;

create index if not exists app_users_auth_user_id_idx
  on public.app_users(auth_user_id)
  where auth_user_id is not null;

create index if not exists app_users_lower_email_idx
  on public.app_users(lower(email));

create or replace function public.create_volunteer_with_identity(p_payload jsonb)
returns public.volunteers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_payload_identity_id uuid := nullif(p_payload->>'person_identity_id', '')::uuid;
  v_identity_id uuid;
  v_volunteer public.volunteers;
  v_full_name text := btrim(coalesce(p_payload->>'full_name', ''));
  v_document_id text := btrim(coalesce(p_payload->>'document_id', ''));
  v_document_key text := upper(regexp_replace(btrim(coalesce(p_payload->>'document_id', '')), '[^A-Za-z0-9]', '', 'g'));
  v_phone text := btrim(coalesce(p_payload->>'phone', ''));
  v_phone_key text := regexp_replace(btrim(coalesce(p_payload->>'phone', '')), '[^0-9]', '', 'g');
  v_email text := lower(btrim(coalesce(p_payload->>'email', '')));
  v_status text := coalesce(nullif(btrim(p_payload->>'status'), ''), 'Activo');
  v_joined_at date := coalesce(nullif(p_payload->>'joined_at', '')::date, current_date);
  v_left_at timestamptz;
  v_leave_reason text := btrim(coalesce(p_payload->>'leave_reason', ''));
  v_address text := btrim(coalesce(p_payload->>'address', ''));
  v_emergency_contact text := btrim(coalesce(p_payload->>'emergency_contact', ''));
  v_emergency_phone text := btrim(coalesce(p_payload->>'emergency_phone', ''));
  v_functions text := btrim(coalesce(p_payload->>'functions', p_payload->>'tasks', ''));
  v_photo_data_url text := btrim(coalesce(p_payload->>'photo_data_url', ''));
  v_training text := btrim(coalesce(p_payload->>'training', ''));
  v_availability text := btrim(coalesce(p_payload->>'availability', ''));
  v_documentation text := btrim(coalesce(p_payload->>'documentation', ''));
  v_notes text := btrim(coalesce(p_payload->>'notes', ''));
  v_year integer := extract(year from coalesce(nullif(p_payload->>'joined_at', '')::date, current_date))::integer;
  v_next_number integer;
  v_code text;
begin
  if not (
    public.can_app_permission('volunteers', 'create')
    or public.can_module_action('volunteers', 'create')
  ) then
    raise exception 'No tienes permiso para crear voluntarios.'
      using errcode = '42501';
  end if;

  if v_full_name = '' then
    raise exception 'El nombre del voluntario es obligatorio.'
      using errcode = '23502';
  end if;

  if v_status not in ('Activo', 'Inactivo', 'Archivado', 'Baja') then
    raise exception 'El estado del voluntario no es valido.'
      using errcode = '22000';
  end if;

  if nullif(p_payload->>'left_at', '') is not null then
    v_left_at := (p_payload->>'left_at')::timestamptz;
  end if;

  select app_user.id
  into v_actor_id
  from public.current_app_user() app_user;

  if v_payload_identity_id is not null then
    select identity_row.id
    into v_identity_id
    from public.person_identities identity_row
    where identity_row.id = v_payload_identity_id
    for update;

    if v_identity_id is null then
      raise exception 'La identidad indicada para el voluntario no existe.'
        using errcode = '23503';
    end if;

    if exists (
      select 1
      from public.volunteers existing_volunteer
      where existing_volunteer.person_identity_id = v_identity_id
    ) then
      raise exception 'Esta identidad ya tiene un expediente de voluntario.'
        using errcode = '23505', constraint = 'volunteers_person_identity_unique_idx';
    end if;
  end if;

  if v_document_key <> '' and exists (
    select 1
    from public.volunteers volunteer
    where upper(regexp_replace(coalesce(volunteer.document_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_document_key
  ) then
    raise exception 'Ya existe una ficha de voluntario con ese documento.'
      using errcode = '23505', constraint = 'volunteers_document_duplicate_runtime';
  end if;

  if v_email <> '' and exists (
    select 1
    from public.volunteers volunteer
    where lower(btrim(coalesce(volunteer.email, ''))) = v_email
  ) then
    raise exception 'Ya existe una ficha de voluntario con ese email.'
      using errcode = '23505', constraint = 'volunteers_email_duplicate_runtime';
  end if;

  if length(v_phone_key) >= 7 and exists (
    select 1
    from public.volunteers volunteer
    where regexp_replace(coalesce(volunteer.phone, ''), '[^0-9]', '', 'g') = v_phone_key
  ) then
    raise exception 'Ya existe una ficha de voluntario con ese telefono.'
      using errcode = '23505', constraint = 'volunteers_phone_duplicate_runtime';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.volunteers.create.' || v_year::text)::bigint);

  select coalesce(max(substring(upper(btrim(code)) from ('^VOL-' || v_year::text || '-([0-9]{4})$'))::integer), 0) + 1
  into v_next_number
  from public.volunteers
  where upper(btrim(code)) ~ ('^VOL-' || v_year::text || '-[0-9]{4}$');

  loop
    v_code := 'VOL-' || v_year::text || '-' || lpad(v_next_number::text, 4, '0');
    exit when not exists (
      select 1
      from public.volunteers volunteer
      where upper(btrim(coalesce(volunteer.code, ''))) = v_code
    );
    v_next_number := v_next_number + 1;
  end loop;

  if v_identity_id is null then
    insert into public.person_identities (
      full_name,
      document_id,
      email,
      phone,
      photo_data_url,
      source_type,
      source_id,
      created_by
    )
    values (
      v_full_name,
      nullif(v_document_id, ''),
      nullif(v_email, ''),
      nullif(v_phone, ''),
      nullif(v_photo_data_url, ''),
      'volunteer',
      null,
      v_actor_id
    )
    returning id into v_identity_id;
  else
    update public.person_identities
    set full_name = coalesce(nullif(v_full_name, ''), full_name),
        document_id = coalesce(nullif(v_document_id, ''), document_id),
        email = coalesce(nullif(v_email, ''), email),
        phone = coalesce(nullif(v_phone, ''), phone),
        photo_data_url = coalesce(nullif(v_photo_data_url, ''), photo_data_url),
        updated_at = now()
    where id = v_identity_id;
  end if;

  insert into public.volunteers (
    code,
    full_name,
    document_id,
    phone,
    email,
    status,
    joined_at,
    left_at,
    leave_reason,
    address,
    emergency_contact,
    emergency_phone,
    functions,
    photo_data_url,
    training,
    availability,
    documentation,
    notes,
    person_identity_id
  )
  values (
    v_code,
    v_full_name,
    nullif(v_document_id, ''),
    nullif(v_phone, ''),
    nullif(v_email, ''),
    v_status,
    v_joined_at,
    v_left_at,
    nullif(v_leave_reason, ''),
    nullif(v_address, ''),
    nullif(v_emergency_contact, ''),
    nullif(v_emergency_phone, ''),
    nullif(v_functions, ''),
    nullif(v_photo_data_url, ''),
    nullif(v_training, ''),
    nullif(v_availability, ''),
    nullif(v_documentation, ''),
    nullif(v_notes, ''),
    v_identity_id
  )
  returning * into v_volunteer;

  update public.person_identities
  set source_type = case when source_type = 'manual' then 'volunteer' else source_type end,
      source_id = coalesce(source_id, v_volunteer.id),
      updated_at = now()
  where id = v_identity_id;

  return v_volunteer;
end;
$$;

revoke all on function public.create_volunteer_with_identity(jsonb) from public;
grant execute on function public.create_volunteer_with_identity(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
