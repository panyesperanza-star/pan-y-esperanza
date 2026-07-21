import { normalize } from '../../lib/formatters';

export const NOTIFICATION_TYPES = [
  { id: 'info', label: 'Informacion', tone: 'green' },
  { id: 'warning', label: 'Aviso', tone: 'yellow' },
  { id: 'reminder', label: 'Recordatorio', tone: 'orange' },
  { id: 'urgent', label: 'Urgente', tone: 'red' },
  { id: 'error', label: 'Error', tone: 'slate' }
];

export const NOTIFICATION_MODULES = [
  { id: 'beneficiaries', label: 'Beneficiarios' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'donations', label: 'Donaciones' },
  { id: 'donors', label: 'Donantes' },
  { id: 'collaborators', label: 'Colaboradores' },
  { id: 'volunteers', label: 'Voluntarios' },
  { id: 'resources', label: 'Centro de Recursos' },
  { id: 'settings', label: 'Configuracion' },
  { id: 'agenda', label: 'Agenda Operativa' },
  { id: 'dashboard', label: 'Dashboard' }
];

const TYPE_ALIASES = {
  informacion: 'info',
  informacion_general: 'info',
  info: 'info',
  aviso: 'warning',
  warning: 'warning',
  recordatorio: 'reminder',
  reminder: 'reminder',
  urgente: 'urgent',
  urgent: 'urgent',
  error: 'error'
};

const MODULE_ALIASES = {
  beneficiarios: 'beneficiaries',
  beneficiaries: 'beneficiaries',
  inventario: 'inventory',
  inventory: 'inventory',
  entregas: 'deliveries',
  deliveries: 'deliveries',
  donaciones: 'donations',
  donations: 'donations',
  donantes: 'donors',
  donors: 'donors',
  colaboradores: 'collaborators',
  collaborators: 'collaborators',
  voluntarios: 'volunteers',
  volunteers: 'volunteers',
  recursos: 'resources',
  resources: 'resources',
  configuracion: 'settings',
  settings: 'settings',
  agenda: 'agenda',
  dashboard: 'dashboard'
};

const RESOURCE_ACTIONS = new Set(['created', 'updated', 'published', 'unpublished', 'archived']);
const VOLUNTEER_ACTIONS = new Set(['created', 'updated', 'history_created', 'documentation_removed', 'deleted']);

function cleanText(value) {
  return String(value || '').trim();
}

function safeId() {
  return crypto.randomUUID();
}

function normalizeType(value) {
  return TYPE_ALIASES[normalize(value)] || 'info';
}

function normalizeModule(value) {
  return MODULE_ALIASES[normalize(value)] || cleanText(value) || 'dashboard';
}

function notificationLabel(collection, id) {
  return collection.find((item) => item.id === id)?.label || id;
}

function portalNotificationLabel(portal) {
  const labels = {
    beneficiary: 'Portal del Beneficiario',
    collaborator: 'Portal de Colaboradores',
    donor: 'Portal de Donaciones'
  };
  return labels[cleanText(portal)] || 'Portal privado';
}

