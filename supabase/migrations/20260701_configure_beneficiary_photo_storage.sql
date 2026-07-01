alter table public.beneficiaries
add column if not exists photo_url text;

alter table public.beneficiaries
add column if not exists photo_data_url text;

comment on column public.beneficiaries.photo_url is
  'Referencia estable storage://bucket/ruta de la fotografia privada del beneficiario.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beneficiary-photos',
  'beneficiary-photos',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "beneficiary_photos_select_by_permission" on storage.objects;
drop policy if exists "beneficiary_photos_insert_by_permission" on storage.objects;
drop policy if exists "beneficiary_photos_delete_by_permission" on storage.objects;

create policy "beneficiary_photos_select_by_permission"
on storage.objects for select to authenticated
using (
  bucket_id = 'beneficiary-photos'
  and public.can_app_permission('beneficiaries', 'view')
);

create policy "beneficiary_photos_insert_by_permission"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
  and public.can_app_permission('beneficiaries', 'edit')
);

create policy "beneficiary_photos_delete_by_permission"
on storage.objects for delete to authenticated
using (
  bucket_id = 'beneficiary-photos'
  and (storage.foldername(name))[1] = 'beneficiaries'
  and public.can_app_permission('beneficiaries', 'edit')
);
