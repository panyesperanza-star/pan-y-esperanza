alter table public.beneficiaries
add column if not exists photo_data_url text;

comment on column public.beneficiaries.photo_data_url is
  'Fotografia optimizada del beneficiario en formato data URL. La interfaz limita resolucion, formato y peso antes de guardar.';
