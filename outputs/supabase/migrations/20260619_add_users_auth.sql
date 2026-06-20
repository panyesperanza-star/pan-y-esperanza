create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text,
  email text not null unique,
  password text,
  phone text,
  role text not null check (role in ('Superadministrador', 'Administrador', 'Tesorero', 'Coordinador', 'Voluntario', 'Consulta')),
  is_active boolean not null default true,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;

drop policy if exists "authenticated_read_app_users" on public.app_users;
drop policy if exists "authenticated_write_app_users" on public.app_users;

create policy "authenticated_read_app_users" on public.app_users for select to authenticated using (true);
create policy "authenticated_write_app_users" on public.app_users for all to authenticated using (true) with check (true);

insert into public.app_users (first_name, last_name, email, password, phone, role, is_active, permissions)
values ('Elizabeth', '', 'elizabeth@panyesperanza.org', 'Elizabeth2026!', '', 'Superadministrador', true, '["*"]'::jsonb)
on conflict (email) do nothing;
