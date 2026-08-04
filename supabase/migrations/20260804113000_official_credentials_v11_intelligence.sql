-- Sistema inteligente de credenciales ALTHEMON v1.1.
-- Mantiene un unico ID activo por persona, registra el ciclo de vida y
-- evita exponer datos personales cuando una credencial no esta vigente.

alter table public.official_credential_registry
  drop constraint if exists official_credential_registry_status_check;

alter table public.official_credential_registry
  add constraint official_credential_registry_status_check
  check (status in ('active', 'suspended', 'revoked', 'expired', 'inactive'));

create unique index if not exists official_credential_registry_active_subject_uidx
on public.official_credential_registry(subject_type, subject_id)
where status = 'active';

create or replace function public.official_credential_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_status, '')))
    when 'active' then 'Activa'
    when 'suspended' then 'Suspendida'
    when 'revoked' then 'Revocada'
    when 'expired' then 'Caducada'
    when 'inactive' then 'Inactiva'
    else 'Desconocida'
  end
$$;

create or replace function public.normalize_official_credential_reason(
  p_reason text,
  p_default text default 'Pérdida'
)
returns text
language plpgsql
immutable
as $$
declare
  clean_reason text := trim(coalesce(p_reason, ''));
  normalized text := lower(trim(coalesce(p_reason, '')));
begin
  if clean_reason = '' then
    return p_default;
  end if;

  if normalized = lower('Pérdida') then return 'Pérdida'; end if;
  if normalized = lower('Robo') then return 'Robo'; end if;
  if normalized = lower('Deterioro') then return 'Deterioro'; end if;
  if normalized = lower('Renovación') then return 'Renovación'; end if;
  if normalized = lower('Error de impresión') then return 'Error de impresión'; end if;
  if normalized = lower('Cambio de datos') then return 'Cambio de datos'; end if;
  if normalized = lower('Otro') then return 'Otro'; end if;

  return clean_reason;
end;
$$;

