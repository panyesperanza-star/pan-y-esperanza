import { normalize, todayISO } from '../../lib/formatters';
import { callPortalApi } from '../../lib/portalOtpClient';
import { sanitizeResourcePayload } from '../resources/RecursoService';
import {
  assertSessionShape,
  cleanPortalText,
  isExpired,
  nowISO
} from '../portalAuth/portalSecurity';

const DEFAULT_IMPACT = Object.freeze({
  familiesServed: 186,
  minorsServed: 73,
  foodKg: 4280,
  deliveriesCompleted: 1250,
  campaignsSupported: 12
});

const COLLABORATOR_TYPES = ['Empresa', 'Comercio', 'Asociación', 'Particular', 'Institución'];
const COLLABORATOR_STATUSES = ['Activo', 'Inactivo', 'En seguimiento'];

function cleanText(value) {
  return String(value || '').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function safeNow() {
  return new Date().toISOString();
}

function normalizeType(value) {
  const clean = cleanText(value);
  return COLLABORATOR_TYPES.find((item) => normalize(item) === normalize(clean)) || 'Empresa';
}

function normalizeStatus(value) {
  const clean = cleanText(value);
  return COLLABORATOR_STATUSES.find((item) => normalize(item) === normalize(clean)) || 'Activo';
}

function normalizePortalStatus(value, isActive) {
  const clean = cleanText(value);
  if (clean) return clean;
  return isActive ? 'Activo' : 'Inactivo';
}

function nextCollaboratorCode(collaborators = []) {
  const max = collaborators.reduce((highest, item) => {
    const match = String(item?.code || '').match(/COL-(\d+)/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `COL-${String(max + 1).padStart(6, '0')}`;
}

function collaboratorPayloadFromForm(payload = {}, current = {}, collaborators = []) {
  const name = cleanText(payload.name || current.name);
  const email = cleanText(payload.email || payload.access_email || current.email || current.access_email).toLowerCase();
  if (!name) throw new Error('El nombre del colaborador es obligatorio.');
  if (!email) throw new Error('El email del colaborador es obligatorio.');

  const now = safeNow();
  const isPortalActive = payload.is_active !== undefined
    ? payload.is_active === true || payload.is_active === 'true'
    : current.is_active === true;

  return {
    code: cleanText(current.code) || nextCollaboratorCode(collaborators),
    type: normalizeType(payload.type || current.type),
    name,
    tax_id: cleanText(payload.tax_id || current.tax_id),
    contact_name: cleanText(payload.contact_name || current.contact_name),
    email,
    access_email: cleanText(payload.access_email || payload.email || current.access_email || current.email).toLowerCase(),
    phone: cleanText(payload.phone || current.phone),
    address: cleanText(payload.address || current.address),
    status: normalizeStatus(payload.status || current.status),
    is_active: isPortalActive,
    portal_status: normalizePortalStatus(payload.portal_status || current.portal_status, isPortalActive),
    impact: payload.impact || current.impact || {},
    photo_data_url: Object.prototype.hasOwnProperty.call(payload, 'photo_data_url')
      ? cleanText(payload.photo_data_url)
      : cleanText(current.photo_data_url),
    notes: cleanText(payload.notes || current.notes),
    updated_at: now
  };
}

function normalizeDonationType(value) {
  const key = normalize(value);
  if (key.includes('econom')) return 'Economica';
  if (key.includes('serv')) return 'Servicios';
  return 'Productos';
}

function amountOrQuantity(payload = {}) {
  const amount = cleanText(payload.amount || payload.importe);
  const quantity = cleanText(payload.quantity || payload.cantidad);
  if (amount) return amount;
  if (quantity) return quantity;
  return cleanText(payload.description || payload.descripcion);
}

export class ColaboradorService {
  constructor({
    repository,
    collaborators = [],
    donations = [],
    resources = [],
    campaigns = [],
    certificates = [],
    audit = async () => {},
    donacionService = null,
    recursoService = null,
    notificacionService = null,
    dashboardService = null,
    assertPermission = () => {}
  } = {}) {
    if (!repository) throw new Error('ColaboradorService necesita un repository.');
    this.repository = repository;
    this.collaborators = collaborators;
    this.donations = donations;
    this.resources = resources;
    this.campaigns = campaigns;
    this.certificates = certificates;
    this.audit = audit;
    this.donacionService = donacionService;
    this.recursoService = recursoService;
    this.notificacionService = notificacionService;
    this.dashboardService = dashboardService;
    this.assertPermission = assertPermission;
  }

  async create(payload = {}) {
    this.assertPermission('collaborators', 'create');
    const collaborators = await this.readCollaborators();
    const clean = collaboratorPayloadFromForm(payload, { is_active: false }, collaborators);
    const created = await this.repository.createCollaborator({
      ...clean,
      is_active: false,
      portal_status: 'Inactivo',
      created_at: safeNow()
    });
    await this.audit(`Colaboradores: creo ficha ${created.name}`.trim());
    await this.notificacionService?.create?.({
      tipo: 'info',
      prioridad: 'info',
      modulo: 'collaborators',
      origen: 'Colaboradores',
      titulo: 'Nuevo colaborador registrado',
      mensaje: `${created.name} ya tiene ficha de colaborador y portal preparado.`,
      entity_type: 'collaborator',
      entity_id: created.id
    });
    await this.dashboardService?.notifyDonationChanged?.({ type: 'collaborator_created', collaborator: created });
    return created;
  }

  async update(id, payload = {}) {
    this.assertPermission('collaborators', 'edit');
    const current = await this.requireCollaborator(id);
    const collaborators = await this.readCollaborators();
    const clean = collaboratorPayloadFromForm(payload, current, collaborators);
    const updated = await this.repository.updateCollaborator(id, clean);
    await this.audit(`Colaboradores: actualizo ficha ${updated.name || current.name}`.trim());
    return updated;
  }

  async activatePortal(id) {
    this.assertPermission('collaborators', 'edit');
    const current = await this.requireCollaborator(id);
    const email = cleanText(current.access_email || current.email).toLowerCase();
    if (!email) throw new Error('El colaborador necesita un email de acceso.');
    const updated = await this.repository.updateCollaborator(id, {
      access_email: email,
      email,
      is_active: true,
      portal_status: 'Activo',
      portal_activated_at: safeNow(),
      updated_at: safeNow()
    });
    await this.audit(`Colaboradores: activo portal para ${updated.name || current.name}`.trim());
    return updated;
  }

  async deactivatePortal(id) {
    this.assertPermission('collaborators', 'edit');
    const current = await this.requireCollaborator(id);
    const updated = await this.repository.updateCollaborator(id, {
      is_active: false,
      portal_status: 'Inactivo',
      portal_deactivated_at: safeNow(),
      updated_at: safeNow()
    });
    await this.audit(`Colaboradores: desactivo portal para ${updated.name || current.name}`.trim());
    return updated;
  }

  async resendAccess(id) {
    this.assertPermission('collaborators', 'edit');
    const current = await this.requireCollaborator(id);
    if (current.is_active === false) throw new Error('Activa el portal antes de reenviar el acceso.');
    const email = cleanText(current.access_email || current.email).toLowerCase();
    if (!email) throw new Error('El colaborador necesita un email de acceso.');
    const response = await this.requestAccessOtp(email);
    await this.repository.updateCollaborator(id, {
      last_otp_sent_at: safeNow(),
      updated_at: safeNow()
    });
    await this.audit(`Colaboradores: reenvio acceso al portal para ${current.name}`.trim());
    return response;
  }

  async requestAccessOtp(email) {
    return callPortalApi('request-access', {
      portal: 'collaborator',
      credentials: { email }
    });
  }

  async verifyAccessOtp({ email, code, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: 'collaborator',
      credentials: { email },
      code,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async requestSensitiveOtp(session, action = 'sensitive_action') {
    return callPortalApi('request-sensitive', {
      portal: 'collaborator',
      session,
      portalAction: action
    });
  }

  async verifySensitiveOtp({ session, code, challengeId, action } = {}) {
    const response = await callPortalApi('verify-sensitive', {
      portal: 'collaborator',
      session,
      code,
      challengeId,
      portalAction: action
    });
    return response.verified === true;
  }

  async getPortalOverview(session) {
    const collaborator = await this.requireCollaboratorFromSession(session);
    const [donations, campaigns, resources, profileUpdates, requests, certificates] = await Promise.all([
      this.readDonations(),
      this.readCampaigns(),
      this.readResources(),
      this.repository.listProfileUpdates(),
      this.repository.listRequests(),
      this.repository.listCertificates()
    ]);

    const collaboratorDonations = this.filterByCollaborator(donations, collaborator)
      .sort((a, b) => String(b.donated_at || b.created_at || '').localeCompare(String(a.donated_at || a.created_at || '')));
    const collaboratorResources = resources
      .filter((resource) => resource.collaborator_id === collaborator.id || lower(resource.email) === lower(collaborator.email) || lower(resource.created_by_email) === lower(collaborator.email))
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const collaboratorRequests = requests
      .filter((request) => request.collaborator_id === collaborator.id)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    return {
      collaborator,
      latestCollaboration: collaboratorDonations[0] || null,
      upcomingCampaigns: this.upcomingCampaigns(campaigns),
      activeCampaigns: this.activeCampaigns(campaigns),
      impact: this.buildImpact(collaborator, collaboratorDonations),
      donations: collaboratorDonations,
      resources: collaboratorResources,
      profileUpdates: profileUpdates.filter((item) => item.collaborator_id === collaborator.id),
      requests: collaboratorRequests,
      certificates: certificates.filter((item) => item.collaborator_id === collaborator.id),
      auth: this.buildAuthDescriptor(collaborator),
      integrations: this.serviceIntegrations()
    };
  }

  async createDonationRequest(session, payload = {}) {
    const collaborator = await this.requireCollaboratorFromSession(session);
    const donationType = normalizeDonationType(payload.donation_type);
    const donation = await this.repository.createDonation({
      collaborator_id: collaborator.id,
      donor: collaborator.name,
      donor_email: collaborator.email,
      donor_kind: collaborator.type || 'Colaborador',
      donation_type: donationType,
      status: 'Pendiente',
      state: 'Pendiente',
      donated_at: payload.proposed_date || todayISO(),
      estimated_value: Number(payload.amount || payload.estimated_value || 0),
      quantity: cleanText(payload.quantity),
      pickup_requested: payload.pickup_requested === true,
      proposed_pickup_at: payload.proposed_pickup_at || '',
      notes: [
        cleanText(payload.description),
        cleanText(payload.observations),
        payload.pickup_requested ? 'Solicita recogida.' : ''
      ].filter(Boolean).join('\n'),
      created_at: nowISO(),
      updated_at: nowISO()
    });

    await this.audit(`Portal colaboradores: nueva propuesta de donacion de ${collaborator.name}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'collaborator_portal_request', donation });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'collaborator_portal_request', donation });
    return donation;
  }

  async proposeResource(session, payload = {}) {
    const collaborator = await this.requireCollaboratorFromSession(session);
    const resource = sanitizeResourcePayload({
      ...payload,
      status: 'draft',
      colaborador_id: collaborator.id,
      collaborator_id: collaborator.id,
      email: collaborator.email,
      created_by_email: collaborator.email,
      url: payload.url || '/#contacto'
    }, {}, { now: nowISO(), userId: collaborator.id });
    const created = await this.repository.createResource({
      ...resource,
      collaborator_id: collaborator.id,
      created_by_email: collaborator.email,
      review_status: 'pending'
    });

    await this.audit(`Portal colaboradores: recurso propuesto por ${collaborator.name}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'created', resource: created });
    return created;
  }

  async requestProfileUpdate(session, changes = {}, payload = {}) {
    const collaborator = await this.requireCollaboratorFromSession(session);
    if (!changes || !Object.keys(changes).length) throw new Error('Indica los datos que quieres actualizar.');
    const update = await this.repository.createProfileUpdate({
      collaborator_id: collaborator.id,
      requested_changes: changes,
      status: 'pending',
      notes: cleanText(payload.notes),
      requested_at: nowISO(),
      created_at: nowISO(),
      updated_at: nowISO()
    });
    await this.audit(`Portal colaboradores: solicitud de actualizacion de perfil de ${collaborator.name}`.trim());
    await this.notificacionService?.create?.({
      tipo: 'reminder',
      prioridad: 'reminder',
      modulo: 'donations',
      origen: 'Portal colaboradores',
      titulo: 'Perfil de colaborador pendiente de revisar',
      mensaje: `${collaborator.name} ha solicitado modificar sus datos.`,
      entity_type: 'collaborator',
      entity_id: collaborator.id
    });
    return update;
  }

  async joinCampaign(session, campaignId) {
    const collaborator = await this.requireCollaboratorFromSession(session);
    const campaign = (await this.readCampaigns()).find((item) => item.id === campaignId);
    if (!campaign) throw new Error('La campana no existe.');
    const request = await this.repository.createRequest({
      collaborator_id: collaborator.id,
      request_type: 'join_campaign',
      campaign_id: campaign.id,
      title: `Solicitud para unirse a ${campaign.name || campaign.title}`,
      status: 'pending',
      created_at: nowISO(),
      updated_at: nowISO()
    });
    await this.audit(`Portal colaboradores: ${collaborator.name} solicita unirse a ${campaign.name || campaign.id}`.trim());
    await this.notificacionService?.create?.({
      tipo: 'info',
      prioridad: 'info',
      modulo: 'agenda',
      origen: 'Portal colaboradores',
      titulo: 'Nueva solicitud de colaboracion en campana',
      mensaje: `${collaborator.name} quiere unirse a ${campaign.name || 'una campana'}.`,
      entity_type: 'campaign',
      entity_id: campaign.id
    });
    return request;
  }

  async findCollaboratorByEmail(email) {
    const target = lower(email);
    if (!target) return null;
    const collaborators = await this.readCollaborators();
    return collaborators.find((item) => lower(item.email) === target || lower(item.contact_email) === target) || null;
  }

  async requireCollaborator(collaboratorId) {
    const collaborators = await this.readCollaborators();
    const collaborator = collaborators.find((item) => item.id === collaboratorId);
    if (!collaborator) throw new Error('El colaborador no existe.');
    return collaborator;
  }

  async requireCollaboratorFromSession(session) {
    const sessionRow = await this.requireActiveSession(session, 'collaborator');
    return this.requireCollaborator(sessionRow.subject_id);
  }

  async requireActiveSession(session, portal) {
    assertSessionShape(session, portal);
    const sessions = await this.repository.listSessions();
    const sessionRow = sessions.find((item) => item.token === session.token && item.portal === portal && item.subject_id === session.subjectId);
    if (!sessionRow || sessionRow.status !== 'active') {
      await this.audit(`Portal colaboradores: acceso denegado por sesion no valida`);
      throw new Error('La sesion no es valida. Vuelve a acceder al portal.');
    }
    if (isExpired(sessionRow.expires_at)) {
      await this.repository.updateSession(sessionRow.id, { status: 'expired', updated_at: nowISO() });
      await this.audit(`Portal colaboradores: sesion caducada`);
      throw new Error('La sesion ha caducado. Vuelve a acceder al portal.');
    }
    await this.repository.updateSession(sessionRow.id, { last_seen_at: nowISO(), updated_at: nowISO() });
    return sessionRow;
  }

  async logout(session) {
    await callPortalApi('logout', { portal: 'collaborator', session });
    return true;
  }

  async verifyStoredOtp({ collaboratorId, code, challengeId, action }) {
    throw new Error('La validacion OTP del portal se realiza exclusivamente en servidor.');
  }

  async invalidatePendingOtps(collaboratorId, action = '') {
    const otps = await this.repository.listOtps();
    const pending = otps.filter((item) => item.collaborator_id === collaboratorId)
      .filter((item) => !action || item.action === action)
      .filter((item) => item.status === 'pending');
    for (const otp of pending) {
      await this.repository.updateOtp(otp.id, {
        status: 'revoked',
        updated_at: nowISO()
      });
    }
  }

  async readCollaborators() {
    if (this.collaborators.length) return this.collaborators;
    return this.repository.listCollaborators();
  }

  async readDonations() {
    if (this.donations.length) return this.donations;
    return this.repository.listDonations();
  }

  async readCampaigns() {
    if (this.campaigns.length) return this.campaigns;
    return this.repository.listCampaigns();
  }

  async readResources() {
    if (this.recursoService?.list) return this.recursoService.list();
    if (this.resources.length) return this.resources;
    return this.repository.listResources();
  }

  filterByCollaborator(donations, collaborator) {
    const email = lower(collaborator.email);
    const name = normalize(collaborator.name);
    return donations.filter((donation) => donation.collaborator_id === collaborator.id
      || lower(donation.donor_email) === email
      || normalize(donation.donor) === name);
  }

  upcomingCampaigns(campaigns) {
    const today = todayISO();
    return campaigns
      .filter((campaign) => String(campaign.start_date || campaign.created_at || '') >= today)
      .filter((campaign) => !['Cancelada', 'Finalizada'].includes(campaign.status))
      .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
      .slice(0, 6);
  }

  activeCampaigns(campaigns) {
    return campaigns
      .filter((campaign) => ['Activa', 'Planificada'].includes(campaign.status))
      .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
      .slice(0, 8);
  }

  buildImpact(collaborator, donations = []) {
    return {
      ...DEFAULT_IMPACT,
      ...(collaborator.impact || {}),
      donationCount: donations.length,
      totalEstimatedValue: donations.reduce((total, donation) => total + Number(donation.estimated_value || donation.amount || 0), 0)
    };
  }

  buildAuthDescriptor(collaborator) {
    return {
      provider: 'server-api',
      supabaseAuthReady: true,
      email: cleanPortalText(collaborator.email),
      requiresOtpForSensitiveActions: true
    };
  }

  donationSummary(donation) {
    return amountOrQuantity(donation) || donation.donation_type || 'Colaboracion registrada';
  }

  serviceIntegrations() {
    return {
      repository: Boolean(this.repository),
      donacionService: Boolean(this.donacionService),
      recursoService: Boolean(this.recursoService),
      notificacionService: Boolean(this.notificacionService),
      dashboardService: Boolean(this.dashboardService),
      supabase: true
    };
  }
}
