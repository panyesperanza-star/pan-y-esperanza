-- Ciclo de vida oficial de credenciales ALTHEMON v1.0.
-- Sustitución segura: una credencial perdida, robada, deteriorada o sustituida
-- nunca reutiliza el mismo ID ni el mismo QR.

alter table public.official_credential_registry
  add column if not exists replaces_credential_uid text references public.official_credential_registry(credential_uid) on delete set null,
  add column if not exists replaced_by_credential_uid text references public.official_credential_registry(credential_uid) on delete set null;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'official_credential_registry'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) key(attnum)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
      ) = array['subject_id', 'subject_type']
  loop
    execute format('alter table public.official_credential_registry drop constraint %I', constraint_record.conname);
  end loop;
end $$;

drop index if exists public.official_credential_registry_subject_unique_idx;
create unique index if not exists official_credential_registry_active_subject_uidx
on public.official_credential_registry(subject_type, subject_id)
where status = 'active';

create or replace function public.set_official_credential_uid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subject_type text := public.official_credential_subject_type(tg_table_name);
  rotation_allowed boolean := lower(coalesce(current_setting('app.allow_credential_uid_rotation', true), 'off')) = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.credential_uid is distinct from old.credential_uid and not rotation_allowed then
      raise exception 'El ID de credencial oficial es inmutable y solo puede sustituirse desde el ciclo oficial de credenciales.';
    end if;
    return new;
  end if;

  if nullif(trim(coalesce(new.credential_uid, '')), '') is null then
    new.credential_uid := public.next_official_credential_uid(subject_type);
  end if;

  return new;
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

    clean_reason := coalesce(nullif(clean_reason, ''), 'Sustitución de credencial.');
    new_credential_uid := public.next_official_credential_uid(target.subject_type);

    update public.official_credential_registry
    set status = 'revoked',
        status_reason = clean_reason,
        revoked_at = now_value,
        replaced_by_credential_uid = new_credential_uid,
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
      jsonb_build_object('new_credential_uid', new_credential_uid)
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
      'Nueva credencial emitida por sustitución.',
      jsonb_build_object('previous_credential_uid', target.credential_uid, 'replacement_reason', clean_reason)
    );

    return new_credential;
  end if;

  if normalized_action = 'suspend' then
    next_status := 'suspended';
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        suspended_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'revoke' then
    next_status := 'revoked';
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
    update public.official_credential_registry
    set status = next_status,
        status_reason = clean_reason,
        expires_at = coalesce(expires_at, current_date),
        expired_at = now_value,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'regenerate_qr' then
    raise exception 'Para generar un nuevo QR debe sustituirse la credencial y emitirse un nuevo ID.';
  elsif normalized_action in ('print', 'reprint') then
    update public.official_credential_registry
    set print_count = print_count + 1,
        last_printed_at = now_value,
        last_printed_by = actor.id,
        updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  elsif normalized_action = 'download_pdf' then
    update public.official_credential_registry
    set updated_at = now_value
    where credential_uid = target.credential_uid
    returning * into target;
  else
    raise exception 'Accion de credencial no soportada: %', p_action;
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
    jsonb_build_object('qr_version', target.qr_version, 'print_count', target.print_count)
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
begin
  select *
  into target
  from public.official_credential_registry
  where credential_uid = trim(coalesce(p_credential_uid, ''));

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
           'Esta credencial ya no es válida.';
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
    return query
    select target.credential_uid,
           target.subject_type,
           null::uuid,
           null::text,
           null::text,
           null::text,
           effective_status,
           public.official_credential_status_label(effective_status),
           coalesce(nullif(target.status_reason, ''), case when effective_status = 'expired' then 'Credencial caducada.' else 'Credencial no activa.' end),
           target.issued_at::date,
           target.expires_at,
           target.revoked_at,
           null::text,
           null::text,
           case
             when effective_status = 'expired' then 'Esta credencial ha caducado y ya no es válida.'
             else 'Esta credencial ya no es válida.'
           end;
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

grant execute on function public.verify_official_credential(text, integer) to anon, authenticated;
