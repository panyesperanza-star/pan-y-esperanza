revoke insert, update on public.inventory_items from authenticated;

grant insert (
  name,
  category,
  lot,
  expires_at,
  donor,
  location,
  unit,
  low_stock_threshold,
  notes,
  photo_url,
  photo_data_url
) on public.inventory_items to authenticated;

grant update (
  name,
  category,
  lot,
  expires_at,
  donor,
  location,
  unit,
  low_stock_threshold,
  notes,
  photo_url,
  photo_data_url
) on public.inventory_items to authenticated;

grant select, delete on public.inventory_items to authenticated;
