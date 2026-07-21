import { normalize } from '../../lib/formatters';
import { callPortalApi } from '../../lib/portalOtpClient';
import {
  assertSessionShape,
  cleanPortalText,
  isExpired,
  nowISO
} from '../portalAuth/portalSecurity';

export const BENEFICIARIO_PORTAL_FEATURES = Object.freeze([
  'upcoming_deliveries',
  'history',
  'documents',
  'personalized_resources',
  'notices',
  'renewals',
  'profile_updates'
]);

function cleanText(value) {
  return String(value || '').trim();
}

const ACCESS_LOCK_MAX_ATTEMPTS = 5;
const ACCESS_LOCK_MINUTES = 15;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isActiveDelivery(delivery) {
  return normalize(delivery?.status) !== 'anulada';
}

function isPublishedResource(resource) {
  return resource?.publicado === true && normalize(resource?.status) === 'published';
}

function sortByDateAsc(a, b, field) {
  return String(a?.[field] || '').localeCompare(String(b?.[field] || ''));
}

function sortByDateDesc(a, b, field) {
  return String(b?.[field] || '').localeCompare(String(a?.[field] || ''));
}

function sanitizePortalAccountPayload(beneficiary, payload = {}) {
  return {
    beneficiary_id: beneficiary.id,
    auth_user_id: payload.auth_user_id || null,
    email: cleanText(payload.email || beneficiary.email).toLowerCase(),
    phone: cleanText(payload.phone || beneficiary.phone),
    status: cleanText(payload.status || 'draft'),
    access_level: cleanText(payload.access_level || 'beneficiary'),
    invited_at: payload.invited_at || null,
    activated_at: payload.activated_at || null,
    last_login_at: payload.last_login_at || null,
    notes: cleanText(payload.notes),
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function sanitizeNoticePayload(beneficiaryId, payload = {}) {
  const title = cleanText(payload.title || payload.titulo);
  const message = cleanText(payload.message || payload.mensaje);
  if (!title) throw new Error('El titulo del aviso es obligatorio.');
  if (!message) throw new Error('El mensaje del aviso es obligatorio.');

  return {
    beneficiary_id: beneficiaryId,
    title,
    message,
    notice_type: cleanText(payload.notice_type || payload.type || 'general'),
    status: cleanText(payload.status || 'unread'),
    read_at: payload.read_at || null,
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function sanitizeRenewalPayload(beneficiaryId, payload = {}) {
  return {
    beneficiary_id: beneficiaryId,
    renewal_type: cleanText(payload.renewal_type || payload.type || 'general'),
    renewal_due_at: payload.renewal_due_at || payload.due_at || null,
    status: cleanText(payload.status || 'pending'),
    notes: cleanText(payload.notes),
    requested_at: payload.requested_at || new Date().toISOString(),
    resolved_at: payload.resolved_at || null,
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function sanitizeProfileUpdatePayload(beneficiaryId, changes = {}, payload = {}) {
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
    throw new Error('Indica los datos que se desean actualizar.');
  }

  return {
    beneficiary_id: beneficiaryId,
    requested_changes: changes,
    status: cleanText(payload.status || 'pending'),
    requested_at: payload.requested_at || new Date().toISOString(),
    resolved_at: payload.resolved_at || null,
    reviewed_by: payload.reviewed_by || null,
    notes: cleanText(payload.notes),
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function sanitizeRequestPayload(beneficiaryId, payload = {}) {
  const requestType = cleanText(payload.request_type || payload.type || 'general');
  const message = cleanText(payload.message || payload.notes);
  if (!message) throw new Error('Describe brevemente tu solicitud.');

  return sanitizeProfileUpdatePayload(
    beneficiaryId,
    {
      request_type: requestType,
      message,
      preferred_contact: cleanText(payload.preferred_contact)
    },
    {
      ...payload,
      notes: message,
      status: payload.status || 'pending'
    }
  );
}

function normalizeAccessIdentifier(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '');
}

function randomDigits(length = 6) {
  const array = new Uint32Array(length);
  globalThis.crypto.getRandomValues(array);
  return [...array].map((value) => String(value % 10)).join('');
}

function randomHex(bytes = 8) {
  const array = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(array);
  return [...array].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateAccessIdentifier(accounts = []) {
  const existing = new Set(accounts.map((item) => normalizeAccessIdentifier(item.access_identifier)));
  let candidate = '';
  do {
    candidate = `PYE-${randomHex(6).toUpperCase()}`;
  } while (existing.has(candidate));
  return candidate;
}

async function hashAccessPin(pin, salt) {
  const material = `${cleanText(pin)}:${cleanText(salt)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isLocked(account) {
  return account?.locked_until && new Date(account.locked_until).getTime() > Date.now();
}

function nextLockUntil(attempts) {
  return attempts >= ACCESS_LOCK_MAX_ATTEMPTS
    ? new Date(Date.now() + ACCESS_LOCK_MINUTES * 60 * 1000).toISOString()
    : null;
}

export class BeneficiarioPortalService {
  constructor({
    repository,
    beneficiaries = [],
    deliveries = [],
    documents = [],
    socialHistory = [],
    resources = [],
    notifications = [],
    audit = async () => {},
    beneficiarioService = null,
    entregaService = null,
    recursoService = null,
    notificacionService = null
  } = {}) {
    if (!repository) throw new Error('BeneficiarioPortalService necesita un repository.');
    this.repository = repository;
    this.beneficiaries = beneficiaries;
    this.deliveries = deliveries;
    this.documents = documents;
    this.socialHistory = socialHistory;
    this.resources = resources;
    this.notifications = notifications;
    this.audit = audit;
    this.beneficiarioService = beneficiarioService;
    this.entregaService = entregaService;
    this.recursoService = recursoService;
    this.notificacionService = notificacionService;
  }

  async authenticate({ accessIdentifier, pin } = {}) {
    return this.requestAccessOtp({ accessIdentifier, pin });
  }

  async requestAccessOtp({ accessIdentifier, pin } = {}) {
    return callPortalApi('request-access', {
      portal: 'beneficiary',
      credentials: { accessIdentifier, pin }
    });
  }

  async verifyAccessOtp({ accessIdentifier, pin, otpCode, challengeId } = {}) {
    const response = await callPortalApi('verify-access', {
      portal: 'beneficiary',
      credentials: { accessIdentifier, pin },
      code: otpCode,
      challengeId
    });
    return { session: response.session, auth: response.auth };
  }

  async validateAccessCredentials({ accessIdentifier, pin } = {}) {
    const cleanIdentifier = normalizeAccessIdentifier(accessIdentifier);
    const cleanPin = cleanText(pin);
    if (!cleanIdentifier) throw new Error('Introduce tu identificador privado.');
    if (!cleanPin) throw new Error('Introduce tu PIN de acceso.');

    const accounts = await this.repository.listAccounts();
    const account = accounts.find((item) => normalizeAccessIdentifier(item.access_identifier) === cleanIdentifier) || null;
    if (!account) {
      await this.audit('Portal beneficiario: acceso denegado por identificador no reconocido');
      throw new Error('No hemos podido validar los datos de acceso.');
    }
    if (isLocked(account)) {
      await this.audit('Portal beneficiario: acceso bloqueado por intentos fallidos');
      throw new Error('Acceso bloqueado temporalmente por seguridad. Intentalo mas tarde.');
    }
    if (!account.pin_hash || !account.pin_salt) {
      await this.audit('Portal beneficiario: acceso denegado por PIN no configurado');
      throw new Error('El acceso seguro no esta activado. Contacta con Pan y Esperanza.');
    }
    const expectedHash = await hashAccessPin(cleanPin, account.pin_salt);
    if (cleanText(account.pin_hash) !== expectedHash) {
      await this.registerFailedAccessAttempt(account);
      throw new Error('No hemos podido validar los datos de acceso.');
    }

    const beneficiaries = await this.readBeneficiaries();
    const beneficiary = beneficiaries.find((item) => item.id === account.beneficiary_id);
    if (!beneficiary) throw new Error('No hemos podido validar los datos de acceso.');
    if (beneficiary.is_active === false) {
      throw new Error('El expediente no esta activo. Contacta con Pan y Esperanza.');
    }

    await this.resetAccessAttempts(account);
    await this.audit(`Portal beneficiario: primer factor seguro validado para ${beneficiary.code || beneficiary.id}`.trim());
    return {
      beneficiary,
      account
    };
  }

  async requestOtp(session, action = 'sensitive_action') {
    return callPortalApi('request-sensitive', {
      portal: 'beneficiary',
      session,
      portalAction: action
    });
  }

  async verifyOtp({ session, code, challengeId, action } = {}) {
    const response = await callPortalApi('verify-sensitive', {
      portal: 'beneficiary',
      session,
      code,
      challengeId,
      portalAction: action
    });
    return response.verified === true;
  }

  async getPortalOverview(session) {
    const beneficiary = await this.requireBeneficiaryFromSession(session);
    const [
      upcomingDeliveries,
      history,
      documents,
      personalizedResources,
      notices,
      renewals,
      profileUpdates
    ] = await Promise.all([
      this.getUpcomingDeliveries(beneficiary.id),
      this.getHistory(beneficiary.id),
      this.getDocuments(beneficiary.id),
      this.getPersonalizedResources(beneficiary.id),
      this.getNotices(beneficiary.id),
      this.getRenewals(beneficiary.id),
      this.getProfileUpdates(beneficiary.id)
    ]);

    return {
      beneficiary,
      upcomingDeliveries,
      history,
      documents,
      personalizedResources,
      notices,
      renewals,
      profileUpdates
    };
  }

  async createAccessDraft(beneficiaryId, payload = {}) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const account = await this.repository.createAccount(sanitizePortalAccountPayload(beneficiary, payload));
    await this.audit(`Portal beneficiario: preparo acceso para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'access_draft_created', account });
    return account;
  }

  async getAccountForBeneficiary(beneficiaryId) {
    const accounts = await this.repository.listAccounts();
    return accounts.find((item) => item.beneficiary_id === beneficiaryId) || null;
  }

  async activateAccess(beneficiaryId) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const accounts = await this.repository.listAccounts();
    const current = accounts.find((item) => item.beneficiary_id === beneficiary.id) || null;
    const temporaryPin = randomDigits(6);
    const salt = randomHex(12);
    const now = nowISO();
    const payload = {
      beneficiary_id: beneficiary.id,
      auth_user_id: current?.auth_user_id || null,
      access_identifier: normalizeAccessIdentifier(current?.access_identifier) || generateAccessIdentifier(accounts),
      pin_hash: await hashAccessPin(temporaryPin, salt),
      pin_salt: salt,
      pin_set_at: now,
      failed_access_attempts: 0,
      last_failed_access_at: null,
      locked_until: null,
      email: cleanText(beneficiary.email || current?.email).toLowerCase(),
      phone: cleanText(beneficiary.phone || current?.phone),
      status: 'active',
      access_level: current?.access_level || 'beneficiary',
      invited_at: current?.invited_at || now,
      activated_at: now,
      notes: cleanText(current?.notes),
      updated_at: now
    };

    const account = current
      ? await this.repository.updateAccount(current.id, payload)
      : await this.repository.createAccount({ ...payload, created_at: now });

    await this.audit(`Portal beneficiario: acceso activado para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'access_activated', account });
    return { account, temporaryPin };
  }

  async deactivateAccess(beneficiaryId) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const account = await this.getAccountForBeneficiary(beneficiary.id);
    if (!account) throw new Error('El beneficiario no tiene portal configurado.');
    const updated = await this.repository.updateAccount(account.id, {
      status: 'suspended',
      locked_until: null,
      updated_at: nowISO()
    });
    await this.audit(`Portal beneficiario: acceso desactivado para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'access_deactivated', account: updated });
    return updated;
  }

  async regeneratePin(beneficiaryId) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const account = await this.getAccountForBeneficiary(beneficiary.id);
    if (!account) return this.activateAccess(beneficiary.id);
    const temporaryPin = randomDigits(6);
    const salt = randomHex(12);
    const updated = await this.repository.updateAccount(account.id, {
      pin_hash: await hashAccessPin(temporaryPin, salt),
      pin_salt: salt,
      pin_set_at: nowISO(),
      failed_access_attempts: 0,
      last_failed_access_at: null,
      locked_until: null,
      status: 'active',
      updated_at: nowISO()
    });
    await this.audit(`Portal beneficiario: PIN regenerado para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'pin_regenerated', account: updated });
    return { account: updated, temporaryPin };
  }

  async sendAccess(beneficiaryId) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const account = await this.getAccountForBeneficiary(beneficiary.id);
    if (!account) throw new Error('Activa el portal antes de enviar el acceso.');
    const updated = await this.repository.updateAccount(account.id, {
      invited_at: nowISO(),
      updated_at: nowISO()
    });
    await this.audit(`Portal beneficiario: acceso enviado para ${beneficiary.full_name || beneficiary.id}`.trim());
    return updated;
  }

  async activatePendingAccesses() {
    const beneficiaries = await this.readBeneficiaries();
    const accounts = await this.repository.listAccounts();
    const activeWithPin = new Set(
      accounts
        .filter((account) => account.status === 'active' && account.pin_hash)
        .map((account) => account.beneficiary_id)
    );
    const pending = beneficiaries.filter((beneficiary) => beneficiary.is_active !== false && !activeWithPin.has(beneficiary.id));
    const results = [];

    for (const beneficiary of pending) {
      results.push({
        beneficiaryId: beneficiary.id,
        ...(await this.activateAccess(beneficiary.id))
      });
    }

    await this.audit(`Portal beneficiario: activacion masiva completada. Activados ${results.length}, omitidos ${beneficiaries.length - pending.length}`.trim());
    return {
      activated: results.length,
      omitted: beneficiaries.length - pending.length,
      results
    };
  }

  async requestProfileUpdate(session, changes, payload = {}) {
    const beneficiary = await this.requireBeneficiaryFromSession(session);
    const request = await this.repository.createProfileUpdate(
      sanitizeProfileUpdatePayload(beneficiary.id, changes, payload)
    );
    await this.audit(`Portal beneficiario: solicitud de actualizacion de datos para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'profile_update_requested', request });
    return request;
  }

  async createRequest(session, payload = {}) {
    const beneficiary = await this.requireBeneficiaryFromSession(session);
    const request = await this.repository.createProfileUpdate(sanitizeRequestPayload(beneficiary.id, payload));
    await this.audit(`Portal beneficiario: solicitud creada para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'request_created', request });
    return request;
  }

  async createNotice(beneficiaryId, payload = {}) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const notice = await this.repository.createNotice(sanitizeNoticePayload(beneficiary.id, payload));
    await this.audit(`Portal beneficiario: aviso creado para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'notice_created', notice });
    return notice;
  }

  async markNoticeRead(id) {
    const notice = await this.repository.updateNotice(id, {
      status: 'read',
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await this.audit('Portal beneficiario: aviso marcado como leido');
    return notice;
  }

  async createRenewal(beneficiaryId, payload = {}) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const renewal = await this.repository.createRenewal(sanitizeRenewalPayload(beneficiary.id, payload));
    await this.audit(`Portal beneficiario: renovacion preparada para ${beneficiary.full_name || beneficiary.id}`.trim());
    await this.notificacionService?.notifyBeneficiaryPortalChanged?.({ type: 'renewal_created', renewal });
    return renewal;
  }

  async resolveRenewal(id, payload = {}) {
    const renewal = await this.repository.updateRenewal(id, {
      status: cleanText(payload.status || 'resolved'),
      resolved_at: payload.resolved_at || new Date().toISOString(),
      notes: cleanText(payload.notes),
      updated_at: new Date().toISOString()
    });
    await this.audit('Portal beneficiario: renovacion actualizada');
    return renewal;
  }

  async getUpcomingDeliveries(beneficiaryId) {
    const deliveries = await this.readDeliveries();
    const today = todayISO();
    return deliveries
      .filter((delivery) => delivery.beneficiary_id === beneficiaryId)
      .filter(isActiveDelivery)
      .filter((delivery) => String(delivery.delivered_at || '') >= today)
      .sort((a, b) => sortByDateAsc(a, b, 'delivered_at'));
  }

  async getHistory(beneficiaryId) {
    const [history, deliveries] = await Promise.all([
      this.readSocialHistory(),
      this.readDeliveries()
    ]);

    const socialEntries = history
      .filter((entry) => entry.beneficiary_id === beneficiaryId)
      .map((entry) => ({
        ...entry,
        source: 'social_history',
        timeline_at: entry.date || entry.created_at
      }));

    const deliveryEntries = deliveries
      .filter((delivery) => delivery.beneficiary_id === beneficiaryId)
      .filter(isActiveDelivery)
      .map((delivery) => ({
        ...delivery,
        source: 'delivery',
        timeline_at: delivery.delivered_at || delivery.created_at
      }));

    return [...socialEntries, ...deliveryEntries].sort((a, b) => sortByDateDesc(a, b, 'timeline_at'));
  }

  async getDocuments(beneficiaryId) {
    const documents = await this.readDocuments();
    return documents
      .filter((document) => document.beneficiary_id === beneficiaryId)
      .sort((a, b) => sortByDateDesc(a, b, 'uploaded_at'));
  }

  async getPersonalizedResources(beneficiaryId) {
    const beneficiary = await this.requireBeneficiary(beneficiaryId);
    const resources = await this.readResources();
    const profileSignals = [
      beneficiary.situation,
      beneficiary.requested_help,
      beneficiary.address_full,
      beneficiary.postal_code
    ].map(normalize).filter(Boolean);

    return resources
      .filter(isPublishedResource)
      .filter((resource) => this.resourceMatchesBeneficiary(resource, profileSignals))
      .sort((a, b) => Number(b.destacado === true) - Number(a.destacado === true)
        || Number(b.sort_order || 0) - Number(a.sort_order || 0)
        || sortByDateDesc(a, b, 'published_at'));
  }

  async getNotices(beneficiaryId) {
    const notices = await this.repository.listNotices();
    const portalNotices = notices
      .filter((notice) => notice.beneficiary_id === beneficiaryId)
      .filter((notice) => normalize(notice.status) !== 'archived')
      .map((notice) => ({ ...notice, source: 'portal' }));
    const globalNotices = this.notifications
      .filter((notice) => notice.entity_id === beneficiaryId || notice.beneficiary_id === beneficiaryId)
      .filter((notice) => normalize(notice.estado || notice.status) !== 'archivada')
      .map((notice) => ({
        id: `notification-${notice.id}`,
        original_id: notice.id,
        beneficiary_id: beneficiaryId,
        title: notice.titulo || notice.title || notice.origen || 'Aviso',
        message: notice.mensaje || notice.message || '',
        notice_type: notice.tipo || notice.prioridad || 'general',
        status: notice.leida || notice.read_at ? 'read' : 'unread',
        read_at: notice.read_at || null,
        created_at: notice.created_at,
        source: 'notification'
      }));
    return [...portalNotices, ...globalNotices].sort((a, b) => sortByDateDesc(a, b, 'created_at'));
  }

  async getRenewals(beneficiaryId) {
    const renewals = await this.repository.listRenewals();
    return renewals
      .filter((renewal) => renewal.beneficiary_id === beneficiaryId)
      .sort((a, b) => sortByDateAsc(a, b, 'renewal_due_at'));
  }

  async getProfileUpdates(beneficiaryId) {
    const updates = await this.repository.listProfileUpdates();
    return updates
      .filter((update) => update.beneficiary_id === beneficiaryId)
      .sort((a, b) => sortByDateDesc(a, b, 'requested_at'));
  }

  async requireBeneficiary(beneficiaryId) {
    const beneficiaries = await this.readBeneficiaries();
    const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId);
    if (!beneficiary) throw new Error('El beneficiario no existe.');
    return beneficiary;
  }

  async requireBeneficiaryFromSession(session) {
    const sessionRow = await this.requireActiveSession(session, 'beneficiary');
    return this.requireBeneficiary(sessionRow.subject_id);
  }

  async requireActiveSession(session, portal) {
    assertSessionShape(session, portal);
    const sessions = await this.repository.listSessions();
    const sessionRow = sessions.find((item) => item.token === session.token && item.portal === portal && item.subject_id === session.subjectId);
    if (!sessionRow || sessionRow.status !== 'active') {
      await this.audit('Portal beneficiario: acceso denegado por sesion no valida');
      throw new Error('La sesion no es valida. Vuelve a acceder al portal.');
    }
    if (isExpired(sessionRow.expires_at)) {
      await this.repository.updateSession(sessionRow.id, { status: 'expired', updated_at: nowISO() });
      await this.audit('Portal beneficiario: sesion caducada');
      throw new Error('La sesion ha caducado. Vuelve a acceder al portal.');
    }
    await this.repository.updateSession(sessionRow.id, { last_seen_at: nowISO(), updated_at: nowISO() });
    return sessionRow;
  }

  async logout(session) {
    await callPortalApi('logout', { portal: 'beneficiary', session });
    return true;
  }

  async verifyStoredOtp({ beneficiaryId, code, challengeId, action } = {}) {
    throw new Error('La validacion OTP del portal se realiza exclusivamente en servidor.');
  }

  async invalidatePendingOtps(beneficiaryId, action = '') {
    const otps = await this.repository.listOtps();
    const pending = otps.filter((item) => item.beneficiary_id === beneficiaryId)
      .filter((item) => !action || item.action === action)
      .filter((item) => item.status === 'pending');
    for (const otp of pending) {
      await this.repository.updateOtp(otp.id, {
        status: 'revoked',
        updated_at: nowISO()
      });
    }
  }

  async registerFailedAccessAttempt(account) {
    const attempts = Number(account.failed_access_attempts || 0) + 1;
    await this.repository.updateAccount(account.id, {
      failed_access_attempts: attempts,
      last_failed_access_at: nowISO(),
      locked_until: nextLockUntil(attempts),
      updated_at: nowISO()
    });
    await this.audit(`Portal beneficiario: intento fallido ${attempts}/${ACCESS_LOCK_MAX_ATTEMPTS}`);
  }

  async resetAccessAttempts(account) {
    await this.repository.updateAccount(account.id, {
      failed_access_attempts: 0,
      locked_until: null,
      last_successful_access_at: nowISO(),
      last_login_at: nowISO(),
      updated_at: nowISO()
    });
  }

  async readBeneficiaries() {
    const serviceRows = asArray(this.beneficiarioService?.beneficiaries);
    if (serviceRows.length) return serviceRows;
    if (this.beneficiaries.length) return this.beneficiaries;
    return this.repository.listBeneficiaries();
  }

  async readDeliveries() {
    const serviceRows = asArray(this.entregaService?.deliveries);
    if (serviceRows.length) return serviceRows;
    if (this.deliveries.length) return this.deliveries;
    return this.repository.listDeliveries();
  }

  async readDocuments() {
    if (this.documents.length) return this.documents;
    return this.repository.listDocuments();
  }

  async readSocialHistory() {
    if (this.socialHistory.length) return this.socialHistory;
    return this.repository.listSocialHistory();
  }

  async readResources() {
    if (this.recursoService?.listPublished) return this.recursoService.listPublished();
    if (this.resources.length) return this.resources;
    return this.repository.listResources();
  }

  resourceMatchesBeneficiary(resource, profileSignals) {
    const resourceSignals = [
      resource.categoria_slug,
      resource.categoria_nombre,
      resource.provincia_slug,
      resource.provincia_nombre,
      resource.tipo,
      ...(Array.isArray(resource.etiquetas) ? resource.etiquetas : [])
    ].map(normalize).filter(Boolean);

    if (!profileSignals.length || !resourceSignals.length) return true;
    return resourceSignals.some((signal) => profileSignals.some((profile) => profile.includes(signal) || signal.includes(profile)));
  }

  buildAuthDescriptor(beneficiary, account = null) {
    const preferredChannel = beneficiary.email ? 'email' : beneficiary.phone ? 'sms' : 'manual';
    return {
      provider: 'server-api',
      supabaseAuthReady: true,
      authUserId: account?.auth_user_id || null,
      email: cleanPortalText(beneficiary.email),
      preferredChannel,
      requiresOtpForSensitiveActions: true
    };
  }

  serviceIntegrations() {
    return {
      beneficiarioService: Boolean(this.beneficiarioService),
      entregaService: Boolean(this.entregaService),
      recursoService: Boolean(this.recursoService),
      notificacionService: Boolean(this.notificacionService)
    };
  }
}
