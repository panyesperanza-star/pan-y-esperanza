insert into public.beneficiaries
  (code, full_name, document_id, address_full, postal_code, phone, email, family_members, minors_count, situation, requested_help, notes, joined_at, is_active)
values
  ('PYE-00001', 'Maria Lopez Garcia', '12345678A', 'Calle Mayor 12, 2B, Madrid', '28013', '600 111 222', 'maria.lopez@example.org', 4, 2, 'Urgente', 'Alimentos', 'Prioridad por menores a cargo.', current_date, true),
  ('PYE-00002', 'Ahmed Benali', 'Y1234567B', 'Avenida del Parque 7, Getafe', '28901', '611 222 333', 'ahmed.benali@example.org', 2, 0, 'Seguimiento', 'Higiene', 'Pendiente de renovacion de documentacion.', current_date, true)
on conflict (code) do nothing;

update public.beneficiary_sequence set last_value = greatest(last_value, 2) where id = 1;

insert into public.beneficiary_portal_accounts
  (beneficiary_id, access_identifier, pin_hash, pin_salt, pin_set_at, failed_access_attempts, email, phone, status, access_level, activated_at)
select id, 'PYE-MARIA7K3D', 'c7d80dec4eee973cfbafb8599528ea834326d33fa1e1d211bdc8a83f03fa1db3', 'demo-beneficiary-maria-2026', now(), 0, email, phone, 'active', 'beneficiary', now()
from public.beneficiaries
where code = 'PYE-00001'
on conflict (beneficiary_id) do nothing;

insert into public.beneficiary_portal_accounts
  (beneficiary_id, access_identifier, pin_hash, pin_salt, pin_set_at, failed_access_attempts, email, phone, status, access_level, activated_at)
select id, 'PYE-AHMED9Q2L', '61f9fff5693438730b8a61ce6c64a12e67c09cc2cb127150612ab7ae0bd5c453', 'demo-beneficiary-ahmed-2026', now(), 0, email, phone, 'active', 'beneficiary', now()
from public.beneficiaries
where code = 'PYE-00002'
on conflict (beneficiary_id) do nothing;

insert into public.inventory_items (name, category, unit, stock, low_stock_threshold, notes)
values
  ('Arroz', 'Alimentos', 'kg', 50, 20, ''),
  ('Leche', 'Alimentos', 'litros', 18, 25, 'Reponer esta semana.'),
  ('Gel de ducha', 'Higiene', 'unidades', 40, 15, '');

insert into public.categorias_recursos (slug, nombre, icono, descripcion, orden, sort_order, activa, estado)
values
  ('formacion', 'Formacion', 'book-open', '', 10, 10, true, 'active'),
  ('empleo', 'Empleo', 'briefcase', '', 20, 20, true, 'active'),
  ('ayudas', 'Ayudas', 'landmark', '', 30, 30, true, 'active'),
  ('familias', 'Familias', 'users', '', 40, 40, true, 'active'),
  ('salud', 'Salud', 'heart-pulse', '', 50, 50, true, 'active'),
  ('vivienda', 'Vivienda', 'home', '', 60, 60, true, 'active'),
  ('tramites', 'Tramites', 'file-text', '', 70, 70, true, 'active'),
  ('alimentacion', 'Alimentacion', 'utensils', '', 80, 80, true, 'active')
on conflict (slug) do update
set nombre = excluded.nombre,
    icono = excluded.icono,
    descripcion = excluded.descripcion,
    orden = excluded.orden,
    sort_order = excluded.sort_order,
    activa = excluded.activa,
    estado = excluded.estado;

insert into public.volunteers (full_name, phone, email, availability, notes)
values ('Lucia Martin', '622 333 444', 'lucia@example.com', 'Martes y jueves por la tarde', 'Apoyo en almacen.');