create or replace function public.manage_official_credential(
  p_credential_uid text,
  p_action text,
  p_reason text default ''
)
returns public.official_credential_registry
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  actor public.app_users%rowtype;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  clean_reason text := trim(coalesce(p_reason, ''));
  previous_status text;
  next_status text;
  now_value timestamptz := now();
  new_credential_uid text;
  new_credential public.official_credential_registry%rowtype;
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''))
  for update;

  if not found then
    raise exception 'La credencial oficial no existe.';
  end if;

  if not public.can_official_credential_action(target.subject_type, normalized_action) then
    raise exception 'No tienes permiso para gestionar esta credencial.';
  end if;

  select *
  into actor
  from public.app_users
  where (auth_user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    and is_active = true
  order by created_at asc
  limit 1;

  previous_status := target.status;
  next_status := target.status;

  if normalized_action = 'replace' then
    if target.status = 'revoked' then
      raise exception 'Una credencial revocada no puede sustituirse de nuevo.';
    end if;

    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Pérdida');
    new_credential_uid := public.next_official_credential_uid(target.subject_type);

    update public.official_credential_registry
    set status = 'revoked',
        status_reason = clean_reason,
        revoked_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;

    insert into public.official_credential_registry (
      credential_uid,
      subject_type,
      subject_id,
      status,
      status_reason,
      issued_at,
      qr_version,
      replaces_credential_uid,
      metadata,
      created_at,
      updated_at
    )
    values (
      new_credential_uid,
      target.subject_type,
      target.subject_id,
      'active',
      '',
      now_value,
      1,
      target.credential_uid,
      jsonb_build_object('replacement_reason', clean_reason),
      now_value,
      now_value
    )
    returning * into new_credential;

    update public.official_credential_registry
    set replaced_by_credential_uid = new_credential_uid,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;

    perform set_config('app.allow_credential_uid_rotation', 'on', true);

    if target.subject_type = 'beneficiary' then
      update public.beneficiaries
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'volunteer' then
      update public.volunteers
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'collaborator' then
      update public.collaborators
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'donor' then
      update public.donors
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    elsif target.subject_type = 'user' then
      update public.app_users
      set credential_uid = new_credential_uid
      where id = target.subject_id and credential_uid = target.credential_uid;
    end if;

    if not found then
      raise exception 'La credencial seleccionada ya no es la credencial activa de esta persona.';
    end if;

    insert into public.official_credential_events (
      credential_uid,
      subject_type,
      subject_id,
      event_type,
      status_from,
      status_to,
      actor_id,
      actor_name,
      actor_email,
      reason,
      metadata
    )
    values (
      target.credential_uid,
      target.subject_type,
      target.subject_id,
      'replaced',
      previous_status,
      'revoked',
      actor.id,
      coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
      coalesce(actor.email, ''),
      clean_reason,
      jsonb_build_object(
        'previous_credential_uid', target.credential_uid,
        'new_credential_uid', new_credential_uid,
        'reason', clean_reason
      )
    ), (
      new_credential_uid,
      target.subject_type,
      target.subject_id,
      'created',
      null,
      'active',
      actor.id,
      coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
      coalesce(actor.email, ''),
      clean_reason,
      jsonb_build_object(
        'previous_credential_uid', target.credential_uid,
        'new_credential_uid', new_credential_uid,
        'replacement_reason', clean_reason
      )
    );

    return new_credential;
  end if;

  if normalized_action = 'suspend' then
    next_status := 'suspended';
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Suspensión administrativa');
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        suspended_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'revoke' then
    next_status := 'revoked';
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Pérdida');
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        revoked_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'reactivate' then
    if target.status = 'revoked' then
      raise exception 'Una credencial revocada no puede reactivarse. Debe emitirse una nueva credencial.';
    end if;
    next_status := 'active';
    update public.official_credential_registry
    set status = next_status,
        status_reason = '',
        suspended_at = null,
        expired_at = null,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'expire' then
    next_status := 'expired';
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Caducidad');
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        expires_at = coalesce(expires_at, current_date),
        expired_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action in ('deactivate', 'inactive') then
    next_status := 'inactive';
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Desactivación administrativa');
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'regenerate_qr' then
    raise exception 'Para generar un nuevo QR debe sustituirse la credencial y emitirse un nuevo ID.';
  elsif normalized_action in ('print', 'reprint') then
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Reimpresión');
    update public.official_credential_registry
    set print_count = print_count + 1,
        last_printed_at = now_value,
        last_printed_by = actor.id,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'download_pdf' then
    clean_reason := public.normalize_official_credential_reason(clean_reason, 'Descarga de PDF');
    update public.official_credential_registry
    set updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  else
    raise exception 'Acción de credencial no soportada: %', p_action;
  end if;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_from,
    status_to,
    actor_id,
    actor_name,
    actor_email,
    reason,
    metadata
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    normalized_action,
    previous_status,
    next_status,
    actor.id,
    coalesce(nullif(trim(actor.first_name || ' ' || coalesce(actor.last_name, '')), ''), actor.email, 'Usuario'),
    coalesce(actor.email, ''),
    clean_reason,
    jsonb_build_object(
      'qr_version', target.qr_version,
      'print_count', target.print_count,
      'previous_credential_uid', target.credential_uid,
      'new_credential_uid', case when normalized_action in ('revoke', 'expire', 'deactivate', 'inactive') then null else target.credential_uid end
    )
  );

  return target;
end;
$$;

drop function if exists public.verify_official_credential(text);
drop function if exists public.verify_official_credential(text, integer);

