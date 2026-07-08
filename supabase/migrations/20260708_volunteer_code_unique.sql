-- Evita codigos de voluntario duplicados y sanea los registros existentes.
do $$
declare
  volunteer_row record;
  used_codes text[] := array[]::text[];
  meta_text text;
  meta jsonb;
  visible_notes text;
  current_code text;
  code_year text;
  next_number integer;
  candidate text;
begin
  for volunteer_row in
    select id, notes, created_at
    from public.volunteers
    order by coalesce(created_at, now()), id
  loop
    meta_text := substring(coalesce(volunteer_row.notes, '') from '\[PYE_VOLUNTEER_META\]\s*(\{.*\})\s*\[/PYE_VOLUNTEER_META\]');

    begin
      meta := coalesce(meta_text, '{}')::jsonb;
    exception when others then
      meta := '{}'::jsonb;
    end;

    current_code := upper(trim(coalesce(meta->>'code', '')));
    code_year := substring(current_code from '^VOL-([0-9]{4})-[0-9]{4}$');

    if code_year is null then
      code_year := to_char(coalesce(volunteer_row.created_at, now()), 'YYYY');
    end if;

    if current_code !~ '^VOL-[0-9]{4}-[0-9]{4}$' or current_code = any(used_codes) then
      next_number := 1;

      loop
        candidate := 'VOL-' || code_year || '-' || lpad(next_number::text, 4, '0');
        exit when candidate <> all(used_codes);
        next_number := next_number + 1;
      end loop;

      current_code := candidate;
    end if;

    used_codes := array_append(used_codes, current_code);
    meta := meta || jsonb_build_object('code', current_code);
    visible_notes := btrim(regexp_replace(coalesce(volunteer_row.notes, ''), '\[PYE_VOLUNTEER_META\]\s*\{.*\}\s*\[/PYE_VOLUNTEER_META\]\s*', '', 'g'));

    update public.volunteers
    set notes = concat_ws(E'\n',
      '[PYE_VOLUNTEER_META]',
      meta::text,
      '[/PYE_VOLUNTEER_META]',
      nullif(visible_notes, '')
    )
    where id = volunteer_row.id;
  end loop;
end $$;

drop index if exists public.volunteers_code_unique_idx;

create unique index volunteers_code_unique_idx
  on public.volunteers (
    upper(substring(
      coalesce(notes, '')
      from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'
    ))
  )
  where substring(
    coalesce(notes, '')
    from '\[PYE_VOLUNTEER_META\]\s*\{[^}]*"code"\s*:\s*"([^"]+)"'
  ) is not null;
