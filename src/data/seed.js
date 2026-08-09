import { todayISO } from '../lib/formatters';
import { ROLE_PERMISSION_MATRIX } from '../lib/constants';

const demoFamilyId = crypto.randomUUID();
const demoBeneficiaryMariaId = crypto.randomUUID();
const demoBeneficiaryAhmedId = crypto.randomUUID();
const demoCampaignId = crypto.randomUUID();
const demoAgendaEventId = crypto.randomUUID();
const demoCollaboratorId = crypto.randomUUID();
const demoDonorId = crypto.randomUUID();

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
      id: demoFamilyId,
      family_code: 'FAM-0001',
      responsible_name: 'Maria Lopez Garcia',
      address: 'Calle Mayor 12, 2B, Madrid',
      phone: '600 111 222',
      email: 'maria.lopez@example.org',
      dependents_count: 1,
      status: 'Urgente',
      notes: 'Unidad familiar con prioridad social.'
    }
  ],
  beneficiaries: [
    {
      id: demoBeneficiaryMariaId,
      family_id: demoFamilyId,
      family_relationship: 'Responsable',
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
      id: demoBeneficiaryAhmedId,
      family_id: '',
      family_relationship: '',
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
      beneficiary_id: demoBeneficiaryMariaId,
      family_id: demoFamilyId,
      document_type: 'DNI/NIE / NIE O PASAPORTE',
      file_name: 'pendiente.pdf',
      file_data_url: '',
      uploaded_at: todayISO(),
      notes: 'Documento pendiente de digitalizacion.'
    }
  ],
  beneficiary_portal_accounts: [
    {
      id: crypto.randomUUID(),
      beneficiary_id: demoBeneficiaryMariaId,
      access_identifier: 'PYE-MARIA7K3D',
      pin_hash: 'c7d80dec4eee973cfbafb8599528ea834326d33fa1e1d211bdc8a83f03fa1db3',
      pin_salt: 'demo-beneficiary-maria-2026',
      pin_set_at: new Date().toISOString(),
      failed_access_attempts: 0,
      locked_until: null,
      email: 'maria.lopez@example.org',
      phone: '600 111 222',
      status: 'active',
      access_level: 'beneficiary',
      activated_at: new Date().toISOString(),
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      beneficiary_id: demoBeneficiaryAhmedId,
      access_identifier: 'PYE-AHMED9Q2L',
      pin_hash: '61f9fff5693438730b8a61ce6c64a12e67c09cc2cb127150612ab7ae0bd5c453',
      pin_salt: 'demo-beneficiary-ahmed-2026',
      pin_set_at: new Date().toISOString(),
      failed_access_attempts: 0,
      locked_until: null,
      email: 'ahmed.benali@example.org',
      phone: '611 222 333',
      status: 'active',
      access_level: 'beneficiary',
      activated_at: new Date().toISOString(),
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  beneficiary_portal_otps: [],
  beneficiary_portal_notices: [],
  beneficiary_portal_renewals: [],
  beneficiary_portal_profile_updates: [],
  collaborators: [
    {
      id: demoCollaboratorId,
      code: 'COL-000001',
      type: 'Empresa',
      name: 'Empresa Solidaria SL',
      tax_id: '',
      contact_name: 'Ana Ruiz',
      email: 'colaborador@example.org',
      access_email: 'colaborador@example.org',
      phone: '699 111 222',
      address: 'Calle de la Ayuda 21, Madrid',
      logo_path: '',
      status: 'Activo',
      is_active: true,
      portal_status: 'Activo',
      last_otp_sent_at: null,
      last_access_at: null,
      portal_activated_at: new Date().toISOString(),
      portal_deactivated_at: null,
      impact: {
        familiesServed: 186,
        minorsServed: 73,
        foodKg: 4280,
        deliveriesCompleted: 1250,
        campaignsSupported: 12
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  collaborator_portal_otps: [],
  collaborator_portal_profile_updates: [],
  collaborator_portal_requests: [],
  collaborator_certificates: [
    {
      id: crypto.randomUUID(),
      collaborator_id: demoCollaboratorId,
      title: 'Certificado anual de donaciones 2026',
      certificate_type: 'annual',
      status: 'Disponible',
      issued_at: todayISO(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      collaborator_id: demoCollaboratorId,
      title: 'Certificado individual - Alimentos',
      certificate_type: 'individual',
      status: 'Disponible',
      issued_at: todayISO(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  donors: [
    {
      id: demoDonorId,
      code: 'DON-000001',
      name: 'Laura Martin',
      email: 'donante@example.org',
      access_email: 'donante@example.org',
      phone: '600 222 111',
      address: '',
      type: 'Particular',
      status: 'Activo',
      is_active: true,
      portal_status: 'Activo',
      last_otp_sent_at: null,
      last_access_at: null,
      portal_activated_at: new Date().toISOString(),
      portal_deactivated_at: null,
      notes: '',
      impact: {
        familiesServed: 186,
        minorsServed: 73,
        foodKg: 4280,
        deliveriesCompleted: 1250,
        campaignsSupported: 12
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  donor_portal_otps: [],
  donor_portal_profile_updates: [],
  donor_certificates: [
    {
      id: crypto.randomUUID(),
      donor_id: demoDonorId,
      title: 'Certificado anual 2026',
      certificate_type: 'annual',
      status: 'Disponible',
      issued_at: todayISO(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      donor_id: demoDonorId,
      title: 'Certificado individual - Donacion economica',
      certificate_type: 'individual',
      status: 'Disponible',
      issued_at: todayISO(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  portal_sessions: [],
  deliveries: [],
  email_logs: [],
  inventory_items: [
    { id: crypto.randomUUID(), name: 'Arroz', category: 'Alimentos', lot: 'AR-2026-01', expires_at: '2026-12-31', donor: 'Banco de Alimentos', location: 'Almacen A', unit: 'kg', stock: 50, low_stock_threshold: 20, notes: '' },
    { id: crypto.randomUUID(), name: 'Leche', category: 'Alimentos', lot: 'LE-2026-06', expires_at: '2026-07-15', donor: 'Supermercado Solidario', location: 'Camara 1', unit: 'litros', stock: 18, low_stock_threshold: 25, notes: 'Reponer esta semana.' },
    { id: crypto.randomUUID(), name: 'Gel de ducha', category: 'Higiene', lot: 'HG-2026-02', expires_at: '', donor: 'Donación particular', location: 'Estantería H', unit: 'unidades', stock: 40, low_stock_threshold: 15, notes: '' }
  ],
  inventory_movements: [],
  donation_products: [],
  donations: [
    { id: crypto.randomUUID(), collaborator_id: demoCollaboratorId, donor: 'Empresa Solidaria SL', donor_email: 'colaborador@example.org', donor_kind: 'Empresa', donation_type: 'Productos', status: 'Recibida', donated_at: todayISO(), estimated_value: 450, quantity: '120 kg', notes: 'Entrega mensual de productos no perecederos.' },
    { id: crypto.randomUUID(), donor_id: demoDonorId, donor: 'Laura Martin', donor_email: 'donante@example.org', donor_kind: 'Particular', donation_type: 'Economica', status: 'Recibida', donated_at: todayISO(), estimated_value: 25, amount: 25, payment_method: 'Bizum', notes: 'Donacion economica puntual.' }
  ],
  accounting_events: [],
  financial_accounts: [],
  cash_bank_movements: [],
  accounting_contacts: [],
  accounting_documents: [],
  loan_records: [],
  loan_movements: [],
  debt_records: [],
  debt_movements: [],
  social_value_events: [],
  deletion_requests: [],
  accounting_audit_trail: [],
  treasury_incomes: [
    { id: crypto.randomUUID(), income_at: todayISO(), category: 'Donaciones', concept: 'Donación económica inicial', amount: 600, donor: 'Empresa Solidaria SL', payment_method: 'Transferencia', notes: 'Ingreso de ejemplo para tesorería.', document_name: '' }
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
  campanas: [
    {
      id: demoCampaignId,
      name: 'Reparto semanal de alimentos',
      description: 'Planificacion flexible de entregas segun necesidades familiares, stock y voluntariado disponible.',
      start_date: todayISO(),
      end_date: '',
      status: 'Activa',
      responsible: 'Elizabeth',
      observations: 'Priorizar familias con menores y productos proximos a caducar.',
      economic_goal: 1500,
      collected_amount: 620,
      beneficiary_ids: [demoBeneficiaryMariaId],
      product_ids: [],
      volunteer_ids: [],
      delivery_ids: [],
      agenda_event_ids: [demoAgendaEventId],
      notification_ids: [],
      origin_type: 'Campana periodica',
      source_module: 'agenda',
      source_record_id: '',
      metadata: { origin: 'Campana periodica' },
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  agenda_operativa: [
    {
      id: demoAgendaEventId,
      title: 'Preparar entregas prioritarias',
      description: 'Organizar productos disponibles para familias con prioridad social.',
      event_type: 'Entrega',
      status: 'Programado',
      event_at: `${todayISO()}T10:00`,
      end_at: '',
      campaign_id: demoCampaignId,
      responsible: 'Elizabeth',
      beneficiary_id: demoBeneficiaryMariaId,
      product_id: '',
      volunteer_id: '',
      origin_module: 'agenda',
      source_record_id: '',
      priority: 'Alta',
      notes: 'Revisar stock antes de confirmar entregas.',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  campana_beneficiarios: [
    { id: crypto.randomUUID(), campaign_id: demoCampaignId, beneficiary_id: demoBeneficiaryMariaId, created_at: new Date().toISOString() }
  ],
  campana_productos: [],
  campana_voluntarios: [],
  campana_entregas: [],
  campana_agenda_eventos: [],
  categorias_recursos: [
    { slug: 'formacion', nombre: 'Formacion', icono: 'book-open', descripcion: '', orden: 10, sort_order: 10, activa: true, estado: 'active' },
    { slug: 'empleo', nombre: 'Empleo', icono: 'briefcase', descripcion: '', orden: 20, sort_order: 20, activa: true, estado: 'active' },
    { slug: 'ayudas', nombre: 'Ayudas', icono: 'landmark', descripcion: '', orden: 30, sort_order: 30, activa: true, estado: 'active' },
    { slug: 'familias', nombre: 'Familias', icono: 'users', descripcion: '', orden: 40, sort_order: 40, activa: true, estado: 'active' },
    { slug: 'salud', nombre: 'Salud', icono: 'heart-pulse', descripcion: '', orden: 50, sort_order: 50, activa: true, estado: 'active' },
    { slug: 'vivienda', nombre: 'Vivienda', icono: 'home', descripcion: '', orden: 60, sort_order: 60, activa: true, estado: 'active' },
    { slug: 'tramites', nombre: 'Tramites', icono: 'file-text', descripcion: '', orden: 70, sort_order: 70, activa: true, estado: 'active' },
    { slug: 'alimentacion', nombre: 'Alimentacion', icono: 'utensils', descripcion: '', orden: 80, sort_order: 80, activa: true, estado: 'active' }
  ],
  recursos: [],
  social_resources: [],
  beneficiary_social_resources: [],
  social_resource_followups: [],
  social_resource_history: [],
  social_resource_sources: [],
  social_resource_detections: [],
  notificaciones: [
    {
      id: crypto.randomUUID(),
      tipo: 'warning',
      prioridad: 'warning',
      modulo: 'inventory',
      origen: 'Inventario',
      titulo: 'Stock minimo',
      mensaje: 'Hay productos que deben revisarse antes de preparar nuevas entregas.',
      estado: 'Pendiente',
      leida: false,
      read_at: null,
      read_by: null,
      entity_type: 'inventory',
      entity_id: '',
      action_url: '/inventory',
      dedupe_key: 'demo-inventory-low-stock',
      metadata: {},
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: crypto.randomUUID(),
      tipo: 'reminder',
      prioridad: 'reminder',
      modulo: 'beneficiaries',
      origen: 'Beneficiarios',
      titulo: 'Documentacion pendiente',
      mensaje: 'Revisa los expedientes con documentacion pendiente de actualizacion.',
      estado: 'Pendiente',
      leida: false,
      read_at: null,
      read_by: null,
      entity_type: 'beneficiary',
      entity_id: demoBeneficiaryMariaId,
      action_url: '/beneficiaries',
      dedupe_key: 'demo-beneficiary-document-pending',
      metadata: {},
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  roles: [
    { id: 'superadmin', name: 'Superadministrador', modules: ['*'] },
    { id: 'president', name: 'Presidenta', modules: ['*'] },
    { id: 'treasurer', name: 'Tesorera', modules: ['agenda', 'donations', 'donors', 'accounting', 'collaborators', 'reports', 'receipts'] },
    { id: 'secretary', name: 'Secretaria', modules: ['agenda', 'beneficiaries', 'families', 'receipts', 'reports', 'users', 'settings'] },
    { id: 'volunteer', name: 'Voluntario', modules: ['agenda', 'beneficiaries', 'deliveries', 'credential-scanner', 'inventory', 'accounting'] },
    { id: 'viewer', name: 'Consulta', modules: ['agenda', 'dashboard', 'reports'] },
    { id: 'platform-owner', name: 'Platform Owner', modules: ['platform-tools'] }
  ],
  audit_logs: [],
  platform_maintenance_logs: [],
  app_users: [
    {
      id: crypto.randomUUID(),
      first_name: 'Elizabeth',
      last_name: '',
      email: 'elizabeth@panyesperanza.org',
      password: '',
      phone: '',
      role: 'Superadministrador',
      position: 'Superadministrador',
      status: 'Activo',
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
