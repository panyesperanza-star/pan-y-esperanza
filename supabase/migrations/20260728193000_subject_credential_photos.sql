alter table public.collaborators add column if not exists photo_url text;
alter table public.collaborators add column if not exists photo_data_url text;

alter table public.donors add column if not exists photo_url text;
alter table public.donors add column if not exists photo_data_url text;

update public.collaborators
set photo_data_url = impact ->> 'credential_photo_data_url'
where coalesce(photo_data_url, '') = ''
  and impact ? 'credential_photo_data_url';

update public.donors
set photo_data_url = impact ->> 'credential_photo_data_url'
where coalesce(photo_data_url, '') = ''
  and impact ? 'credential_photo_data_url';

update public.collaborators
set impact = impact - 'credential_photo_data_url'
where impact ? 'credential_photo_data_url';

update public.donors
set impact = impact - 'credential_photo_data_url'
where impact ? 'credential_photo_data_url';

comment on column public.collaborators.photo_url is
  'URL publica o firmada de la foto oficial del expediente del colaborador.';
comment on column public.collaborators.photo_data_url is
  'Foto oficial del expediente del colaborador utilizada por vistas previas y credenciales.';
comment on column public.donors.photo_url is
  'URL publica o firmada de la foto oficial del expediente del donante.';
comment on column public.donors.photo_data_url is
  'Foto oficial del expediente del donante utilizada por vistas previas y credenciales.';
