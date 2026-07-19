import { normalize, todayISO } from '../../lib/formatters';

const HELP_STALE_DAYS = 30;
const HELP_CRITICAL_DAYS = 45;
const EXPIRY_WARNING_DAYS = 14;
const EXPIRY_CRITICAL_DAYS = 3;
const COMPANY_INACTIVE_DAYS = 60;
const DELIVERY_DELAY_DAYS = 1;

export const PRIORITY_RULES = [
  'Productos proximos a caducar',
  'Beneficiarios sin ayuda reciente',
  'Donaciones pendientes',
  'Empresas inactivas',
  'Voluntarios sin asignacion',
  'Campanas recomendadas',
  'Entregas pendientes o retrasadas',
  'Agenda operativa vencida'
];

export class PriorityEngineService {
  constructor({
    repository = null,
    notificacionService = null,
    agendaOperativaService = null,
    dashboardService = null,
    audit = null,
    currentUser = null
  } = {}) {
    this.repository = repository;
    this.notificacionService = notificacionService;
    this.agendaOperativaService = agendaOperativaService;
    this.dashboardService = dashboardService;
    this.audit = audit;
    this.currentUser = currentUser;
  }

  configureIntegrations({
    notificacionService = this.notificacionService,
    agendaOperativaService = this.agendaOperativaService,
    dashboardService = this.dashboardService
  } = {}) {
    this.notificacionService = notificacionService;
    this.agendaOperativaService = agendaOperativaService;
    this.dashboardService = dashboardService;
    return this;
  }

  generate({ data = {}, today = todayISO(), operations = {} } = {}) {
    const priorities = [
      ...this.productExpirationPriorities(data, today),
      ...this.beneficiaryStaleHelpPriorities(data, today),
      ...this.pendingDonationPriorities(data),
      ...this.inactiveCompanyPriorities(data, today),
      ...this.unassignedVolunteerPriorities(data),
      ...this.campaignRecommendationPriorities(data, today, operations),
      ...this.deliveryPriorities(data, today),
      ...this.agendaPriorities(data, today)
    ]
      .map((item) => this.enrichPriority(item, today))
      .sort((a, b) => b.score - a.score || String(a.due_at || '').localeCompare(String(b.due_at || '')));

    const items = priorities.slice(0, 8);
    return {
      generatedAt: new Date().toISOString(),
      rules: PRIORITY_RULES,
      items,
      total: priorities.length,
      criticalCount: priorities.filter((item) => item.priority === 'Critica').length,
      highCount: priorities.filter((item) => item.priority === 'Alta').length,
      mediumCount: priorities.filter((item) => item.priority === 'Media').length,
      integrations: this.integrations()
    };
  }

  integrations() {
    return {
      repository: Boolean(this.repository),
      notificacionService: Boolean(this.notificacionService),
      agendaOperativaService: Boolean(this.agendaOperativaService),
      dashboardService: Boolean(this.dashboardService)
    };
  }

  async listStoredPriorities() {
    if (!this.repository?.list) return [];
    return this.repository.list();
  }

  async storeSnapshot(payload) {
    if (!this.repository?.create) return payload;
    return this.repository.create({
      ...payload,
      created_at: new Date().toISOString()
    });
  }

  productExpirationPriorities(data, today) {
    return (data.inventory_items || [])
      .map((item) => {
        const days = daysBetween(today, item.expires_at);
        if (!Number.isFinite(days) || days > EXPIRY_WARNING_DAYS) return null;
        const stock = Number(item.stock || 0);
        const critical = days <= EXPIRY_CRITICAL_DAYS;
        return {
          id: `inventory-expiry-${item.id}`,
          rule: 'Productos proximos a caducar',
          moduleId: 'inventory',
          destination: { moduleId: 'inventory', filter: 'expiring-soon', itemId: item.id },
          title: item.name || item.product_name || 'Producto con caducidad proxima',
          detail: `${stock} unidades. ${days <= 0 ? 'Caduca hoy o ya esta vencido.' : `Caduca en ${days} dias.`}`,
          recommendedAction: critical ? 'Planificar salida inmediata' : 'Priorizar en proximas entregas',
          score: critical ? 92 : 74,
          due_at: item.expires_at
        };
      })
      .filter(Boolean);
  }

