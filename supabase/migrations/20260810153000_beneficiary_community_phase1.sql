begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-post-photos',
  'community-post-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  category text not null,
  title text not null,
  zone text not null default '',
  description text not null default '',
  photo_storage_bucket text not null default '',
  photo_storage_path text not null default '',
  photo_file_name text not null default '',
  photo_mime_type text not null default '',
  job_position text not null default '',
  company_name text not null default '',
  workday text not null default '',
  schedule text not null default '',
  requirements text not null default '',
  deadline_at date,
  contact_method text not null default 'Gestionado por Pan y Esperanza',
  status text not null default 'pending_review',
  moderation_notes text not null default '',
  rejection_reason text not null default '',
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_category_check check (category in ('employment', 'offer', 'need')),
  constraint community_posts_status_check check (status in ('pending_review', 'approved', 'rejected', 'withdrawn')),
  constraint community_posts_title_min check (char_length(trim(title)) >= 3),
  constraint community_posts_description_min check (char_length(trim(description)) >= 10),
  constraint community_posts_zone_min check (char_length(trim(zone)) >= 2)
);

create table if not exists public.community_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  status text not null default 'registered',
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_interests_status_check check (status in ('registered', 'cancelled')),
  constraint community_interests_unique unique (post_id, beneficiary_id)
);

create index if not exists community_posts_beneficiary_idx on public.community_posts (beneficiary_id);
create index if not exists community_posts_status_idx on public.community_posts (status, created_at);
create index if not exists community_posts_category_idx on public.community_posts (category);
create index if not exists community_interests_post_idx on public.community_interests (post_id);
create index if not exists community_interests_beneficiary_idx on public.community_interests (beneficiary_id);

drop trigger if exists community_posts_updated_at on public.community_posts;
create trigger community_posts_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

drop trigger if exists community_interests_updated_at on public.community_interests;
create trigger community_interests_updated_at
before update on public.community_interests
for each row execute function public.set_updated_at();

alter table public.community_posts enable row level security;
alter table public.community_interests enable row level security;

drop policy if exists "community_posts_select_by_permission" on public.community_posts;
drop policy if exists "community_posts_insert_by_permission" on public.community_posts;
drop policy if exists "community_posts_update_by_permission" on public.community_posts;
drop policy if exists "community_posts_delete_by_permission" on public.community_posts;

create policy "community_posts_select_by_permission" on public.community_posts
for select to authenticated using (public.can_module_action('community-moderation', 'view'));
create policy "community_posts_insert_by_permission" on public.community_posts
for insert to authenticated with check (public.can_module_action('community-moderation', 'create'));
create policy "community_posts_update_by_permission" on public.community_posts
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_posts_delete_by_permission" on public.community_posts
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

drop policy if exists "community_interests_select_by_permission" on public.community_interests;
drop policy if exists "community_interests_insert_by_permission" on public.community_interests;
drop policy if exists "community_interests_update_by_permission" on public.community_interests;
drop policy if exists "community_interests_delete_by_permission" on public.community_interests;

create policy "community_interests_select_by_permission" on public.community_interests
for select to authenticated using (public.can_module_action('community-moderation', 'view'));
create policy "community_interests_insert_by_permission" on public.community_interests
for insert to authenticated with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_interests_update_by_permission" on public.community_interests
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_interests_delete_by_permission" on public.community_interests
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

drop policy if exists "community_post_photos_select_by_permission" on storage.objects;
drop policy if exists "community_post_photos_insert_by_permission" on storage.objects;
drop policy if exists "community_post_photos_update_by_permission" on storage.objects;
drop policy if exists "community_post_photos_delete_by_permission" on storage.objects;

create policy "community_post_photos_select_by_permission" on storage.objects
for select to authenticated using (
  bucket_id = 'community-post-photos'
  and public.can_module_action('community-moderation', 'view')
);

create policy "community_post_photos_insert_by_permission" on storage.objects
for insert to authenticated with check (
  bucket_id = 'community-post-photos'
  and public.can_module_action('community-moderation', 'edit')
);

create policy "community_post_photos_update_by_permission" on storage.objects
for update to authenticated using (
  bucket_id = 'community-post-photos'
  and public.can_module_action('community-moderation', 'edit')
) with check (
  bucket_id = 'community-post-photos'
  and public.can_module_action('community-moderation', 'edit')
);

create policy "community_post_photos_delete_by_permission" on storage.objects
for delete to authenticated using (
  bucket_id = 'community-post-photos'
  and public.can_module_action('community-moderation', 'delete')
);

grant select, insert, update, delete on public.community_posts to authenticated;
grant select, insert, update, delete on public.community_interests to authenticated;

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["community-moderation"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{community-moderation}', '{"view":true,"create":true,"edit":true,"delete":true}'::jsonb, true)
      else permission_matrix
    end
where role in ('Presidenta', 'Administrador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'community-moderation');

update public.app_users
set permissions = coalesce(permissions, '[]'::jsonb) || '["community-moderation"]'::jsonb,
    permission_matrix = case
      when coalesce(permission_matrix, '{}'::jsonb) <> '{}'::jsonb
        then jsonb_set(coalesce(permission_matrix, '{}'::jsonb), '{community-moderation}', '{"view":true,"create":false,"edit":true,"delete":false}'::jsonb, true)
      else permission_matrix
    end
where role in ('Secretaria', 'Coordinadora', 'Coordinador')
  and not (coalesce(permissions, '[]'::jsonb) ? '*')
  and not (coalesce(permissions, '[]'::jsonb) ? 'community-moderation');

notify pgrst, 'reload schema';

commit;
