import { normalize, todayISO } from '../../lib/formatters';
import { sanitizeCampaignPayload } from '../agenda/AgendaOperativaService';

export const CAMPAIGN_ORIGINS = [
  'Nueva donacion',
  'Exceso de stock',
  'Productos proximos a caducar',
  'Necesidad social',
  'Campana periodica'
];

function cleanText(value) {
  return String(value || '').trim();
}

function toIdList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || '').split(',').map(cleanText).filter(Boolean);
}

function daysBetween(from, to) {
  if (!from || !to) return Number.NaN;
  const start = new Date(String(from).slice(0, 10));
  const end = new Date(String(to).slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function normalizeOrigin(value) {
  const requested = cleanText(value);
  return CAMPAIGN_ORIGINS.includes(requested) ? requested : 'Necesidad social';
}

function campaignTitle(origin, payload = {}) {
  if (payload.name || payload.nombre) return cleanText(payload.name || payload.nombre);
  if (origin === 'Nueva donacion') return `Campana por donacion de ${payload.donor || 'donante'}`;
  if (origin === 'Exceso de stock') return 'Campana por exceso de stock';
  if (origin === 'Productos proximos a caducar') return 'Campana de salida prioritaria por caducidad';
  if (origin === 'Campana periodica') return payload.periodic_name || 'Campana periodica operativa';
  return 'Campana por necesidad social';
}

function campaignDescription(origin, payload = {}) {
  if (payload.description || payload.descripcion) return cleanText(payload.description || payload.descripcion);
  if (origin === 'Nueva donacion') return 'Organizar una campana operativa a partir de una nueva donacion registrada.';
  if (origin === 'Exceso de stock') return 'Coordinar entregas para movilizar productos con disponibilidad alta.';
  if (origin === 'Productos proximos a caducar') return 'Priorizar productos con riesgo de caducidad para evitar perdidas.';
  if (origin === 'Campana periodica') return 'Planificar una campana recurrente de apoyo y reparto.';
  return 'Responder a necesidades sociales detectadas en beneficiarios o familias.';
}

export function sanitizeCampaignEnginePayload(payload = {}, context = {}) {
  const origin = normalizeOrigin(payload.origin || payload.origen);
  const now = context.now || new Date().toISOString();
  const metadata = {
    ...(payload.metadata || {}),
    origin,
    source_module: cleanText(payload.source_module),
    source_record_id: cleanText(payload.source_record_id)
  };

  return {
    ...sanitizeCampaignPayload({
      name: campaignTitle(origin, payload),
      description: campaignDescription(origin, payload),
      start_date: payload.start_date || payload.fecha_inicio || todayISO(),
      end_date: payload.end_date || payload.fecha_fin || '',
      status: payload.status || payload.estado || 'Planificada',
      responsible: payload.responsible || payload.responsable || '',
      observations: payload.observations || payload.observaciones || '',
      beneficiary_ids: toIdList(payload.beneficiary_ids),
      product_ids: toIdList(payload.product_ids),
      created_at: payload.created_at || now,
      updated_at: now
    }, {}, context),
    origin_type: origin,
    source_module: metadata.source_module,
    source_record_id: metadata.source_record_id,
    volunteer_ids: toIdList(payload.volunteer_ids),
    delivery_ids: toIdList(payload.delivery_ids),
    agenda_event_ids: toIdList(payload.agenda_event_ids),
    notification_ids: toIdList(payload.notification_ids),
    metadata
  };
}

export class CampanaService {
  constructor({
    repository,
    data = {},
    audit = async () => {},
    assertPermission = () => {},
    inventarioService = null,
    beneficiarioService = null,
    agendaOperativaService = null,
    notificacionService = null,
    dashboardService = null,
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('CampanaService necesita un repository.');
    this.repository = repository;
    this.data = data;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.inventarioService = inventarioService;
    this.beneficiarioService = beneficiarioService;
    this.agendaOperativaService = agendaOperativaService;
    this.notificacionService = notificacionService;
    this.dashboardService = dashboardService;
    this.currentUser = currentUser;
  }

  buildOpportunities() {
    return [
      ...this.opportunitiesFromDonations(),
      ...this.opportunitiesFromStockSurplus(),
      ...this.opportunitiesFromExpiringProducts(),
      ...this.opportunitiesFromSocialNeeds(),
      ...this.opportunitiesFromPeriodicCampaigns()
    ];
  }

  async generateCampaign(payload = {}) {
    this.assertPermission('agenda', 'create');
    const campaign = sanitizeCampaignEnginePayload(payload, this.context());
    const created = await this.repository.createCampaign(campaign);
    await this.repository.replaceCampaignLinks(created.id, campaign);

    const agendaEvent = await this.createAgendaEventForCampaign(created, campaign);
    if (agendaEvent?.id) {
      await this.repository.replaceCampaignLinks(created.id, {
        ...campaign,
        agenda_event_ids: [...(campaign.agenda_event_ids || []), agendaEvent.id]
      });
    }

    await this.audit(`Motor de Campanas: crear campana ${created.name || campaign.name}`.trim());
    await this.notifyCampaignChanged('campaign_generated', {
      campaign: created,
      agendaEvent,
      origin: campaign.origin_type
    });
    return { campaign: created, agendaEvent };
  }

  async generateFromOpportunity(opportunity) {
    return this.generateCampaign(opportunityToPayload(opportunity));
  }

  async generateFromDonation(donation) {
    return this.generateCampaign({
      origin: 'Nueva donacion',
      donor: donation?.donor,
      source_module: 'donations',
      source_record_id: donation?.id,
      product_ids: donation?.product_id ? [donation.product_id] : [],
      observations: donation?.notes || ''
    });
  }

  async generateFromStockSurplus(productIds = []) {
    return this.generateCampaign({
      origin: 'Exceso de stock',
      source_module: 'inventory',
      product_ids: productIds
    });
  }

  async generateFromExpiringProducts(productIds = []) {
    return this.generateCampaign({
      origin: 'Productos proximos a caducar',
      source_module: 'inventory',
      product_ids: productIds
    });
  }

  async generateFromSocialNeed(beneficiaryIds = []) {
    return this.generateCampaign({
      origin: 'Necesidad social',
      source_module: 'beneficiaries',
      beneficiary_ids: beneficiaryIds
    });
  }

  async generatePeriodicCampaign(payload = {}) {
    return this.generateCampaign({
      ...payload,
      origin: 'Campana periodica',
      source_module: 'agenda'
    });
  }

  opportunitiesFromDonations() {
    return (this.data.donations || [])
      .filter((donation) => normalize(donation.status || donation.state || '').includes('pendiente') || isRecent(donation.donated_at || donation.created_at, 7))
      .slice(0, 5)
      .map((donation) => ({
        origin: 'Nueva donacion',
        title: `Nueva donacion: ${donation.donor || donation.donation_type || 'Donante'}`,
        detail: donation.notes || donation.donation_type || 'Donacion registrada para coordinar.',
        source_module: 'donations',
        source_record_id: donation.id,
        product_ids: donation.product_id ? [donation.product_id] : []
      }));
  }

  opportunitiesFromStockSurplus() {
    return (this.data.inventory_items || [])
      .filter((item) => Number(item.stock || 0) >= Math.max(Number(item.low_stock_threshold || 0) * 3, 30))
      .slice(0, 6)
      .map((item) => ({
        origin: 'Exceso de stock',
        title: `Exceso de stock: ${item.name}`,
        detail: `${item.stock || 0} ${item.unit || ''} disponibles.`,
        source_module: 'inventory',
        source_record_id: item.id,
        product_ids: [item.id]
      }));
  }

  opportunitiesFromExpiringProducts() {
    const today = todayISO();
    return (this.data.inventory_items || [])
      .map((item) => ({ item, days: daysBetween(today, item.expires_at) }))
      .filter(({ days }) => Number.isFinite(days) && days >= 0 && days <= 21)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6)
      .map(({ item, days }) => ({
        origin: 'Productos proximos a caducar',
        title: `Caducidad proxima: ${item.name}`,
        detail: `Caduca en ${days} dias. Stock: ${item.stock || 0} ${item.unit || ''}.`,
        source_module: 'inventory',
        source_record_id: item.id,
        product_ids: [item.id]
      }));
  }

  opportunitiesFromSocialNeeds() {
    return (this.data.beneficiaries || [])
      .filter((beneficiary) => beneficiary.is_active !== false && ['urgente', 'prioritario', 'vulnerable'].some((status) => normalize(beneficiary.situation).includes(status)))
      .slice(0, 8)
      .map((beneficiary) => ({
        origin: 'Necesidad social',
        title: `Necesidad social: ${beneficiary.full_name}`,
        detail: beneficiary.requested_help || beneficiary.situation || 'Seguimiento social prioritario.',
        source_module: 'beneficiaries',
        source_record_id: beneficiary.id,
        beneficiary_ids: [beneficiary.id]
      }));
  }

  opportunitiesFromPeriodicCampaigns() {
    const activeCampaigns = (this.data.campanas || []).filter((campaign) => campaign.status === 'Activa' || campaign.status === 'Planificada');
    if (activeCampaigns.some((campaign) => normalize(campaign.origin_type || campaign.name).includes('period'))) return [];
    return [{
      origin: 'Campana periodica',
      title: 'Campana periodica semanal',
      detail: 'Planificacion recurrente para entregas y recogidas habituales.',
      source_module: 'agenda'
    }];
  }

  async createAgendaEventForCampaign(created, campaign) {
    if (!this.agendaOperativaService?.createEvent) return null;
    return this.agendaOperativaService.createEvent({
      title: created.name || campaign.name,
      description: created.description || campaign.description,
      event_type: 'Campana',
      status: 'Programado',
      event_at: `${created.start_date || todayISO()}T09:00`,
      campaign_id: created.id,
      responsible: created.responsible || campaign.responsible,
      origin_module: 'campaigns',
      source_record_id: created.id,
      priority: campaign.origin_type === 'Productos proximos a caducar' ? 'Alta' : 'Normal',
      notes: created.observations || campaign.observations
    }).catch(() => null);
  }

  async notifyCampaignChanged(type, payload) {
    await this.dashboardService?.notifyCampaignChanged?.({ type, ...payload });
    await this.notificacionService?.notifyAgendaChanged?.({ type, campaign: payload.campaign });
  }

  context() {
    return {
      userId: this.currentUser?.id || null,
      now: new Date().toISOString()
    };
  }

  integrations() {
    return {
      inventarioService: Boolean(this.inventarioService),
      beneficiarioService: Boolean(this.beneficiarioService),
      agendaOperativaService: Boolean(this.agendaOperativaService),
      notificacionService: Boolean(this.notificacionService),
      dashboardService: Boolean(this.dashboardService)
    };
  }
}

function opportunityToPayload(opportunity = {}) {
  return {
    origin: opportunity.origin,
    name: opportunity.title,
    description: opportunity.detail,
    source_module: opportunity.source_module,
    source_record_id: opportunity.source_record_id,
    beneficiary_ids: opportunity.beneficiary_ids || [],
    product_ids: opportunity.product_ids || [],
    observations: opportunity.detail || ''
  };
}

function isRecent(value, days) {
  const diff = daysBetween(value, todayISO());
  return Number.isFinite(diff) && diff >= 0 && diff <= days;
}
