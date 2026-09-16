begin;

create or replace function public.update_volunteer_with_identity(
  p_volunteer_id uuid,
  p_payload jsonb
)
returns public.volunteers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.volunteers;
  v_updated public.volunteers;
  v_identity_id uuid;
  v_full_name text := btrim(coalesce(p_payload->>'full_name', ''));
  v_document_id text := btrim(coalesce(p_payload->>'document_id', ''));
  v_phone text := btrim(coalesce(p_payload->>'phone', ''));
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
begin
  if not (
    public.can_app_permission('volunteers', 'edit')
    or public.can_module_action('volunteers', 'edit')
  ) then
    raise exception 'No tienes permiso para editar voluntarios.' using errcode = '42501';
  end if;

  if v_full_name = '' then
    raise exception 'El nombre del voluntario es obligatorio.' using errcode = '23502';
  end if;

  if v_status not in ('Activo', 'Inactivo', 'Archivado', 'Baja') then
    raise exception 'El estado del voluntario no es valido.' using errcode = '22000';
  end if;

  if nullif(p_payload->>'left_at', '') is not null then
    v_left_at := (p_payload->>'left_at')::timestamptz;
  end if;

  select * into v_current
  from public.volunteers
  where id = p_volunteer_id
  for update;

  if not found then
    raise exception 'El expediente de voluntario no existe.' using errcode = 'P0002';
  end if;

  v_identity_id := coalesce(nullif(p_payload->>'person_identity_id', '')::uuid, v_current.person_identity_id);

  if v_identity_id is not null then
    update public.person_identities
    set full_name = v_full_name,
        document_id = nullif(v_document_id, ''),
        email = nullif(v_email, ''),
        phone = nullif(v_phone, ''),
        photo_data_url = coalesce(nullif(v_photo_data_url, ''), photo_data_url),
        updated_at = now()
    where id = v_identity_id;

    if not found then
      raise exception 'La identidad del voluntario no existe.' using errcode = '23503';
    end if;
  end if;

  update public.volunteers
  set full_name = v_full_name,
      document_id = nullif(v_document_id, ''),
      phone = nullif(v_phone, ''),
      email = nullif(v_email, ''),
      status = v_status,
      joined_at = v_joined_at,
      left_at = v_left_at,
      leave_reason = nullif(v_leave_reason, ''),
      address = nullif(v_address, ''),
      emergency_contact = nullif(v_emergency_contact, ''),
      emergency_phone = nullif(v_emergency_phone, ''),
      functions = nullif(v_functions, ''),
      photo_data_url = coalesce(nullif(v_photo_data_url, ''), photo_data_url),
      training = nullif(v_training, ''),
      availability = nullif(v_availability, ''),
      documentation = nullif(v_documentation, ''),
      notes = nullif(v_notes, ''),
      person_identity_id = v_identity_id,
      updated_at = now()
  where id = p_volunteer_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke all on function public.update_volunteer_with_identity(uuid, jsonb) from public;
grant execute on function public.update_volunteer_with_identity(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
