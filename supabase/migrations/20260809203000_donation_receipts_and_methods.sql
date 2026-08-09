alter table public.donations add column if not exists receipt_number text;
alter table public.donations add column if not exists receipt_generated_at timestamptz;
alter table public.donations add column if not exists receipt_sent_at timestamptz;
alter table public.donations add column if not exists receipt_status text not null default 'pending';
alter table public.donations add column if not exists receipt_email_provider_id text;
alter table public.donations add column if not exists receipt_email_log_id uuid;
alter table public.donations add column if not exists impact_report_generated_at timestamptz;
alter table public.donations add column if not exists campaign_id uuid;
alter table public.donations add column if not exists payment_method_config_key text;

alter table public.organization_settings
  add column if not exists donation_payment_methods jsonb not null
  default '["Efectivo","Transferencia","Tarjeta","Bizum","PayPal","Otro"]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_campaign_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_campaign_id_fkey
      foreign key (campaign_id) references public.campanas(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'donations_receipt_email_log_id_fkey'
  ) then
    alter table public.donations
      add constraint donations_receipt_email_log_id_fkey
      foreign key (receipt_email_log_id) references public.email_logs(id) on delete set null;
  end if;
end $$;

create unique index if not exists idx_donations_receipt_number_unique
  on public.donations(receipt_number)
  where receipt_number is not null and receipt_number <> '';

create index if not exists idx_donations_campaign_id on public.donations(campaign_id);
create index if not exists idx_donations_receipt_status on public.donations(receipt_status);

notify pgrst, 'reload schema';