  beneficiaryStaleHelpPriorities(data, today) {
    const latestByBeneficiary = latestDeliveriesByBeneficiary(data.deliveries || []);
    return (data.beneficiaries || [])
      .filter((beneficiary) => beneficiary.is_active !== false)
      .map((beneficiary) => {
        const latest = beneficiary.last_help_at || latestByBeneficiary.get(beneficiary.id)?.delivered_at;
        const reference = latest || beneficiary.joined_at || beneficiary.created_at;
        const days = daysBetween(reference, today);
        if (!Number.isFinite(days) || days < HELP_STALE_DAYS) return null;
        const critical = days >= HELP_CRITICAL_DAYS;
        return {
          id: `beneficiary-stale-${beneficiary.id}`,
          rule: 'Beneficiarios sin ayuda reciente',
          moduleId: 'beneficiaries',
          destination: { moduleId: 'beneficiaries', beneficiaryId: beneficiary.id, filter: 'stale-help' },
          title: beneficiary.full_name || beneficiary.code || 'Beneficiario pendiente de seguimiento',
          detail: `${days} dias sin ayuda registrada.`,
          recommendedAction: critical ? 'Revisar expediente hoy' : 'Programar seguimiento',
          score: critical ? 88 : 68,
          due_at: latest || reference
        };
      })
      .filter(Boolean);
  }

  pendingDonationPriorities(data) {
    return (data.donations || [])
      .filter(isPendingDonation)
      .map((donation) => ({
        id: `donation-pending-${donation.id}`,
        rule: 'Donaciones pendientes',
        moduleId: 'donations',
        destination: { moduleId: 'donations', filter: 'pending', donationId: donation.id },
        title: donation.donor || donation.company_name || 'Donacion pendiente',
        detail: cleanText(donation.donation_type || donation.type || donation.status || 'Pendiente de registrar'),
        recommendedAction: 'Registrar o validar donacion',
        score: 72,
        due_at: donation.donated_at || donation.created_at
      }));
  }

  inactiveCompanyPriorities(data, today) {
    const donations = data.donations || [];
    return (data.companies || data.empresas || [])
      .map((company) => {
        const companyName = company.name || company.nombre || company.business_name;
        const companyDonations = donations
          .filter((donation) => normalize(donation.company_name || donation.donor || donation.donor_name) === normalize(companyName))
          .sort((a, b) => String(b.donated_at || b.created_at || '').localeCompare(String(a.donated_at || a.created_at || '')));
        const latest = company.last_activity_at || companyDonations[0]?.donated_at || companyDonations[0]?.created_at || company.created_at;
        const days = daysBetween(latest, today);
        if (!Number.isFinite(days) || days < COMPANY_INACTIVE_DAYS) return null;
        return {
          id: `company-inactive-${company.id}`,
          rule: 'Empresas inactivas',
          moduleId: 'donations',
          destination: { moduleId: 'donations', filter: 'companies', companyId: company.id },
          title: companyName || 'Empresa sin actividad reciente',
          detail: `${days} dias sin actividad registrada.`,
          recommendedAction: 'Planificar contacto de seguimiento',
          score: days >= 90 ? 70 : 58,
          due_at: latest
        };
      })
      .filter(Boolean);
  }

  unassignedVolunteerPriorities(data) {
    const assignedVolunteerIds = new Set([
      ...(data.agenda_operativa || []).flatMap((event) => toIdList(event.volunteer_ids || event.volunteers || event.assigned_volunteers)),
      ...(data.deliveries || []).flatMap((delivery) => toIdList(delivery.volunteer_ids || delivery.responsible_id || delivery.responsable_id))
    ].filter(Boolean));

    return (data.volunteers || [])
      .filter((volunteer) => isActiveVolunteer(volunteer) && !assignedVolunteerIds.has(volunteer.id))
      .slice(0, 6)
      .map((volunteer) => ({
        id: `volunteer-unassigned-${volunteer.id}`,
        rule: 'Voluntarios sin asignacion',
        moduleId: 'volunteers',
        destination: { moduleId: 'volunteers', filter: 'unassigned', volunteerId: volunteer.id },
        title: volunteer.full_name || volunteer.name || 'Voluntario disponible',
        detail: volunteer.availability || volunteer.disponibilidad || 'Sin turno asignado.',
        recommendedAction: 'Asignar a entrega, campana o agenda',
        score: 52,
        due_at: volunteer.updated_at || volunteer.created_at
      }));
  }

  campaignRecommendationPriorities(data, today, operations) {
    const expiringCount = operations.expiringSoon?.length || this.productExpirationPriorities(data, today).length;
    const staleCount = operations.staleBeneficiaries?.length || this.beneficiaryStaleHelpPriorities(data, today).length;
    const activeCampaigns = (data.campanas || data.campaigns || []).filter((campaign) => ['Activa', 'Planificada'].includes(campaign.status || campaign.estado));
    if ((expiringCount < 3 && staleCount < 3) || activeCampaigns.length) return [];
    return [{
      id: 'campaign-recommended-stock-social',
      rule: 'Campanas recomendadas',
      moduleId: 'agenda',
      destination: { moduleId: 'agenda', filter: 'campaign-recommendation' },
      title: 'Campana recomendada por stock y necesidad social',
      detail: `${expiringCount} productos con caducidad proxima y ${staleCount} beneficiarios pendientes.`,
      recommendedAction: 'Crear campana operativa',
      score: 82,
      due_at: today
    }];
  }

