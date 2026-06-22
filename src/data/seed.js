import { todayISO } from '../lib/formatters';
import { ROLE_PERMISSION_MATRIX } from '../lib/constants';

export const seedData = {
  organization_settings: [
    {
      id: 'main',
      name: 'Pan y Esperanza',
      cif: 'G00000000',
      address: 'Calle Solidaridad 10, Madrid',
      phone: '910 000 000',
      email: 'info@panyesperanza.org',
      website: 'https://panyesperanza.org',
      logo_path: 'src/assets/logo-pan-y-esperanza.png',
      mail_sender_name: 'Pan y Esperanza',
      mail_sender_email: 'notificaciones@panyesperanza.org'
    }
  ],
  families: [
    {
      id: crypto.randomUUID(),
      family_code: 'FAM-0001',
      responsible_name: 'Maria Lopez Garcia',
      address: 'Calle Mayor 12, 2B, Madrid',
      phone: '600 111 222',
      email: 'maria.lopez@example.org',
      dependents_count: 1,
      notes: 'Unidad familiar con prioridad social.'
    }
  ],
  beneficiaries: [
    {
      id: crypto.randomUUID(),
      family_id: '',
      code: 'PYE-00001',
      full_name: 'Maria Lopez Garcia',
      document_id: '12345678A',
      address_full: 'Calle Mayor 12, 2B, Madrid',
      postal_code: '28013',
      phone: '600 111 222',
      email: 'maria.lopez@example.org',
      birth_date: '1988-04-14',
      sex: 'Mujer',
      nationality: 'Espanola',
      marital_status: 'Soltera',
      attached_document_name: '',
      first_attention_at: todayISO(),
      family_members: 4,
      minors_count: 2,
      situation: 'Urgente',
      requested_help: 'Alimentos',
      notes: 'Prioridad por menores a cargo.',
      joined_at: todayISO(),
      is_active: true,
      last_help_at: null
    },
    {
      id: crypto.randomUUID(),
      family_id: '',
      code: 'PYE-00002',
      full_name: 'Ahmed Benali',
      document_id: 'Y1234567B',
      address_full: 'Avenida del Parque 7, Getafe',
      postal_code: '28901',
      phone: '611 222 333',
      email: 'ahmed.benali@example.org',
      birth_date: '1979-09-02',
      sex: 'Hombre',
      nationality: 'Marroqui',
      marital_status: 'Casado',
      attached_document_name: '',
      first_attention_at: todayISO(),
      family_members: 2,
      minors_count: 0,
      situation: 'Seguimiento',
      requested_help: 'Higiene',
      notes: 'Pendiente de renovacion de documentacion.',
      joined_at: todayISO(),
      is_active: true,
      last_help_at: null
    }
  ],
  social_history: [],
  beneficiary_documents: [
    {
      id: crypto.randomUUID(),
      beneficiary_id: '',
      document_type: 'DNI/NIE / NIE O PASAPORTE',
      file_name: 'pendiente.pdf',
      file_data_url: '',
      uploaded_at: todayISO(),
      notes: 'Documento pendiente de digitalizacion.'
    }
  ],
  deliveries: [],
  email_logs: [],
  inventory_items: [
    { id: crypto.randomUUID(), name: 'Arroz', category: 'Alimentos', lot: 'AR-2026-01', expires_at: '2026-12-31', donor: 'Banco de Alimentos', location: 'Almacen A', unit: 'kg', stock: 50, low_stock_threshold: 20, notes: '' },
    { id: crypto.randomUUID(), name: 'Leche', category: 'Alimentos', lot: 'LE-2026-06', expires_at: '2026-07-15', donor: 'Supermercado Solidario', location: 'Camara 1', unit: 'litros', stock: 18, low_stock_threshold: 25, notes: 'Reponer esta semana.' },
    { id: crypto.randomUUID(), name: 'Gel de ducha', category: 'Higiene', lot: 'HG-2026-02', expires_at: '', donor: 'Donacion particular', location: 'Estanteria H', unit: 'unidades', stock: 40, low_stock_threshold: 15, notes: '' }
  ],
  inventory_movements: [],
  donations: [
    { id: crypto.randomUUID(), donor: 'Empresa Solidaria SL', donor_kind: 'Empresa', donation_type: 'Alimentos', donated_at: todayISO(), estimated_value: 450, notes: 'Entrega mensual de productos no perecederos.' }
  ],
  treasury_incomes: [
    { id: crypto.randomUUID(), income_at: todayISO(), category: 'Donaciones', concept: 'Donacion economica inicial', amount: 600, donor: 'Empresa Solidaria SL', payment_method: 'Transferencia', notes: 'Ingreso de ejemplo para tesoreria.', document_name: '' }
  ],
  treasury_expenses: [
    { id: crypto.randomUUID(), expense_at: todayISO(), category: 'Alimentacion', concept: 'Compra de alimentos frescos', amount: 180, supplier: 'Mercado local', responsible: 'Elizabeth', invoice_name: '', notes: 'Gasto de ejemplo para control de caja.' }
  ],
  treasury_loans: [
    { id: crypto.randomUUID(), person: 'Lucia Martin', loan_at: todayISO(), concept: 'Adelanto para transporte solidario', amount: 45, status: 'Pendiente de devolver', returned_at: '', notes: 'Pendiente de devolver al voluntario.' }
  ],
  treasury_accounts: [
    { id: crypto.randomUUID(), name: 'Caja principal', account_type: 'Caja efectivo', balance: 120, bank_name: '', account_number: '', movements: 'Entradas y salidas menores de sede.', notes: 'Efectivo disponible en sede.' },
    { id: crypto.randomUUID(), name: 'Cuenta operativa', account_type: 'Cuenta bancaria', balance: 1500, bank_name: 'Banco colaborador', account_number: 'ES00 0000 0000 0000 0000', movements: 'Transferencias, cuotas y subvenciones.', notes: 'Cuenta bancaria principal.' }
  ],
  volunteers: [
    { id: crypto.randomUUID(), full_name: 'Lucia Martin', document_id: '87654321Z', phone: '622 333 444', email: 'lucia@example.com', training: 'Manipulacion de alimentos', availability: 'Martes y jueves por la tarde', documentation: 'Seguro voluntariado', notes: 'Apoyo en almacen.' }
  ],
  volunteer_history: [],
  roles: [
    { id: 'superadmin', name: 'Superadministrador', modules: ['*'] },
    { id: 'president', name: 'Presidenta', modules: ['*'] },
    { id: 'treasurer', name: 'Tesorera', modules: ['donations', 'treasury', 'reports', 'receipts'] },
    { id: 'secretary', name: 'Secretaria', modules: ['beneficiaries', 'families', 'receipts', 'reports', 'users', 'settings'] },
    { id: 'volunteer', name: 'Voluntario', modules: ['beneficiaries', 'deliveries', 'inventory', 'treasury'] },
    { id: 'viewer', name: 'Consulta', modules: ['dashboard', 'reports'] }
  ],
  audit_logs: [],
  app_users: [
    {
      id: crypto.randomUUID(),
      first_name: 'Elizabeth',
      last_name: '',
      email: 'elizabeth@panyesperanza.org',
      password: 'Elizabeth2026!',
      phone: '',
      role: 'Superadministrador',
      position: 'Superadministrador',
      is_active: true,
      permissions: ['*'],
      permission_matrix: ROLE_PERMISSION_MATRIX.Superadministrador,
      profile_photo: '',
      last_access_at: '',
      created_by: 'Sistema',
      created_at: todayISO()
    }
  ]
};
