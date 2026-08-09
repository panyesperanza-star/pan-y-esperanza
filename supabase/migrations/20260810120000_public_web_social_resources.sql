do $$
begin
  if to_regclass('public.social_resources') is not null then
    alter table public.social_resources
      add column if not exists publish_in_public_web boolean not null default false,
      add column if not exists public_web_featured boolean not null default false;

    create index if not exists social_resources_public_web_idx
      on public.social_resources(publish_in_public_web, public_web_featured, status, deadline_at, created_at);

    execute $view$
      create or replace view public.public_social_resources as
      select
        id,
        name,
        organization_name,
        category,
        description,
        requirements,
        opens_at,
        deadline_at,
        municipality,
        web_url,
        official_url,
        application_method,
        status,
        scope,
        last_verified_at,
        created_at,
        updated_at,
        public_web_featured
      from public.social_resources
      where publish_in_public_web = true
        and status in ('Activo', 'Proximamente')
        and (deadline_at is null or deadline_at >= current_date)
    $view$;

    grant select on public.public_social_resources to anon, authenticated;

    notify pgrst, 'reload schema';
  end if;
end $$;
