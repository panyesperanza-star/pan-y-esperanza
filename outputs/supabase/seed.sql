insert into public.beneficiaries
  (code, full_name, document_id, address_full, postal_code, phone, email, family_members, minors_count, situation, requested_help, notes, joined_at, is_active)
values
  ('PYE-00001', 'Maria Lopez Garcia', '12345678A', 'Calle Mayor 12, 2B, Madrid', '28013', '600 111 222', 'maria.lopez@example.org', 4, 2, 'Urgente', 'Alimentos', 'Prioridad por menores a cargo.', current_date, true),
  ('PYE-00002', 'Ahmed Benali', 'Y1234567B', 'Avenida del Parque 7, Getafe', '28901', '611 222 333', 'ahmed.benali@example.org', 2, 0, 'Seguimiento', 'Higiene', 'Pendiente de renovacion de documentacion.', current_date, true)
on conflict (code) do nothing;

update public.beneficiary_sequence set last_value = greatest(last_value, 2) where id = 1;

insert into public.inventory_items (name, category, unit, stock, low_stock_threshold, estimated_value, notes)
values
  ('Arroz', 'Alimentos', 'kg', 50, 20, 65, ''),
  ('Leche', 'Alimentos', 'litros', 18, 25, 21.6, 'Reponer esta semana.'),
  ('Gel de ducha', 'Higiene', 'unidades', 40, 15, 80, '');

insert into public.donors (name, contact_name, phone, email, donor_type, estimated_value, notes)
values
  ('Empresa Solidaria SL', 'Ana Ruiz', '910 222 333', 'ana@empresasolidaria.example', 'Empresa', 450, 'Colaborador mensual de alimentos.'),
  ('Iglesia Comunidad Esperanza', 'Pastora Isabel', '911 444 555', 'contacto@comunidadesperanza.example', 'Iglesia', 180, 'Campanas puntuales de higiene.');

insert into public.volunteers (full_name, phone, email, availability, notes)
values ('Lucia Martin', '622 333 444', 'lucia@example.com', 'Martes y jueves por la tarde', 'Apoyo en almacen.');

insert into public.treasury_incomes (income_at, category, concept, amount, donor, payment_method, notes)
values (current_date, 'Donaciones economicas', 'Donacion economica inicial', 600, 'Empresa Solidaria SL', 'Transferencia', 'Ingreso de ejemplo para tesoreria.');

insert into public.treasury_expenses (expense_at, category, concept, amount, supplier, responsible, notes)
values (current_date, 'Compra de alimentos', 'Compra de alimentos frescos', 180, 'Mercado local', 'Elizabeth', 'Gasto de ejemplo para control de caja.');

insert into public.treasury_loans (person, loan_at, concept, amount, status, notes)
values ('Lucia Martin', current_date, 'Adelanto para transporte solidario', 45, 'Pendiente de devolver', 'Pendiente de devolver al voluntario.');

insert into public.treasury_accounts (name, account_type, balance, bank_name, account_number, notes)
values
  ('Caja principal', 'Caja efectivo', 120, '', '', 'Efectivo disponible en sede.'),
  ('Cuenta operativa', 'Cuenta bancaria', 1500, 'Banco colaborador', 'ES00 0000 0000 0000 0000', 'Cuenta bancaria principal.');

insert into public.roles (id, name, modules)
values
  ('superadmin', 'Superadministrador', '["*"]'::jsonb),
  ('presidenta', 'Presidenta', '["beneficiaries", "families", "deliveries", "receipts", "inventory", "donations", "treasury", "reports", "users", "settings"]'::jsonb),
  ('tesorera', 'Tesorera', '["donations", "treasury", "reports", "receipts"]'::jsonb),
  ('secretaria', 'Secretaria', '["beneficiaries", "families", "receipts", "reports", "users", "settings"]'::jsonb),
  ('coordinator', 'Coordinadora', '["beneficiaries", "families", "deliveries", "receipts", "inventory", "reports"]'::jsonb),
  ('volunteer', 'Voluntario', '["beneficiaries", "deliveries", "inventory", "treasury"]'::jsonb),
  ('viewer', 'Consulta', '["dashboard", "reports"]'::jsonb)
on conflict (id) do update
set name = excluded.name,
    modules = excluded.modules;

insert into public.app_users (first_name, last_name, email, password, phone, role, position, is_active, permissions, created_by)
values ('Elizabeth', '', 'elizabeth@panyesperanza.org', 'Elizabeth2026!', '', 'Superadministrador', 'Superadministrador', true, '["*"]'::jsonb, 'Sistema')
on conflict (email) do nothing;
