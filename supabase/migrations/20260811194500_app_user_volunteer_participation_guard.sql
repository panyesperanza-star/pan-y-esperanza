begin;

update public.app_users users
set participates_as_volunteer = false
where coalesce(users.participates_as_volunteer, false) = true
  and not exists (
    select 1
    from public.volunteers volunteers
    where volunteers.person_identity_id is not null
      and volunteers.person_identity_id = users.person_identity_id
  );

notify pgrst, 'reload schema';

commit;
