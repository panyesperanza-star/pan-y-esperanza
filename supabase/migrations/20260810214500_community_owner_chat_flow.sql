begin;

alter table public.community_posts
  add column if not exists offer_status text not null default 'available',
  add column if not exists reserved_interest_id uuid references public.community_interests(id) on delete set null,
  add column if not exists reserved_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  add column if not exists reserved_at timestamptz,
  add column if not exists delivered_interest_id uuid references public.community_interests(id) on delete set null,
  add column if not exists delivered_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  add column if not exists delivered_at timestamptz;

alter table public.community_posts
  drop constraint if exists community_posts_offer_status_check;

alter table public.community_posts
  add constraint community_posts_offer_status_check
  check (offer_status in ('available', 'reserved', 'delivered'));

alter table public.community_interests
  drop constraint if exists community_interests_status_check;

alter table public.community_interests
  add constraint community_interests_status_check
  check (status in (
    'registered',
    'new',
    'reviewed',
    'contacted',
    'reserved',
    'completed',
    'not_selected',
    'referred',
    'closed',
    'withdrawn',
    'cancelled',
    'delivery_pending',
    'delivered',
    'not_completed'
  ));

create table if not exists public.community_conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  interest_id uuid not null references public.community_interests(id) on delete cascade,
  author_beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  interested_beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  status text not null default 'open',
  blocked_by_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  blocked_reason text not null default '',
  reported_by_beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  report_reason text not null default '',
  reported_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_conversations_status_check check (status in ('open', 'blocked', 'reported', 'closed', 'completed')),
  constraint community_conversations_unique_interest unique (interest_id),
  constraint community_conversations_unique_pair unique (post_id, interested_beneficiary_id)
);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.community_conversations(id) on delete cascade,
  sender_beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_messages_message_min check (char_length(trim(message)) >= 1)
);

create table if not exists public.community_post_recommendations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  recommended_by uuid references public.app_users(id) on delete set null,
  recommended_by_name text not null default '',
  notes text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_recommendations_status_check check (status in ('active', 'dismissed')),
  constraint community_post_recommendations_unique unique (post_id, beneficiary_id)
);

create index if not exists community_posts_offer_status_idx on public.community_posts (offer_status, status);
create index if not exists community_posts_reserved_beneficiary_idx on public.community_posts (reserved_beneficiary_id);
create index if not exists community_conversations_post_idx on public.community_conversations (post_id);
create index if not exists community_conversations_author_idx on public.community_conversations (author_beneficiary_id);
create index if not exists community_conversations_interested_idx on public.community_conversations (interested_beneficiary_id);
create index if not exists community_conversations_status_idx on public.community_conversations (status, updated_at);
create index if not exists community_messages_conversation_idx on public.community_messages (conversation_id, created_at);
create index if not exists community_messages_sender_idx on public.community_messages (sender_beneficiary_id);
create index if not exists community_post_recommendations_beneficiary_idx on public.community_post_recommendations (beneficiary_id, status);
create index if not exists community_post_recommendations_post_idx on public.community_post_recommendations (post_id, status);

drop trigger if exists community_conversations_updated_at on public.community_conversations;
create trigger community_conversations_updated_at
before update on public.community_conversations
for each row execute function public.set_updated_at();

drop trigger if exists community_messages_updated_at on public.community_messages;
create trigger community_messages_updated_at
before update on public.community_messages
for each row execute function public.set_updated_at();

drop trigger if exists community_post_recommendations_updated_at on public.community_post_recommendations;
create trigger community_post_recommendations_updated_at
before update on public.community_post_recommendations
for each row execute function public.set_updated_at();

alter table public.community_conversations enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_post_recommendations enable row level security;

drop policy if exists "community_conversations_select_by_permission" on public.community_conversations;
drop policy if exists "community_conversations_insert_by_permission" on public.community_conversations;
drop policy if exists "community_conversations_update_by_permission" on public.community_conversations;
drop policy if exists "community_conversations_delete_by_permission" on public.community_conversations;
drop policy if exists "community_messages_select_by_permission" on public.community_messages;
drop policy if exists "community_messages_insert_by_permission" on public.community_messages;
drop policy if exists "community_messages_update_by_permission" on public.community_messages;
drop policy if exists "community_messages_delete_by_permission" on public.community_messages;
drop policy if exists "community_post_recommendations_select_by_permission" on public.community_post_recommendations;
drop policy if exists "community_post_recommendations_insert_by_permission" on public.community_post_recommendations;
drop policy if exists "community_post_recommendations_update_by_permission" on public.community_post_recommendations;
drop policy if exists "community_post_recommendations_delete_by_permission" on public.community_post_recommendations;

create policy "community_conversations_select_by_permission" on public.community_conversations
for select to authenticated using (public.can_module_action('community-moderation', 'view'));
create policy "community_conversations_insert_by_permission" on public.community_conversations
for insert to authenticated with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_conversations_update_by_permission" on public.community_conversations
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_conversations_delete_by_permission" on public.community_conversations
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

create policy "community_messages_select_by_permission" on public.community_messages
for select to authenticated using (
  public.can_module_action('community-moderation', 'view')
  and exists (
    select 1
    from public.community_conversations c
    where c.id = community_messages.conversation_id
      and c.status in ('reported', 'blocked')
  )
);
create policy "community_messages_insert_by_permission" on public.community_messages
for insert to authenticated with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_messages_update_by_permission" on public.community_messages
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_messages_delete_by_permission" on public.community_messages
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

create policy "community_post_recommendations_select_by_permission" on public.community_post_recommendations
for select to authenticated using (public.can_module_action('community-moderation', 'view'));
create policy "community_post_recommendations_insert_by_permission" on public.community_post_recommendations
for insert to authenticated with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_post_recommendations_update_by_permission" on public.community_post_recommendations
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_post_recommendations_delete_by_permission" on public.community_post_recommendations
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

grant select, insert, update, delete on public.community_conversations to authenticated;
grant select, insert, update, delete on public.community_messages to authenticated;
grant select, insert, update, delete on public.community_post_recommendations to authenticated;

notify pgrst, 'reload schema';

commit;
