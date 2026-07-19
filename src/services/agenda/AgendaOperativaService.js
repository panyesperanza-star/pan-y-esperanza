import { normalize, todayISO } from '../../lib/formatters';

export const AGENDA_EVENT_TYPES = [
  { id: 'Entrega', label: 'Entrega', tone: 'blue' },
  { id: 'Campana', label: 'Campana', tone: 'green' },
  { id: 'Recogida', label: 'Recogida', tone: 'orange' },
  { id: 'Reunion', label: 'Reunion', tone: 'slate' },
  { id: 'Evento', label: 'Evento', tone: 'violet' },
  { id: 'Voluntariado', label: 'Voluntariado', tone: 'emerald' },
  { id: 'Aviso', label: 'Aviso', tone: 'yellow' },
  { id: 'Caducidad', label: 'Caducidad', tone: 'red' }
];

export const CAMPAIGN_STATUSES = ['Planificada', 'Activa', 'Finalizada', 'Cancelada'];
export const AGENDA_EVENT_STATUSES = ['Pendiente', 'Programado', 'En curso', 'Completado', 'Cancelado'];

function cleanText(value) {
  return String(value || '').trim();
}

function toIdList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return String(value || '').split(',').map(cleanText).filter(Boolean);
}

function normalizeEventType(value) {
  const requested = cleanText(value);
  return AGENDA_EVENT_TYPES.some((item) => item.id === requested) ? requested : 'Aviso';
}

function normalizeEventStatus(value) {
  const requested = cleanText(value);
  return AGENDA_EVENT_STATUSES.includes(requested) ? requested : 'Pendiente';
}

function normalizeCampaignStatus(value) {
  const requested = cleanText(value);
  return CAMPAIGN_STATUSES.includes(requested) ? requested : 'Planificada';
}

function eventDateKey(event) {
  return cleanText(event.event_at || event.start_at || event.date || event.created_at).slice(0, 10);
}

