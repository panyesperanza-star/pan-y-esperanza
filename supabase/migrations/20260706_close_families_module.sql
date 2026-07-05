begin;

alter table public.families
  add column if not exists status text not null default 'Activa',
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.beneficiaries
  add column if not exists family_relationship text;

alter table public.social_history
  add column if not exists family_id uuid references public.families(id) on delete cascade;

alter table public.beneficiary_documents
  add column if not exists family_id uuid references public.families(id) on delete cascade;

update public.families
set status = coalesce(nullif(status, ''), 'Activa'),
    updated_at = coalesce(updated_at, created_at, now());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists families_updated_at on public.families;
create trigger families_updated_at
before update on public.families
for each row execute function public.set_updated_at();

create index if not exists beneficiaries_family_idx on public.beneficiaries (family_id);
create index if not exists beneficiary_documents_family_idx on public.beneficiary_documents (family_id, uploaded_at desc);
create index if not exists social_history_family_idx on public.social_history (family_id, date desc);

commit;
