begin;

alter table public.community_interests
  drop constraint if exists community_interests_status_check;

alter table public.community_interests
  add constraint community_interests_status_check
  check (status in (
    'registered',
    'new',
    'reviewed',
    'contacted',
    'delivery_pending',
    'delivered',
    'not_completed',
    'referred',
    'closed',
    'withdrawn',
    'cancelled'
  ));

notify pgrst, 'reload schema';

commit;
