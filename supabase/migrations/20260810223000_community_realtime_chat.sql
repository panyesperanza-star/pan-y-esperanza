begin;

alter table public.community_conversations
  add column if not exists realtime_topic text;

update public.community_conversations
set realtime_topic = gen_random_uuid()::text
where nullif(trim(coalesce(realtime_topic, '')), '') is null;

alter table public.community_conversations
  alter column realtime_topic set default gen_random_uuid()::text;

alter table public.community_messages
  add column if not exists sent_at timestamptz,
  add column if not exists message_type text not null default 'user',
  add column if not exists system_event text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.community_messages
set sent_at = coalesce(sent_at, created_at, now())
where sent_at is null;

alter table public.community_messages
  alter column sent_at set default now(),
  alter column sent_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'community_messages_type_check'
      and conrelid = 'public.community_messages'::regclass
  ) then
    alter table public.community_messages
      add constraint community_messages_type_check
      check (message_type in ('user', 'system'));
  end if;
end;
$$;

create unique index if not exists community_conversations_realtime_topic_idx
on public.community_conversations (realtime_topic);

create index if not exists community_messages_sent_at_idx
on public.community_messages (conversation_id, sent_at);

create or replace function public.community_message_realtime_notify()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  topic_value text;
begin
  select c.realtime_topic
  into topic_value
  from public.community_conversations c
  where c.id = coalesce(new.conversation_id, old.conversation_id);

  if nullif(trim(coalesce(topic_value, '')), '') is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'conversation_id', coalesce(new.conversation_id, old.conversation_id),
      'message_id', coalesce(new.id, old.id),
      'operation', tg_op,
      'sent_at', coalesce(new.sent_at, old.sent_at),
      'updated_at', coalesce(new.updated_at, old.updated_at)
    ),
    'community_message',
    'community:' || topic_value,
    false
  );

  return null;
end;
$$;

drop trigger if exists community_messages_realtime_notify on public.community_messages;
create trigger community_messages_realtime_notify
after insert or update on public.community_messages
for each row execute function public.community_message_realtime_notify();

notify pgrst, 'reload schema';

commit;
