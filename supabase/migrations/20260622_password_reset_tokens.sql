create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists password_reset_tokens_email_idx on public.password_reset_tokens (lower(email));
create index if not exists password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

drop policy if exists "password_reset_tokens_no_client_access" on public.password_reset_tokens;
create policy "password_reset_tokens_no_client_access"
on public.password_reset_tokens
for all
to authenticated
using (false)
with check (false);