create or replace function public.verify_official_credential(p_credential_uid text, p_qr_version integer default null)
returns table (
  credential_uid text,
  subject_type text,
  subject_id uuid,
  display_name text,
  credential_code text,
  role_label text,
  status text,
  status_label text,
  status_reason text,
  issued_at date,
  expires_at date,
  revoked_at timestamptz,
  photo_url text,
  photo_data_url text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.official_credential_registry%rowtype;
  effective_status text;
  invalid_reason text;
  invalid_message text;
begin
  select *
  into target
  from public.official_credential_registry registry
  where registry.credential_uid = trim(coalesce(p_credential_uid, ''));

  if not found then
    return;
  end if;

  if p_qr_version is not null and p_qr_version <> target.qr_version then
    invalid_reason := 'QR obsoleto o no vigente.';

    insert into public.official_credential_events (
      credential_uid,
      subject_type,
      subject_id,
      event_type,
      status_to,
      actor_name,
      reason,
      metadata
    )
    values (
      target.credential_uid,
      target.subject_type,
      target.subject_id,
      'validation_rejected',
      target.status,
      'Verificación pública',
      invalid_reason,
      jsonb_build_object('requested_qr_version', p_qr_version, 'current_qr_version', target.qr_version)
    );

    return query
    select target.credential_uid,
           target.subject_type,
           null::uuid,
           null::text,
           null::text,
           null::text,
           'revoked',
           public.official_credential_status_label('revoked'),
           invalid_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           null::text,
           'CREDENCIAL ANULADA';
    return;
  end if;

  effective_status := case
    when target.expires_at is not null and target.expires_at < current_date then 'expired'
    else target.status
  end;

  update public.official_credential_registry
  set last_validated_at = now(),
      validation_count = validation_count + 1,
      updated_at = now()
  where official_credential_registry.credential_uid = target.credential_uid;

  insert into public.official_credential_events (
    credential_uid,
    subject_type,
    subject_id,
    event_type,
    status_to,
    actor_name,
    reason
  )
  values (
    target.credential_uid,
    target.subject_type,
    target.subject_id,
    'validated_public',
    effective_status,
    'Verificación pública',
    'Consulta pública de validez de credencial.'
  );

  if effective_status <> 'active' then
    invalid_reason := coalesce(nullif(target.status_reason, ''), case
      when effective_status = 'revoked' then 'Pérdida'
      when effective_status = 'expired' then 'Credencial caducada.'
      when effective_status = 'suspended' then 'Credencial suspendida.'
      when effective_status = 'inactive' then 'Credencial inactiva.'
      else 'Credencial no activa.'
    end);
    invalid_message := case
      when effective_status = 'revoked' then 'CREDENCIAL ANULADA'
      when effective_status = 'expired' then 'Esta credencial ha caducado y ya no es válida.'
      when effective_status = 'suspended' then 'Esta credencial está suspendida temporalmente.'
      when effective_status = 'inactive' then 'Esta credencial está inactiva.'
      else 'Esta credencial ya no es válida.'
    end;

    return query
    select target.credential_uid,
           target.subject_type,
           null::uuid,
           null::text,
           null::text,
           null::text,
           effective_status,
           public.official_credential_status_label(effective_status),
           invalid_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           null::text,
           invalid_message;
    return;
  end if;

  if target.subject_type = 'beneficiary' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           b.full_name,
           b.code,
           'BENEFICIARIO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           b.photo_url,
           b.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.beneficiaries b
    where b.id = target.subject_id;
  elsif target.subject_type = 'volunteer' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           v.full_name,
           coalesce(substring(coalesce(v.notes, '') from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'), target.credential_uid),
           'VOLUNTARIO ACREDITADO',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           v.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.volunteers v
    where v.id = target.subject_id;
  elsif target.subject_type = 'collaborator' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           c.name,
           coalesce(c.code, target.credential_uid),
           'COLABORADOR',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           c.photo_url,
           c.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.collaborators c
    where c.id = target.subject_id;
  elsif target.subject_type = 'donor' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           d.name,
           coalesce(d.code, target.credential_uid),
           'DONANTE',
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           d.photo_url,
           d.photo_data_url,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.donors d
    where d.id = target.subject_id;
  elsif target.subject_type = 'user' then
    return query
    select target.credential_uid,
           target.subject_type,
           target.subject_id,
           trim(u.first_name || ' ' || coalesce(u.last_name, '')),
           target.credential_uid,
           upper(coalesce(nullif(u.position, ''), 'USUARIO DEL ERP')),
           effective_status,
           public.official_credential_status_label(effective_status),
           target.status_reason,
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           u.profile_photo,
           u.profile_photo,
           'Esta credencial ha sido emitida oficialmente por Pan y Esperanza.'
    from public.app_users u
    where u.id = target.subject_id;
  end if;
end;
$$;

grant execute on function public.manage_official_credential(text, text, text) to authenticated;
grant execute on function public.verify_official_credential(text, integer) to anon, authenticated;
grant execute on function public.official_credential_status_label(text) to anon, authenticated;

notify pgrst, 'reload schema';
