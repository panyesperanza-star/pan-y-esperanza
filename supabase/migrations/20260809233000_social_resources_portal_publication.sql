begin;

alter table public.social_resources
  add column if not exists visible_to_all_beneficiaries boolean not null default false,
  add column if not exists publish_in_beneficiary_portal boolean not null default false;

create index if not exists social_resources_portal_publication_idx
  on public.social_resources(publish_in_beneficiary_portal, visible_to_all_beneficiaries, status, deadline_at);

notify pgrst, 'reload schema';

commit;
