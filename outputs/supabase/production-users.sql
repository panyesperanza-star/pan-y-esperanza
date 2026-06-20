-- Plantilla para vincular usuarios reales de Supabase Auth con perfiles internos.
-- 1. Crea primero el usuario en Supabase Dashboard > Authentication > Users.
-- 2. Copia el ID del usuario Auth.
-- 3. Ejecuta un insert por cada usuario, cambiando auth_user_id y email.

insert into public.app_users (
  auth_user_id,
  first_name,
  last_name,
  email,
  phone,
  role,
  position,
  is_active,
  permissions,
  permission_matrix,
  created_by
)
values (
  '00000000-0000-0000-0000-000000000000',
  'Elizabeth',
  '',
  'elizabeth@panyesperanza.org',
  '',
  'Superadministrador',
  'Superadministrador',
  true,
  '["*"]'::jsonb,
  '{}'::jsonb,
  'Sistema'
)
on conflict (email) do update
set auth_user_id = excluded.auth_user_id,
    role = excluded.role,
    position = excluded.position,
    is_active = excluded.is_active,
    permissions = excluded.permissions;

-- Roles recomendados:
-- Superadministrador: acceso completo.
-- Presidenta: direccion y gestion completa salvo configuraciones tecnicas sensibles si se ajustan permisos.
-- Secretaria: beneficiarios, familias, justificantes, informes y usuarios.
-- Tesorera: tesoreria, donaciones, informes y justificantes.
-- Coordinadora: beneficiarios, familias, entregas, justificantes, inventario e informes.
-- Voluntario: lectura y operaciones limitadas segun permission_matrix.