with campaign as (
  insert into public.campanas (name, description, start_date, status, responsible, observations)
  values ('Reparto semanal de alimentos', 'Planificacion flexible de entregas segun necesidades familiares, stock y voluntariado disponible.', current_date, 'Activa', 'Elizabeth', 'Priorizar familias con menores y productos proximos a caducar.')
  returning id
),
beneficiary as (
  select id from public.beneficiaries where code = 'PYE-00001' limit 1
),
relation as (
  insert into public.campana_beneficiarios (campaign_id, beneficiary_id)
  select campaign.id, beneficiary.id from campaign, beneficiary
  on conflict do nothing
  returning id
)
insert into public.agenda_operativa (title, description, event_type, status, event_at, campaign_id, responsible, beneficiary_id, origin_module, priority, notes)
select 'Preparar entregas prioritarias', 'Organizar productos disponibles para familias con prioridad social.', 'Entrega', 'Programado', current_date + time '10:00', campaign.id, 'Elizabeth', beneficiary.id, 'agenda', 'Alta', 'Revisar stock antes de confirmar entregas.'
from campaign, beneficiary;

insert into public.notificaciones (tipo, prioridad, modulo, origen, titulo, mensaje, estado, leida, entity_type, action_url, dedupe_key, metadata)
values
  ('warning', 'warning', 'inventory', 'Inventario', 'Stock minimo', 'Hay productos que deben revisarse antes de preparar nuevas entregas.', 'Pendiente', false, 'inventory', '/inventory', 'demo-inventory-low-stock', '{}'::jsonb),
  ('reminder', 'reminder', 'beneficiaries', 'Beneficiarios', 'Documentacion pendiente', 'Revisa los expedientes con documentacion pendiente de actualizacion.', 'Pendiente', false, 'beneficiary', '/beneficiaries', 'demo-beneficiary-document-pending', '{}'::jsonb);

insert into public.treasury_incomes (income_at, category, concept, amount, donor, payment_method, notes)
values (current_date, 'Donaciones', 'Donacion economica inicial', 600, 'Empresa Solidaria SL', 'Transferencia', 'Ingreso de ejemplo para tesoreria.');

insert into public.treasury_expenses (expense_at, category, concept, amount, supplier, responsible, notes)
values (current_date, 'Alimentacion', 'Compra de alimentos frescos', 180, 'Mercado local', 'Elizabeth', 'Gasto de ejemplo para control de caja.');

insert into public.treasury_loans (person, loan_at, concept, amount, status, notes)
values ('Lucia Martin', current_date, 'Adelanto para transporte solidario', 45, 'Pendiente de devolver', 'Pendiente de devolver al voluntario.');

insert into public.treasury_accounts (name, account_type, balance, bank_name, account_number, notes)
values
  ('Caja principal', 'Caja efectivo', 120, '', '', 'Efectivo disponible en sede.'),
  ('Cuenta operativa', 'Cuenta bancaria', 1500, 'Banco colaborador', 'ES00 0000 0000 0000 0000', 'Cuenta bancaria principal.');

insert into public.roles (id, name, modules)
values
  ('superadmin', 'Superadministrador', '["*"]'::jsonb),
  ('presidenta', 'Presidenta', '["notifications", "agenda", "beneficiaries", "families", "deliveries", "receipts", "inventory", "donations", "treasury", "reports", "users", "settings"]'::jsonb),
  ('tesorera', 'Tesorera', '["notifications", "agenda", "donations", "treasury", "reports", "receipts"]'::jsonb),
  ('secretaria', 'Secretaria', '["notifications", "agenda", "beneficiaries", "families", "receipts", "reports", "users", "settings"]'::jsonb),
  ('coordinator', 'Coordinador', '["notifications", "agenda", "beneficiaries", "families", "deliveries", "inventory", "treasury", "receipts", "reports"]'::jsonb),
  ('volunteer', 'Voluntario', '["notifications", "agenda", "beneficiaries", "deliveries", "inventory", "treasury"]'::jsonb),
  ('viewer', 'Consulta', '["notifications", "agenda", "dashboard", "reports"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;

insert into public.app_users (first_name, last_name, email, phone, role, position, is_active, permissions, created_by)
values ('Elizabeth', '', 'elizabeth@panyesperanza.org', '', 'Superadministrador', 'Superadministrador', true, '["*"]'::jsonb, 'Sistema')
on conflict (email) do nothing;
