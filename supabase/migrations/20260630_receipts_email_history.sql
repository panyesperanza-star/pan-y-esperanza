alter table public.email_logs
  add column if not exists provider_id text,
  add column if not exists status text not null default 'Enviado',
  add column if not exists receipt_ids jsonb not null default '[]'::jsonb;

update public.email_logs
set status = case
  when lower(coalesce(result, '')) like '%error%' then 'Error'
  else 'Enviado'
end
where status is null or status = '';

create index if not exists email_logs_sent_at_idx on public.email_logs (sent_at desc);
create index if not exists email_logs_provider_id_idx on public.email_logs (provider_id)
where provider_id is not null;
