begin;

alter table public.app_users
  add column if not exists participates_as_volunteer boolean not null default false;

update public.app_users users
set participates_as_volunteer = true
where coalesce(users.participates_as_volunteer, false) = false
  and (
    users.role = 'Voluntario'
    or exists (
      select 1
      from public.volunteers volunteers
      where volunteers.person_identity_id is not null
        and volunteers.person_identity_id = users.person_identity_id
    )
  );

create index if not exists app_users_participates_as_volunteer_idx
  on public.app_users(participates_as_volunteer)
  where participates_as_volunteer is true;

notify pgrst, 'reload schema';

commit;