function daysBetween(from, to) {
  if (!from || !to) return Number.NaN;
  const start = new Date(String(from).slice(0, 10));
  const end = new Date(String(to).slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function weekKey(dateValue) {
  const date = new Date(`${String(dateValue || todayISO()).slice(0, 10)}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function sanitizeAgendaEventPayload(payload = {}, current = {}) {
  const title = cleanText(payload.title ?? payload.titulo ?? current.title);
  if (!title) throw new Error('El titulo del evento es obligatorio.');

  const eventType = normalizeEventType(payload.event_type ?? payload.tipo ?? current.event_type);
  const now = new Date().toISOString();

  return {
    title,
    description: cleanText(payload.description ?? payload.descripcion ?? current.description),
    event_type: eventType,
    status: normalizeEventStatus(payload.status ?? payload.estado ?? current.status),
    event_at: cleanText(payload.event_at ?? payload.fecha ?? current.event_at) || null,
    end_at: cleanText(payload.end_at ?? current.end_at) || null,
    campaign_id: cleanText(payload.campaign_id ?? payload.campana_id ?? current.campaign_id) || null,
    responsible: cleanText(payload.responsible ?? payload.responsable ?? current.responsible),
    beneficiary_id: cleanText(payload.beneficiary_id ?? current.beneficiary_id) || null,
    product_id: cleanText(payload.product_id ?? current.product_id) || null,
    volunteer_id: cleanText(payload.volunteer_id ?? current.volunteer_id) || null,
    origin_module: cleanText(payload.origin_module ?? current.origin_module),
    source_record_id: cleanText(payload.source_record_id ?? current.source_record_id),
    priority: cleanText(payload.priority ?? current.priority ?? 'Normal'),
    notes: cleanText(payload.notes ?? payload.observations ?? current.notes),
    metadata: payload.metadata ?? current.metadata ?? {},
    created_at: current.created_at || payload.created_at || now,
    updated_at: now
  };
}

export function sanitizeCampaignPayload(payload = {}, current = {}, context = {}) {
  const name = cleanText(payload.name ?? payload.nombre ?? current.name);
  if (!name) throw new Error('El nombre de la campana es obligatorio.');

  const now = new Date().toISOString();
  return {
    name,
    description: cleanText(payload.description ?? payload.descripcion ?? current.description),
    start_date: cleanText(payload.start_date ?? payload.fecha_inicio ?? current.start_date) || null,
    end_date: cleanText(payload.end_date ?? payload.fecha_fin ?? current.end_date) || null,
    status: normalizeCampaignStatus(payload.status ?? payload.estado ?? current.status),
    responsible: cleanText(payload.responsible ?? payload.responsable ?? current.responsible),
    observations: cleanText(payload.observations ?? payload.observaciones ?? current.observations),
    beneficiary_ids: toIdList(payload.beneficiary_ids ?? current.beneficiary_ids),
    product_ids: toIdList(payload.product_ids ?? current.product_ids),
    created_by: current.created_by || payload.created_by || context.userId || null,
    created_at: current.created_at || payload.created_at || now,
    updated_at: now
  };
}

export class AgendaOperativaService {
  constructor({
    repository,
    data = {},
    audit = async () => {},
    assertPermission = () => {},
    beneficiarioService = null,
    entregaService = null,
    inventarioService = null,
    voluntarioService = null,
    donacionService = null,
    dashboardService = null,
    notificacionService = null,
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('AgendaOperativaService necesita un repository.');
    this.repository = repository;
    this.data = data;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.beneficiarioService = beneficiarioService;
    this.entregaService = entregaService;
    this.inventarioService = inventarioService;
    this.voluntarioService = voluntarioService;
    this.donacionService = donacionService;
    this.dashboardService = dashboardService;
    this.notificacionService = notificacionService;
    this.currentUser = currentUser;
  }

  buildViewModel({ view = 'daily', filters = {} } = {}) {
    const events = this.filterEvents(filters);
    return {
      events,
      groupedEvents: groupEvents(events, view),
      campaigns: this.filterCampaigns(filters),
      recommendations: this.buildRecommendations(),
      metrics: this.buildMetrics(events)
    };
  }

  buildRecommendations() {
    const today = todayISO();
    const beneficiaries = this.data.beneficiaries || [];
    const items = this.data.inventory_items || [];
    const volunteers = this.data.volunteers || [];
    const donations = this.data.donations || [];

    const urgentFamilies = beneficiaries
      .filter((item) => item.is_active !== false && ['urgente', 'prioritario', 'vulnerable'].some((status) => normalize(item.situation).includes(status)))
      .slice(0, 4)
      .map((item) => ({
        type: 'Necesidad familiar',
        title: item.full_name,
        detail: `${item.situation || 'Seguimiento'} - ${item.requested_help || 'Ayuda pendiente'}`,
        priority: normalize(item.situation).includes('urgente') ? 'Alta' : 'Media'
      }));

    const expiringProducts = items
      .map((item) => ({ item, days: daysBetween(today, item.expires_at) }))
      .filter(({ days }) => Number.isFinite(days) && days >= 0 && days <= 14)
      .sort((a, b) => a.days - b.days)
      .slice(0, 4)
      .map(({ item, days }) => ({
        type: 'Caducidad',
        title: item.name,
        detail: `${item.stock || 0} ${item.unit || ''} - caduca en ${days} dias`,
        priority: days <= 3 ? 'Alta' : 'Media'
      }));

    const lowStock = items
      .filter((item) => Number(item.stock || 0) <= Number(item.low_stock_threshold || 0))
      .slice(0, 4)
      .map((item) => ({
        type: 'Inventario',
        title: item.name,
        detail: `Stock ${item.stock || 0}. Minimo ${item.low_stock_threshold || 0}.`,
        priority: Number(item.stock || 0) <= 0 ? 'Alta' : 'Media'
      }));

    const volunteerAvailability = volunteers
      .filter((item) => cleanText(item.availability))
      .slice(0, 3)
      .map((item) => ({
        type: 'Voluntariado',
        title: item.full_name,
        detail: item.availability,
        priority: 'Normal'
      }));

    const pendingDonations = donations
      .filter((item) => normalize(item.status || item.state || '').includes('pendiente'))
      .slice(0, 3)
      .map((item) => ({
        type: 'Donaciones',
        title: item.donor || item.donation_type || 'Donacion pendiente',
        detail: item.notes || 'Pendiente de coordinar o registrar.',
        priority: 'Media'
      }));

    return [...urgentFamilies, ...expiringProducts, ...lowStock, ...volunteerAvailability, ...pendingDonations];
  }

  async createCampaign(payload) {
    this.assertPermission('agenda', 'create');
    const campaign = sanitizeCampaignPayload(payload, {}, this.context());
    const created = await this.repository.createCampaign(campaign);
    await this.repository.replaceCampaignRelations?.(created.id, campaign.beneficiary_ids, campaign.product_ids);
    await this.audit(`Agenda Operativa: crear campana ${created.name || campaign.name}`.trim());
    await this.notifyAgendaChanged('campaign_created', { campaign: created });
    return created;
  }

  async updateCampaign(id, payload) {
    this.assertPermission('agenda', 'edit');
    const current = this.findCampaign(id);
    if (!current) throw new Error('La campana no existe.');
    const campaign = sanitizeCampaignPayload(payload, current, this.context());
    const updated = await this.repository.updateCampaign(id, campaign);
    await this.repository.replaceCampaignRelations?.(id, campaign.beneficiary_ids, campaign.product_ids);
    await this.audit(`Agenda Operativa: editar campana ${updated.name || current.name}`.trim());
    await this.notifyAgendaChanged('campaign_updated', { campaign: updated });
    return updated;
  }

  async cancelCampaign(id) {
    this.assertPermission('agenda', 'edit');
    const current = this.findCampaign(id);
    if (!current) throw new Error('La campana no existe.');
    const updated = await this.repository.updateCampaign(id, {
      status: 'Cancelada',
      updated_at: new Date().toISOString()
    });
    await this.audit(`Agenda Operativa: cancelar campana ${current.name || id}`.trim());
    await this.notifyAgendaChanged('campaign_cancelled', { campaign: updated });
    return updated;
  }

  async createEvent(payload) {
    this.assertPermission('agenda', 'create');
    const event = sanitizeAgendaEventPayload(payload);
    const created = await this.repository.createEvent(event);
    await this.audit(`Agenda Operativa: crear evento ${created.title || event.title}`.trim());
    await this.notifyAgendaChanged('event_created', { event: created });
    return created;
  }

  async updateEvent(id, payload) {
    this.assertPermission('agenda', 'edit');
    const current = this.findEvent(id);
    if (!current) throw new Error('El evento no existe.');
    const updated = await this.repository.updateEvent(id, sanitizeAgendaEventPayload(payload, current));
    await this.audit(`Agenda Operativa: editar evento ${updated.title || current.title}`.trim());
    await this.notifyAgendaChanged('event_updated', { event: updated });
    return updated;
  }

  async deleteEvent(id) {
    this.assertPermission('agenda', 'delete');
    const event = this.findEvent(id);
    await this.repository.removeEvent(id);
    await this.audit(`Agenda Operativa: eliminar evento ${event?.title || id}`.trim());
    await this.notifyAgendaChanged('event_deleted', { event: event || { id } });
  }

  findCampaign(id) {
    return (this.data.campanas || []).find((item) => item.id === id);
  }

  findEvent(id) {
    return (this.data.agenda_operativa || []).find((item) => item.id === id);
  }

  filterCampaigns(filters = {}) {
    const search = normalize(filters.search);
    return [...(this.data.campanas || [])]
      .filter((item) => !filters.campaignId || item.id === filters.campaignId)
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.responsible || normalize(item.responsible).includes(normalize(filters.responsible)))
      .filter((item) => !search || [item.name, item.description, item.responsible, item.observations].some((value) => normalize(value).includes(search)))
      .sort((a, b) => String(a.start_date || a.created_at).localeCompare(String(b.start_date || b.created_at)));
  }

  filterEvents(filters = {}) {
    const search = normalize(filters.search);
    return [...(this.data.agenda_operativa || [])]
      .filter((item) => !filters.type || item.event_type === filters.type)
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.campaignId || item.campaign_id === filters.campaignId)
      .filter((item) => !filters.responsible || normalize(item.responsible).includes(normalize(filters.responsible)))
      .filter((item) => !search || [item.title, item.description, item.responsible, item.notes].some((value) => normalize(value).includes(search)))
      .sort((a, b) => String(a.event_at || a.created_at).localeCompare(String(b.event_at || b.created_at)));
  }

  buildMetrics(events = this.data.agenda_operativa || []) {
    const today = todayISO();
    return {
      today: events.filter((item) => eventDateKey(item) === today).length,
      week: events.filter((item) => weekKey(eventDateKey(item)) === weekKey(today)).length,
      activeCampaigns: (this.data.campanas || []).filter((item) => item.status === 'Activa').length,
      expiring: this.buildRecommendations().filter((item) => item.type === 'Caducidad').length
    };
  }

  context() {
    return { userId: this.currentUser?.id || null };
  }

  async notifyAgendaChanged(type, payload = {}) {
    await this.dashboardService?.notifyAgendaChanged?.({ type, ...payload });
    await this.notificacionService?.notifyAgendaChanged?.({ type, ...payload });
  }

  integrations() {
    return {
      beneficiarioService: Boolean(this.beneficiarioService),
      entregaService: Boolean(this.entregaService),
      inventarioService: Boolean(this.inventarioService),
      voluntarioService: Boolean(this.voluntarioService),
      donacionService: Boolean(this.donacionService),
      dashboardService: Boolean(this.dashboardService),
      notificacionService: Boolean(this.notificacionService)
    };
  }
}

function groupEvents(events, view) {
  if (view === 'list') return { Lista: events };
  if (view === 'monthly') {
    return groupBy(events, (event) => String(eventDateKey(event) || 'Sin fecha').slice(0, 7) || 'Sin fecha');
  }
  if (view === 'weekly') {
    return groupBy(events, (event) => weekKey(eventDateKey(event) || todayISO()));
  }
  return groupBy(events, (event) => eventDateKey(event) || 'Sin fecha');
}

function groupBy(items, picker) {
  return items.reduce((acc, item) => {
    const key = picker(item);
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {});
}
