import { normalize, todayISO } from '../../lib/formatters';
import { callPortalApi } from '../../lib/portalOtpClient';
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

function cleanText(value) {
  return String(value || '').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function normalizePaymentMethod(value) {
  const key = normalize(value);
  if (key.includes('paypal')) return 'PayPal';
  if (key.includes('stripe') || key.includes('tarjeta')) return 'Stripe';
  if (key.includes('transfer')) return 'Transferencia';
  return 'Bizum';
}

export class DonanteService {
  constructor({
    repository,
    donors = [],
    donations = [],
    campaigns = [],
    certificates = [],
    audit = async () => {},
    donacionService = null,
    dashboardService = null,
    notificacionService = null
  } = {}) {
    if (!repository) throw new Error('DonanteService necesita un repository.');
    this.repository = repository;
    this.donors = donors;
    this.donations = donations;
    this.campaigns = campaigns;
    this.certificates = certificates;
    this.audit = audit;
    this.donacionService = donacionService;
    this.dashboardService = dashboardService;
    this.notificacionService = notificacionService;
  }

  async requestAccessOtp(email) {
    return callPortalApi('request-access', {
      portal: 'donor',
      credentials: { email }
    });
  }

  async verifyAccessOtp({ email, code, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: 'donor',
      credentials: { email },
      code,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async requestSensitiveOtp(session, action = 'sensitive_action') {
    return callPortalApi('request-sensitive', {
      portal: 'donor',
      session,
      portalAction: action
    });
  }

  async verifySensitiveOtp({ session, code, challengeId, action } = {}) {
    const response = await callPortalApi('verify-sensitive', {
      portal: 'donor',
      session,
      code,
      challengeId,
      portalAction: action
    });
    return response.verified === true;
  }

  async getPortalOverview(session) {
    const donor = await this.requireDonorFromSession(session);
    const [donations, campaigns, profileUpdates, certificates] = await Promise.all([
      this.readDonations(),
      this.readCampaigns(),
      this.repository.listProfileUpdates(),
      this.repository.listCertificates()
    ]);

    const donorDonations = this.filterByDonor(donations, donor)
      .sort((a, b) => String(b.donated_at || b.created_at || '').localeCompare(String(a.donated_at || a.created_at || '')));

    return {
      donor,
      latestDonation: donorDonations[0] || null,
      upcomingCampaigns: this.upcomingCampaigns(campaigns),
      activeCampaigns: this.activeCampaigns(campaigns),
      impact: this.buildImpact(donor, donorDonations),
      donations: donorDonations,
      profileUpdates: profileUpdates.filter((item) => item.donor_id === donor.id),
      certificates: certificates.filter((item) => item.donor_id === donor.id),
      auth: this.buildAuthDescriptor(donor),
      integrations: this.serviceIntegrations()
    };
  }

  async createDonationIntent(session, payload = {}) {
    const donor = await this.requireDonorFromSession(session);
    const paymentMethod = normalizePaymentMethod(payload.payment_method);
    const donationPayload = {
      donor_id: donor.id,
      donor: donor.name,
      donor_email: donor.email,
      donor_kind: 'Particular',
      donation_type: 'Economica',
      status: 'Pendiente',
      state: 'Pendiente',
      payment_method: paymentMethod,
      donated_at: payload.donated_at || todayISO(),
      estimated_value: Number(payload.amount || payload.estimated_value || 0),
      amount: Number(payload.amount || payload.estimated_value || 0),
      campaign_id: cleanText(payload.campaign_id),
      frequency: cleanText(payload.frequency || 'Puntual'),
      notes: [
        `Metodo: ${paymentMethod}`,
        cleanText(payload.frequency) ? `Frecuencia: ${payload.frequency}` : '',
        cleanText(payload.notes)
      ].filter(Boolean).join('\n'),
      created_at: nowISO(),
      updated_at: nowISO()
    };

    const donation = this.donacionService?.recordPortalDonationRequest
      ? await this.donacionService.recordPortalDonationRequest(donationPayload, { source: 'donor_portal', donor })
      : await this.repository.createDonation(donationPayload);

    await this.audit(`Portal donaciones: nueva intencion de donacion de ${donor.name}`.trim());
    await this.dashboardService?.notifyDonationChanged?.({ type: 'donor_portal_intent', donation });
    await this.notificacionService?.notifyDonationChanged?.({ type: 'donor_portal_intent', donation });
    return donation;
  }

  async requestProfileUpdate(session, changes = {}, payload = {}) {
    const donor = await this.requireDonorFromSession(session);
    if (!changes || !Object.keys(changes).length) throw new Error('Indica los datos que quieres actualizar.');
    const update = await this.repository.createProfileUpdate({
      donor_id: donor.id,
      requested_changes: changes,
      status: 'pending',
      notes: cleanText(payload.notes),
      requested_at: nowISO(),
      created_at: nowISO(),
      updated_at: nowISO()
    });
    await this.audit(`Portal donaciones: solicitud de actualizacion de perfil de ${donor.name}`.trim());
    await this.notificacionService?.create?.({
      tipo: 'reminder',
      prioridad: 'reminder',
      modulo: 'donations',
      origen: 'Portal donaciones',
      titulo: 'Perfil de donante pendiente de revisar',
      mensaje: `${donor.name} ha solicitado modificar sus datos.`,
      entity_type: 'donor',
      entity_id: donor.id
    });
    return update;
  }

  async findDonorByEmail(email) {
    const target = lower(email);
    if (!target) return null;
    const donors = await this.readDonors();
    return donors.find((item) => lower(item.email) === target || lower(item.contact_email) === target) || null;
  }

  async requireDonor(donorId) {
    const donors = await this.readDonors();
    const donor = donors.find((item) => item.id === donorId);
    if (!donor) throw new Error('El donante no existe.');
    return donor;
  }

  async requireDonorFromSession(session) {
    const sessionRow = await this.requireActiveSession(session, 'donor');
    return this.requireDonor(sessionRow.subject_id);
  }

  async requireActiveSession(session, portal) {
    assertSessionShape(session, portal);
    const sessions = await this.repository.listSessions();
    const sessionRow = sessions.find((item) => item.token === session.token && item.portal === portal && item.subject_id === session.subjectId);
    if (!sessionRow || sessionRow.status !== 'active') {
      await this.audit(`Portal donaciones: acceso denegado por sesion no valida`);
      throw new Error('La sesion no es valida. Vuelve a acceder al portal.');
    }
    if (isExpired(sessionRow.expires_at)) {
      await this.repository.updateSession(sessionRow.id, { status: 'expired', updated_at: nowISO() });
      await this.audit(`Portal donaciones: sesion caducada`);
      throw new Error('La sesion ha caducado. Vuelve a acceder al portal.');
    }
    await this.repository.updateSession(sessionRow.id, { last_seen_at: nowISO(), updated_at: nowISO() });
    return sessionRow;
  }

  async logout(session) {
    await callPortalApi('logout', { portal: 'donor', session });
    return true;
  }

  async verifyStoredOtp({ donorId, code, challengeId, action }) {
    throw new Error('La validacion OTP del portal se realiza exclusivamente en servidor.');
  }

  async invalidatePendingOtps(donorId, action = '') {
    const otps = await this.repository.listOtps();
    const pending = otps.filter((item) => item.donor_id === donorId)
      .filter((item) => !action || item.action === action)
      .filter((item) => item.status === 'pending');
    for (const otp of pending) {
      await this.repository.updateOtp(otp.id, {
        status: 'revoked',
        updated_at: nowISO()
      });
    }
  }

  async readDonors() {
    if (this.donors.length) return this.donors;
    return this.repository.listDonors();
  }

  async readDonations() {
    if (this.donations.length) return this.donations;
    return this.repository.listDonations();
  }

  async readCampaigns() {
    if (this.campaigns.length) return this.campaigns;
    return this.repository.listCampaigns();
  }

  filterByDonor(donations, donor) {
    const email = lower(donor.email);
    const name = normalize(donor.name);
    return donations.filter((donation) => donation.donor_id === donor.id
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

  buildImpact(donor, donations = []) {
    return {
      ...DEFAULT_IMPACT,
      ...(donor.impact || {}),
      donationCount: donations.length,
      totalDonated: donations.reduce((total, donation) => total + Number(donation.amount || donation.estimated_value || 0), 0)
    };
  }

  buildAuthDescriptor(donor) {
    return {
      provider: 'server-api',
      supabaseAuthReady: true,
      email: cleanPortalText(donor.email),
      requiresOtpForSensitiveActions: true
    };
  }

  serviceIntegrations() {
    return {
      repository: Boolean(this.repository),
      donacionService: Boolean(this.donacionService),
      notificacionService: Boolean(this.notificacionService),
      dashboardService: Boolean(this.dashboardService),
      supabase: true
    };
  }
}
