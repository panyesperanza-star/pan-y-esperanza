-- Sprint ERP 13: firmas digitales de entregas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-signatures', 'delivery-signatures', false, 1048576, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.deliveries
  add column if not exists signature_storage_bucket text,
  add column if not exists signature_storage_path text,
  add column if not exists signature_signed_at timestamptz,
  add column if not exists responsible_signature_storage_bucket text,
  add column if not exists responsible_signature_storage_path text,
  add column if not exists responsible_signature_signed_at timestamptz;

drop policy if exists "delivery_signatures_select_by_permission" on storage.objects;
drop policy if exists "delivery_signatures_insert_by_permission" on storage.objects;
drop policy if exists "delivery_signatures_update_by_permission" on storage.objects;
drop policy if exists "delivery_signatures_delete_by_permission" on storage.objects;

create policy "delivery_signatures_select_by_permission" on storage.objects for select to authenticated using (
  bucket_id = 'delivery-signatures'
);
create policy "delivery_signatures_insert_by_permission" on storage.objects for insert to authenticated with check (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);
create policy "delivery_signatures_update_by_permission" on storage.objects for update to authenticated using (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
) with check (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);
create policy "delivery_signatures_delete_by_permission" on storage.objects for delete to authenticated using (
  bucket_id = 'delivery-signatures'
  and (storage.foldername(name))[1] = 'deliveries'
);