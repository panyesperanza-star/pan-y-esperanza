alter table public.deliveries
add column if not exists receiver_name text,
add column if not exists receiver_document_id text,
add column if not exists reception_at timestamptz,
add column if not exists signature_data_url text,
add column if not exists responsible_signature_data_url text,
add column if not exists receipt_number text;

create unique index if not exists deliveries_receipt_number_unique_idx
on public.deliveries (receipt_number)
where receipt_number is not null;

alter table public.beneficiaries
add column if not exists email text;
