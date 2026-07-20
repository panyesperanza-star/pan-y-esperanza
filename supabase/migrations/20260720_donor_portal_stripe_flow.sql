alter table public.donations add column if not exists stripe_session_id text;
alter table public.donations add column if not exists stripe_payment_intent_id text;
alter table public.donations add column if not exists stripe_customer_id text;

create unique index if not exists idx_donations_stripe_session_id_unique
  on public.donations(stripe_session_id)
  where stripe_session_id is not null;

create index if not exists idx_donations_stripe_payment_intent
  on public.donations(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_donations_stripe_customer
  on public.donations(stripe_customer_id)
  where stripe_customer_id is not null;