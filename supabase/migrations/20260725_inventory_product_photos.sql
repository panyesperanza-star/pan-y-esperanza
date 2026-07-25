alter table public.inventory_items
add column if not exists photo_url text;

alter table public.inventory_items
add column if not exists photo_data_url text;

comment on column public.inventory_items.photo_url is
  'Referencia estable storage://bucket/ruta de la fotografia privada del producto.';

comment on column public.inventory_items.photo_data_url is
  'Imagen optimizada del producto en formato data URL para desarrollo local sin Supabase.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-product-photos',
  'inventory-product-photos',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "inventory_product_photos_select_by_permission" on storage.objects;
drop policy if exists "inventory_product_photos_insert_by_permission" on storage.objects;
drop policy if exists "inventory_product_photos_delete_by_permission" on storage.objects;

create policy "inventory_product_photos_select_by_permission"
on storage.objects for select to authenticated
using (
  bucket_id = 'inventory-product-photos'
  and public.can_app_permission('inventory', 'view')
);

create policy "inventory_product_photos_insert_by_permission"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inventory-product-photos'
  and (storage.foldername(name))[1] = 'products'
  and public.can_app_permission('inventory', 'edit')
);

create policy "inventory_product_photos_delete_by_permission"
on storage.objects for delete to authenticated
using (
  bucket_id = 'inventory-product-photos'
  and (storage.foldername(name))[1] = 'products'
  and public.can_app_permission('inventory', 'edit')
);
