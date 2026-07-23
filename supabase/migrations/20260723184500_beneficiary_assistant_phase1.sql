create table if not exists public.beneficiary_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  portal_session_id uuid references public.portal_sessions(id) on delete set null,
  session_id text,
  category text not null default 'general',
  user_message text not null,
  assistant_response text not null,
  action_performed text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint beneficiary_assistant_user_message_length check (char_length(user_message) <= 1200),
  constraint beneficiary_assistant_response_length check (char_length(assistant_response) <= 3000)
);

create index if not exists beneficiary_assistant_messages_beneficiary_idx
  on public.beneficiary_assistant_messages (beneficiary_id, created_at desc);

create index if not exists beneficiary_assistant_messages_session_idx
  on public.beneficiary_assistant_messages (portal_session_id, created_at desc);

create index if not exists beneficiary_assistant_messages_category_idx
  on public.beneficiary_assistant_messages (category, created_at desc);

alter table public.beneficiary_assistant_messages enable row level security;

revoke all on table public.beneficiary_assistant_messages from anon;
revoke all on table public.beneficiary_assistant_messages from authenticated;