  deliveryPriorities(data, today) {
    return (data.deliveries || [])
      .filter((delivery) => {
        const status = normalize(delivery.status || delivery.estado || '');
        if (status.includes('anulad') || status.includes('realizada') || status.includes('complet')) return false;
        const days = daysBetween(delivery.delivered_at || delivery.scheduled_at || delivery.created_at, today);
        return !delivery.signature_data_url || (Number.isFinite(days) && days >= DELIVERY_DELAY_DAYS);
      })
      .map((delivery) => ({
        id: `delivery-pending-${delivery.id}`,
        rule: 'Entregas pendientes o retrasadas',
        moduleId: 'deliveries',
        destination: { moduleId: 'deliveries', filter: 'pending', deliveryId: delivery.id },
        title: delivery.beneficiary_name || delivery.receiver_name || 'Entrega pendiente',
        detail: delivery.signature_data_url ? 'Entrega pendiente de revision.' : 'Firma o justificante pendiente.',
        recommendedAction: 'Completar entrega',
        score: delivery.signature_data_url ? 64 : 78,
        due_at: delivery.scheduled_at || delivery.delivered_at || delivery.created_at
      }));
  }

  agendaPriorities(data, today) {
    return (data.agenda_operativa || [])
      .filter((event) => {
        const status = normalize(event.status || event.estado || '');
        if (status.includes('final') || status.includes('cancel')) return false;
        const days = daysBetween(event.event_at || event.start_date || event.created_at, today);
        return Number.isFinite(days) && days > 0;
      })
      .map((event) => ({
        id: `agenda-overdue-${event.id}`,
        rule: 'Agenda operativa vencida',
        moduleId: 'agenda',
        destination: { moduleId: 'agenda', eventId: event.id, filter: 'overdue' },
        title: event.title || event.nombre || 'Evento operativo vencido',
        detail: `Pendiente desde hace ${daysBetween(event.event_at || event.start_date || event.created_at, today)} dias.`,
        recommendedAction: 'Replanificar o cerrar evento',
        score: 66,
        due_at: event.event_at || event.start_date || event.created_at
      }));
  }

  enrichPriority(priority, today) {
    const score = Number(priority.score || 0);
    return {
      ...priority,
      id: priority.id || `${slug(priority.rule)}-${slug(priority.title)}`,
      priority: scoreToPriority(score),
      dueLabel: dueLabel(priority.due_at, today),
      created_at: priority.created_at || new Date().toISOString()
    };
  }
}

function latestDeliveriesByBeneficiary(deliveries) {
  return deliveries.reduce((acc, delivery) => {
    const id = delivery.beneficiary_id;
    if (!id) return acc;
    const current = acc.get(id);
    if (!current || String(delivery.delivered_at || delivery.created_at || '') > String(current.delivered_at || current.created_at || '')) {
      acc.set(id, delivery);
    }
    return acc;
  }, new Map());
}

function isPendingDonation(donation) {
  if (donation.is_pending === true) return true;
  const status = normalize(donation.status || donation.state || donation.delivery_status || '');
  return ['pendiente', 'pending', 'solicitada', 'comprometida', 'sin registrar'].includes(status);
}

function isActiveVolunteer(volunteer) {
  const status = normalize(volunteer.status || volunteer.estado || volunteer.notes || '');
  return !status.includes('archivad') && !status.includes('inactiv') && !status.includes('baja');
}

function daysBetween(from, to) {
  if (!from || !to) return Number.NaN;
  const start = new Date(toDateKey(from));
  const end = new Date(toDateKey(to));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function toDateKey(value) {
  return value ? String(value).slice(0, 10) : '';
}

function cleanText(value) {
  return String(value || '').trim() || 'Pendiente';
}

function toIdList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'prioridad';
}

function scoreToPriority(score) {
  if (score >= 85) return 'Critica';
  if (score >= 70) return 'Alta';
  if (score >= 50) return 'Media';
  return 'Baja';
}

function dueLabel(value, today) {
  const days = daysBetween(today, value);
  if (!Number.isFinite(days)) return 'Sin fecha';
  if (days < 0) return `Vencido hace ${Math.abs(days)} dias`;
  if (days === 0) return 'Para hoy';
  return `En ${days} dias`;
}