export class NotificacionService {
  constructor({
    repository,
    notifications = [],
    audit = async () => {},
    dashboardService = null,
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('NotificacionService necesita un repository.');
    this.repository = repository;
    this.notifications = notifications;
    this.audit = audit;
    this.dashboardService = dashboardService;
    this.currentUser = currentUser;
  }

  async list() {
    return this.repository.list();
  }

  buildViewModel(filters = {}) {
    const search = normalize(filters.search);
    const moduleId = cleanText(filters.moduleId);
    const type = cleanText(filters.type);

    return [...(this.notifications || [])]
      .filter((item) => !moduleId || normalizeModule(item.modulo) === moduleId)
      .filter((item) => !type || normalizeType(item.tipo || item.prioridad) === type)
      .filter((item) => {
        if (!search) return true;
        return [
          item.titulo,
          item.mensaje,
          item.modulo,
          item.origen,
          item.entity_type
        ].some((value) => normalize(value).includes(search));
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  countUnread() {
    return (this.notifications || []).filter((item) => !this.isRead(item)).length;
  }

  async create(payload = {}) {
    const now = new Date().toISOString();
    const notification = {
      id: payload.id || safeId(),
      tipo: normalizeType(payload.tipo || payload.prioridad),
      prioridad: normalizeType(payload.prioridad || payload.tipo),
      modulo: normalizeModule(payload.modulo || payload.module),
      origen: cleanText(payload.origen || payload.source || payload.modulo || payload.module),
      titulo: cleanText(payload.titulo || payload.title),
      mensaje: cleanText(payload.mensaje || payload.message),
      estado: payload.estado || 'Pendiente',
      leida: payload.leida === true,
      read_at: payload.read_at || null,
      read_by: payload.read_by || null,
      entity_type: cleanText(payload.entity_type),
      entity_id: cleanText(payload.entity_id),
      action_url: cleanText(payload.action_url),
      dedupe_key: cleanText(payload.dedupe_key),
      metadata: payload.metadata || {},
      created_by: payload.created_by || this.currentUser?.id || null,
      created_at: payload.created_at || now,
      updated_at: now
    };

    if (!notification.titulo) throw new Error('El titulo de la notificacion es obligatorio.');
    if (!notification.mensaje) throw new Error('El mensaje de la notificacion es obligatorio.');

    try {
      const existing = this.findOpenByDedupe(notification.dedupe_key);
      const saved = existing
        ? await this.repository.update(existing.id, {
          ...notification,
          id: existing.id,
          created_at: existing.created_at || notification.created_at,
          leida: false,
          read_at: null,
          read_by: null
        })
        : await this.repository.create(notification);
      await this.audit(`Notificaciones: ${existing ? 'actualizo' : 'creo'} aviso ${notification.titulo}`.trim());
      await this.dashboardService?.notifyNotificationChanged?.({ type: existing ? 'updated' : 'created', notification: saved });
      return saved;
    } catch (error) {
      console.warn('[Notificaciones] No se pudo registrar la notificacion', { message: error?.message });
      await this.audit(`Notificaciones: error al registrar aviso ${notification.titulo}`.trim()).catch(() => {});
      return null;
    }
  }

  async sendPortalOtp({
    portal,
    action = 'access',
    phone = '',
    channel = 'email',
    expiresAt,
    subjectType = 'portal_user',
    subjectId = ''
  } = {}) {
    const cleanChannel = cleanText(channel || 'email');
    const portalLabel = portalNotificationLabel(portal);
    const actionLabel = action === 'access' ? 'acceso' : 'accion sensible';
    const metadata = {
      portal,
      action,
      channel: cleanChannel,
      expires_at: expiresAt,
      subject_type: subjectType,
      subject_id: subjectId
    };

    await this.create({
      tipo: 'info',
      prioridad: 'info',
      modulo: 'settings',
      origen: portalLabel,
      titulo: `OTP generado para ${portalLabel}`,
      mensaje: `Se ha generado un codigo OTP para ${actionLabel}.`,
      entity_type: subjectType,
      entity_id: subjectId,
      metadata,
      dedupe_key: ''
    });

    await this.audit(`OTP de portal registrado; envio y validacion delegados al servidor para ${portalLabel}`);
    return {
      channel: cleanChannel,
      provider: phone ? cleanChannel : 'server-api',
      status: 'server_only'
    };
  }

  async markAsRead(id) {
    const notification = this.notifications.find((item) => item.id === id);
    if (!notification) throw new Error('La notificacion no existe.');
    if (this.isRead(notification)) return notification;

    const updated = await this.repository.markAsRead(id, {
      leida: true,
      estado: 'Leida',
      read_at: new Date().toISOString(),
      read_by: this.currentUser?.id || null,
      updated_at: new Date().toISOString()
    });
    await this.audit(`Notificaciones: marco como leida ${notification.titulo || id}`.trim());
    await this.dashboardService?.notifyNotificationChanged?.({ type: 'read', notification: updated });
    return updated;
  }

  async markAllAsRead() {
    const pending = this.notifications.filter((item) => !this.isRead(item));
    for (const notification of pending) {
      await this.markAsRead(notification.id);
    }
    return pending.length;
  }

  async notifyBeneficiaryChanged({ type, beneficiary, payload } = {}) {
    const target = beneficiary || payload || {};
    const title = type === 'document_pending' ? 'Documentacion pendiente' : 'Beneficiario actualizado';
    const message = type === 'document_pending'
      ? `${target.full_name || 'Un beneficiario'} tiene documentacion pendiente de revisar.`
      : `${target.full_name || 'Un beneficiario'} requiere seguimiento en su expediente.`;
    return this.create({
      tipo: type === 'blocked' ? 'urgent' : type === 'document_pending' ? 'warning' : 'info',
      modulo: 'beneficiaries',
      origen: 'Beneficiarios',
      titulo: title,
      mensaje: message,
      entity_type: 'beneficiary',
      entity_id: target.id || payload?.beneficiary_id || '',
      action_url: '/beneficiaries',
      dedupe_key: target.id ? `beneficiary-${type || 'updated'}-${target.id}` : ''
    });
  }

  async notifyBeneficiaryDocumentChanged({ type, document, payload } = {}) {
    const target = document || payload || {};
    return this.create({
      tipo: type === 'pending' ? 'warning' : 'info',
      modulo: 'beneficiaries',
      origen: 'Beneficiarios',
      titulo: type === 'pending' ? 'Documentacion pendiente' : 'Documentacion actualizada',
      mensaje: `Se ha registrado documentacion en el expediente del beneficiario.`,
      entity_type: 'beneficiary_document',
      entity_id: target.id || '',
      action_url: '/beneficiaries',
      dedupe_key: target.id ? `beneficiary-document-${type || 'updated'}-${target.id}` : ''
    });
  }

  async notifyInventoryChanged({ type, item, movement, payload } = {}) {
    const target = item || movement || payload || {};
    const isCritical = ['out_of_stock', 'expired'].includes(type);
    const isWarning = isCritical || ['low_stock', 'expiring_soon', 'regularized', 'movement_created'].includes(type);
    return this.create({
      tipo: isCritical ? 'urgent' : isWarning ? 'warning' : 'info',
      modulo: 'inventory',
      origen: 'Inventario',
      titulo: inventoryTitle(type),
      mensaje: inventoryMessage(type, target),
      entity_type: 'inventory',
      entity_id: target.id || target.item_id || '',
      action_url: '/inventory',
      dedupe_key: target.id || target.item_id ? `inventory-${type || 'updated'}-${target.id || target.item_id}` : ''
    });
  }

  async notifyDeliveryChanged({ type, delivery, deliveryId } = {}) {
    const id = delivery?.id || deliveryId || '';
    return this.create({
      tipo: type === 'cancelled' ? 'urgent' : type === 'signature_saved' ? 'info' : 'reminder',
      modulo: 'deliveries',
      origen: 'Entregas',
      titulo: deliveryTitle(type),
      mensaje: deliveryMessage(type, delivery),
      entity_type: 'delivery',
      entity_id: id,
      action_url: '/deliveries',
      dedupe_key: id ? `delivery-${type || 'updated'}-${id}` : ''
    });
  }

  async notifyDonationChanged({ type, donation, donorName, item, donationId } = {}) {
    return this.create({
      tipo: type === 'deleted' ? 'warning' : 'info',
      modulo: 'donations',
      origen: 'Donaciones',
      titulo: donationTitle(type),
      mensaje: donationMessage(type, donorName || donation?.donor, item),
      entity_type: 'donation',
      entity_id: donation?.id || donationId || '',
      action_url: '/donations',
      dedupe_key: donation?.id || donationId ? `donation-${type || 'updated'}-${donation?.id || donationId}` : ''
    });
  }

  async notifyVolunteerChanged({ type, payload } = {}) {
    if (!VOLUNTEER_ACTIONS.has(type)) return null;
    return this.create({
      tipo: type === 'deleted' ? 'warning' : type === 'history_created' ? 'reminder' : 'info',
      modulo: 'volunteers',
      origen: 'Voluntarios',
      titulo: volunteerTitle(type),
      mensaje: volunteerMessage(type, payload),
      entity_type: 'volunteer',
      entity_id: payload?.id || payload?.volunteer_id || '',
      action_url: '/volunteers',
      dedupe_key: payload?.id || payload?.volunteer_id ? `volunteer-${type}-${payload.id || payload.volunteer_id}` : ''
    });
  }

  async notifyResourceChanged({ type, resource } = {}) {
    if (!RESOURCE_ACTIONS.has(type)) return null;
    return this.create({
      tipo: type === 'published' ? 'info' : type === 'archived' ? 'warning' : 'reminder',
      modulo: 'resources',
      origen: 'Centro de Recursos',
      titulo: resourceTitle(type),
      mensaje: `${resource?.titulo || 'Un recurso'} se ha ${resourceVerb(type)}.`,
      entity_type: 'resource',
      entity_id: resource?.id || '',
      action_url: '/settings',
      dedupe_key: resource?.id ? `resource-${type}-${resource.id}` : ''
    });
  }

  async notifyConfigurationChanged({ type, settings } = {}) {
    return this.create({
      tipo: type === 'integration_error' ? 'error' : type === 'environment_incomplete' ? 'warning' : 'info',
      modulo: 'settings',
      origen: 'Configuracion',
      titulo: configurationTitle(type),
      mensaje: configurationMessage(type, settings),
      entity_type: 'configuration',
      entity_id: settings?.id || 'main',
      action_url: '/settings',
      dedupe_key: `configuration-${type || 'updated'}`
    });
  }

  async notifyBeneficiaryPortalChanged({ type, payload } = {}) {
    return this.create({
      tipo: 'info',
      modulo: 'beneficiaries',
      origen: 'Beneficiarios',
      titulo: 'Portal del beneficiario actualizado',
      mensaje: payload?.message || `Se ha actualizado informacion del portal privado.`,
      entity_type: 'beneficiary_portal',
      entity_id: payload?.id || '',
      action_url: '/beneficiaries',
      dedupe_key: payload?.id ? `beneficiary-portal-${type || 'updated'}-${payload.id}` : ''
    });
  }

  async notifyAgendaChanged({ type, event, campaign } = {}) {
    const target = event || campaign || {};
    return this.create({
      tipo: type === 'campaign_cancelled' || type === 'event_deleted' ? 'warning' : 'info',
      modulo: 'agenda',
      origen: 'Agenda Operativa',
      titulo: agendaTitle(type),
      mensaje: agendaMessage(type, target),
      entity_type: event ? 'agenda_event' : 'campaign',
      entity_id: target.id || '',
      action_url: '/agenda',
      dedupe_key: target.id ? `agenda-${type || 'updated'}-${target.id}` : ''
    });
  }

  isRead(notification) {
    return notification?.leida === true || normalize(notification?.estado) === 'leida' || Boolean(notification?.read_at);
  }

  findOpenByDedupe(dedupeKey) {
    if (!dedupeKey) return null;
    return this.notifications.find((item) => (
      cleanText(item.dedupe_key) === dedupeKey
      && !this.isRead(item)
      && normalize(item.estado) !== 'archivada'
    )) || null;
  }
}

function inventoryTitle(type) {
  const titles = {
    low_stock: 'Stock minimo',
    out_of_stock: 'Producto agotado',
    expiring_soon: 'Producto proximo a caducar',
    expired: 'Lote caducado',
    movement_created: 'Movimiento de inventario',
    regularized: 'Regularizacion autorizada',
    item_created: 'Producto creado',
    item_updated: 'Producto actualizado'
  };
  return titles[type] || 'Inventario actualizado';
}

function inventoryMessage(type, target) {
  const name = target?.name || target?.item_name || 'Un producto';
  if (type === 'out_of_stock') return `${name} se ha quedado sin stock.`;
  if (type === 'low_stock') return `${name} esta por debajo del stock minimo.`;
  if (type === 'expiring_soon') return `${name} tiene una caducidad proxima.`;
  if (type === 'expired') return `${name} tiene un lote caducado.`;
  return `${name} ha registrado un cambio de inventario.`;
}

function deliveryTitle(type) {
  const titles = {
    created: 'Entrega pendiente de seguimiento',
    signature_saved: 'Firma registrada',
    cancelled: 'Entrega anulada',
    deleted: 'Entrega eliminada'
  };
  return titles[type] || 'Entrega actualizada';
}

function deliveryMessage(type, delivery) {
  if (type === 'signature_saved') return `La entrega ${delivery?.receipt_number || ''} ya tiene firma digital asociada.`.trim();
  if (type === 'cancelled') return `La entrega ${delivery?.receipt_number || ''} ha sido anulada.`.trim();
  return `La entrega ${delivery?.receipt_number || ''} requiere revision o seguimiento.`.trim();
}

function donationTitle(type) {
  const titles = {
    economic: 'Donacion economica recibida',
    in_kind: 'Nueva donacion en especie',
    deleted: 'Donacion eliminada'
  };
  return titles[type] || 'Nueva donacion';
}

function donationMessage(type, donorName, item) {
  if (type === 'in_kind') return `${donorName || 'Un donante'} ha aportado ${item?.name || 'productos'} para inventario.`;
  if (type === 'economic') return `${donorName || 'Un donante'} ha realizado una aportacion economica.`;
  return `Se ha actualizado una donacion.`;
}

function volunteerTitle(type) {
  const titles = {
    created: 'Nuevo voluntario',
    updated: 'Voluntario actualizado',
    history_created: 'Actividad de voluntariado',
    documentation_removed: 'Documentacion retirada',
    deleted: 'Voluntario eliminado'
  };
  return titles[type] || 'Voluntariado actualizado';
}

function volunteerMessage(type, payload) {
  if (type === 'history_created') return `Se ha registrado una actividad o turno de voluntariado.`;
  return `${payload?.full_name || 'Un voluntario'} ha sido actualizado.`;
}

function resourceTitle(type) {
  const titles = {
    created: 'Recurso pendiente',
    updated: 'Recurso actualizado',
    published: 'Recurso publicado',
    unpublished: 'Recurso despublicado',
    archived: 'Recurso archivado'
  };
  return titles[type] || 'Centro de Recursos actualizado';
}

function resourceVerb(type) {
  const verbs = {
    created: 'creado',
    updated: 'actualizado',
    published: 'publicado',
    unpublished: 'despublicado',
    archived: 'archivado'
  };
  return verbs[type] || 'actualizado';
}

function configurationTitle(type) {
  const titles = {
    settings_saved: 'Configuracion actualizada',
    storage_checked: 'Revision de almacenamiento',
    integration_error: 'Error de integracion',
    environment_incomplete: 'Variables de entorno incompletas'
  };
  return titles[type] || 'Configuracion actualizada';
}

function configurationMessage(type, settings) {
  if (type === 'storage_checked') return 'Se ha comprobado el estado del almacenamiento.';
  if (type === 'integration_error') return 'Hay una integracion que requiere revision.';
  if (type === 'environment_incomplete') return 'Faltan variables de entorno necesarias.';
  return `La configuracion de ${settings?.name || 'la asociacion'} ha cambiado.`;
}

function agendaTitle(type) {
  const titles = {
    campaign_generated: 'Campana operativa generada',
    campaign_created: 'Campana creada',
    campaign_updated: 'Campana actualizada',
    campaign_cancelled: 'Campana cancelada',
    event_created: 'Evento creado',
    event_updated: 'Evento actualizado',
    event_deleted: 'Evento eliminado'
  };
  return titles[type] || 'Agenda Operativa actualizada';
}

function agendaMessage(type, target) {
  const name = target?.title || target?.name || 'Un registro de agenda';
  if (type === 'campaign_generated') return `${name} se ha generado desde el Motor de Campanas.`;
  if (type === 'campaign_cancelled') return `${name} ha sido cancelada.`;
  if (type === 'event_deleted') return `${name} ha sido eliminado.`;
  return `${name} se ha actualizado en la Agenda Operativa.`;
}

export function notificationTypeLabel(type) {
  return notificationLabel(NOTIFICATION_TYPES, normalizeType(type));
}

export function notificationModuleLabel(moduleId) {
  return notificationLabel(NOTIFICATION_MODULES, normalizeModule(moduleId));
}
