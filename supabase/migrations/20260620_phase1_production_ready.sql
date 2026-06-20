insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "authenticated_read_documentos" on storage.objects;
drop policy if exists "authenticated_write_documentos" on storage.objects;
create policy "authenticated_read_documentos" on storage.objects for select to authenticated using (bucket_id = 'documentos');
create policy "authenticated_write_documentos" on storage.objects for all to authenticated using (bucket_id = 'documentos') with check (bucket_id = 'documentos');

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
add constraint app_users_role_check
check (role in ('Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Voluntario', 'Coordinador', 'Presidente', 'Tesorero', 'Secretario', 'Administrador', 'Consulta'));

insert into public.roles (id, name, modules)
values
  ('superadmin', 'Superadministrador', '["*"]'::jsonb),
  ('presidenta', 'Presidenta', '["beneficiaries", "families", "deliveries", "receipts", "inventory", "donations", "treasury", "reports", "users", "settings"]'::jsonb),
  ('secretaria', 'Secretaria', '["beneficiaries", "families", "receipts", "reports", "users", "settings"]'::jsonb),
  ('tesorera', 'Tesorera', '["donations", "treasury", "reports", "receipts"]'::jsonb),
  ('volunteer', 'Voluntario', '["beneficiaries", "deliveries", "inventory", "treasury"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;
