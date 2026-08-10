begin;

alter table public.community_posts
  add column if not exists expires_at date,
  add column if not exists resolution_status text not null default 'active',
  add column if not exists resolution_notes text not null default '',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references public.app_users(id) on delete set null,
  add column if not exists blocked_by_name text not null default '',
  add column if not exists blocked_reason text not null default '';

alter table public.community_posts
  drop constraint if exists community_posts_status_check;

alter table public.community_posts
  add constraint community_posts_status_check
  check (status in ('pending_review', 'approved', 'rejected', 'withdrawn', 'blocked'));

alter table public.community_posts
  drop constraint if exists community_posts_resolution_status_check;

alter table public.community_posts
  add constraint community_posts_resolution_status_check
  check (resolution_status in ('active', 'employment_filled', 'item_delivered', 'need_resolved', 'expired'));

alter table public.community_interests
  add column if not exists reviewed_by uuid references public.app_users(id) on delete set null,
  add column if not exists reviewed_by_name text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists status_notes text not null default '',
  add column if not exists closed_at timestamptz;

alter table public.community_interests
  drop constraint if exists community_interests_status_check;

alter table public.community_interests
  add constraint community_interests_status_check
  check (status in ('registered', 'new', 'reviewed', 'contacted', 'referred', 'closed', 'withdrawn', 'cancelled'));

update public.community_interests
set status = 'new'
where status = 'registered';

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  reason text not null default '',
  status text not null default 'new',
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_reports_status_check check (status in ('new', 'reviewed', 'dismissed')),
  constraint community_post_reports_unique unique (post_id, beneficiary_id)
);

create index if not exists community_posts_expires_idx on public.community_posts (expires_at);
create index if not exists community_posts_resolution_idx on public.community_posts (resolution_status, status);
create index if not exists community_interests_status_idx on public.community_interests (status, created_at);
create index if not exists community_post_reports_post_idx on public.community_post_reports (post_id);
create index if not exists community_post_reports_status_idx on public.community_post_reports (status, created_at);

drop trigger if exists community_post_reports_updated_at on public.community_post_reports;
create trigger community_post_reports_updated_at
before update on public.community_post_reports
for each row execute function public.set_updated_at();

alter table public.community_post_reports enable row level security;

drop policy if exists "community_post_reports_select_by_permission" on public.community_post_reports;
drop policy if exists "community_post_reports_insert_by_permission" on public.community_post_reports;
drop policy if exists "community_post_reports_update_by_permission" on public.community_post_reports;
drop policy if exists "community_post_reports_delete_by_permission" on public.community_post_reports;

create policy "community_post_reports_select_by_permission" on public.community_post_reports
for select to authenticated using (public.can_module_action('community-moderation', 'view'));
create policy "community_post_reports_insert_by_permission" on public.community_post_reports
for insert to authenticated with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_post_reports_update_by_permission" on public.community_post_reports
for update to authenticated using (public.can_module_action('community-moderation', 'edit')) with check (public.can_module_action('community-moderation', 'edit'));
create policy "community_post_reports_delete_by_permission" on public.community_post_reports
for delete to authenticated using (public.can_module_action('community-moderation', 'delete'));

grant select, insert, update, delete on public.community_post_reports to authenticated;

notify pgrst, 'reload schema';

commit;
