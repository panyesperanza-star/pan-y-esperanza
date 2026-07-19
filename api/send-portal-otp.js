import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const OTP_TTL_MINUTES = 10;
const SESSION_TTL_HOURS = 8;

const PORTALS = Object.freeze({
  beneficiary: {
    label: 'Portal del Beneficiario',
    subjectTable: 'beneficiaries',
    otpTable: 'beneficiary_portal_otps',
    subjectKey: 'beneficiary_id',
    subjectType: 'beneficiary'
  },
  collaborator: {
    label: 'Portal de Colaboradores',
    subjectTable: 'collaborators',
    otpTable: 'collaborator_portal_otps',
    subjectKey: 'collaborator_id',
    subjectType: 'collaborator'
  },
  donor: {
    label: 'Portal de Donaciones',
    subjectTable: 'donors',
    otpTable: 'donor_portal_otps',
    subjectKey: 'donor_id',
    subjectType: 'donor'
  }
});

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  try {
    const body = await parseBody(request);
    const operation = cleanText(body.operation || body.action || 'request-access');
    const portal = cleanText(body.portal);
    const config = PORTALS[portal];
    if (!config) return sendJson(response, 400, { ok: false, code: 'INVALID_PORTAL', error: 'Portal no valido.' });

    const supabase = createServerClient();

    if (operation === 'request-access') {
      const subject = await findSubjectForAccess(supabase, portal, body.credentials || body);
      return sendJson(response, 200, { ok: true, ...(await createAndSendOtp({ supabase, portal, config, subject, action: 'access' })) });
    }

    if (operation === 'verify-access') {
      const subject = await findSubjectForAccess(supabase, portal, body.credentials || body);
      await verifyStoredOtp({
        supabase,
        config,
        subjectId: subject.id,
        challengeId: body.challengeId,
        code: body.code || body.otpCode,
        action: 'access'
      });
      const session = await createPortalSession(supabase, portal, config, subject);
      await audit(supabase, `${config.label}: inicio de sesion para ${subject.email || subject.code || subject.id}`);
      return sendJson(response, 200, { ok: true, session: toClientSession(session), auth: buildAuthDescriptor(portal, subject) });
    }

    if (operation === 'request-sensitive') {
      const { sessionRow, subject } = await requireSessionSubject(supabase, portal, config, body.session);
      const action = cleanText(body.portalAction || body.sensitiveAction || 'sensitive_action');
      return sendJson(response, 200, { ok: true, ...(await createAndSendOtp({ supabase, portal, config, subject, action, sessionRow })) });
    }

    if (operation === 'verify-sensitive') {
      const { subject } = await requireSessionSubject(supabase, portal, config, body.session);
      await verifyStoredOtp({
        supabase,
        config,
        subjectId: subject.id,
        challengeId: body.challengeId,
        code: body.code,
        action: cleanText(body.portalAction || body.sensitiveAction || 'sensitive_action')
      });
      return sendJson(response, 200, { ok: true, verified: true });
    }

    if (operation === 'overview') {
      const { subject } = await requireSessionSubject(supabase, portal, config, body.session);
      return sendJson(response, 200, { ok: true, overview: await buildOverview(supabase, portal, subject) });
    }

    if (operation === 'logout') {
      await logoutPortalSession(supabase, portal, config, body.session);
      return sendJson(response, 200, { ok: true });
    }

    if (operation === 'portal-action') {
      const { subject } = await requireSessionSubject(supabase, portal, config, body.session);
      return sendJson(response, 200, { ok: true, result: await executePortalAction(supabase, portal, subject, body) });
    }

    return sendJson(response, 400, { ok: false, code: 'INVALID_OPERATION', error: 'Operacion no valida.' });
  } catch (error) {
    const status = error.status || 500;
    return sendJson(response, status, {
      ok: false,
      code: error.code || 'PORTAL_AUTH_FAILED',
      error: error.message || 'No se pudo completar la operacion del portal.'
    });
  }
}

function createServerClient() {
  const url = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    throw httpError(503, 'SUPABASE_ADMIN_NOT_CONFIGURED', 'Supabase no esta configurado para el portal.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function findSubjectForAccess(supabase, portal, credentials = {}) {
  if (portal === 'beneficiary') {
    const code = cleanText(credentials.code).toUpperCase();
    const birthDate = cleanText(credentials.birthDate || credentials.birth_date).slice(0, 10);
    if (!code || !birthDate) throw httpError(400, 'INVALID_CREDENTIALS', 'Introduce tus datos de acceso.');
    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data || cleanText(data.birth_date).slice(0, 10) !== birthDate) {
      throw httpError(403, 'ACCESS_DENIED', 'No hemos podido validar los datos de acceso.');
    }
    if (data.is_active === false) throw httpError(403, 'SUBJECT_INACTIVE', 'El expediente no esta activo.');
    return data;
  }

  const email = cleanEmail(credentials.email || credentials);
  if (!email) throw httpError(400, 'INVALID_EMAIL', 'Correo no valido.');
  const table = portal === 'collaborator' ? 'collaborators' : 'donors';
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .ilike('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(403, 'ACCESS_DENIED', `No hemos encontrado ${portal === 'collaborator' ? 'un colaborador' : 'un donante'} con ese correo.`);
  if (data.is_active === false) throw httpError(403, 'SUBJECT_INACTIVE', 'El acceso no esta activo.');
  return data;
}

async function createAndSendOtp({ supabase, portal, config, subject, action }) {
  const resendKey = cleanText(process.env.RESEND_API_KEY);
  const from = cleanText(process.env.FROM_EMAIL || process.env.RESEND_FROM_EMAIL);
  if (!resendKey || !from) throw httpError(503, 'MAIL_NOT_CONFIGURED', 'Servicio de correo no configurado.');

  await revokePendingOtps(supabase, config, subject.id, action);

  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const email = cleanEmail(subject.email || subject.contact_email);
  if (!email) throw httpError(400, 'INVALID_EMAIL', 'No existe correo electronico para enviar el OTP.');

  const otpPayload = {
    id,
    [config.subjectKey]: subject.id,
    email,
    code: hashOtpCode(code, id),
    action,
    status: 'pending',
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (portal === 'beneficiary') {
    otpPayload.phone = cleanText(subject.phone);
    otpPayload.channel = 'email';
  }

  const { data: otp, error } = await supabase.from(config.otpTable).insert(otpPayload).select().single();
  if (error) throw error;

  const resend = new Resend(resendKey);
  const result = await resend.emails.send({
    from,
    to: email,
    subject: `Codigo de verificacion - ${config.label}`,
    text: [
      `Tu codigo de verificacion para ${config.label} es: ${code}`,
      '',
      `Caduca el ${new Date(expiresAt).toLocaleString('es-ES')}.`,
      'Si no has solicitado este acceso, ignora este mensaje y contacta con Pan y Esperanza.'
    ].join('\n')
  });

  if (result.error) {
    await supabase.from(config.otpTable).update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', id);
    throw httpError(502, 'RESEND_ERROR', result.error.message || 'Resend no acepto el correo.');
  }

  await audit(supabase, `${config.label}: OTP generado y enviado por servidor para ${email}`);
  return {
    id: otp.id,
    action: otp.action,
    expiresAt: otp.expires_at,
    channel: 'email',
    provider: 'server-api',
    deliveryStatus: 'sent',
    email
  };
}

async function verifyStoredOtp({ supabase, config, subjectId, challengeId, code, action }) {
  const cleanCode = cleanText(code);
  if (!/^\d{6}$/.test(cleanCode)) throw httpError(400, 'INVALID_OTP', 'Introduce un codigo OTP valido.');
  const query = supabase
    .from(config.otpTable)
    .select('*')
    .eq(config.subjectKey, subjectId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1);
  if (challengeId) query.eq('id', cleanText(challengeId));
  const { data, error } = await query;
  if (error) throw error;
  const otp = data?.[0];
  if (!otp) throw httpError(400, 'OTP_NOT_FOUND', 'Solicita un codigo OTP antes de continuar.');
  if (otp.status === 'used') throw httpError(400, 'OTP_USED', 'Este codigo OTP ya se ha utilizado.');
  if (otp.status !== 'pending') throw httpError(400, 'OTP_NOT_AVAILABLE', 'Este codigo OTP ya no esta disponible.');
  if (!otp.expires_at || new Date(otp.expires_at).getTime() < Date.now()) {
    await supabase.from(config.otpTable).update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', otp.id);
    await audit(supabase, `${config.label}: OTP caducado para ${action}`);
    throw httpError(400, 'OTP_EXPIRED', 'El codigo OTP ha caducado.');
  }
  if (cleanText(otp.code) !== hashOtpCode(cleanCode, otp.id)) {
    await audit(supabase, `${config.label}: acceso denegado por OTP incorrecto`);
    throw httpError(403, 'OTP_INVALID', 'El codigo OTP no es correcto.');
  }
  await supabase.from(config.otpTable).update({
    status: 'used',
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', otp.id);
  await audit(supabase, `${config.label}: OTP validado por servidor para ${action}`);
}

async function createPortalSession(supabase, portal, config, subject) {
  const now = new Date();
  const payload = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    portal,
    subject_type: config.subjectType,
    subject_id: subject.id,
    email: cleanEmail(subject.email || subject.contact_email),
    channel: 'email',
    status: 'active',
    started_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    last_seen_at: now.toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  const { data, error } = await supabase.from('portal_sessions').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function requireSessionSubject(supabase, portal, config, clientSession = {}) {
  const token = cleanText(clientSession.token);
  const subjectId = cleanText(clientSession.subjectId || clientSession.subject_id);
  if (!token || !subjectId) throw httpError(401, 'INVALID_SESSION', 'La sesion no es valida.');
  const { data: sessionRow, error: sessionError } = await supabase
    .from('portal_sessions')
    .select('*')
    .eq('token', token)
    .eq('portal', portal)
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow || sessionRow.status !== 'active') {
    await audit(supabase, `${config.label}: acceso denegado por sesion no valida`);
    throw httpError(401, 'INVALID_SESSION', 'La sesion no es valida. Vuelve a acceder.');
  }
  if (!sessionRow.expires_at || new Date(sessionRow.expires_at).getTime() < Date.now()) {
    await supabase.from('portal_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', sessionRow.id);
    await audit(supabase, `${config.label}: sesion caducada`);
    throw httpError(401, 'SESSION_EXPIRED', 'La sesion ha caducado. Vuelve a acceder.');
  }
  await supabase.from('portal_sessions').update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sessionRow.id);

  const { data: subject, error } = await supabase.from(config.subjectTable).select('*').eq('id', subjectId).maybeSingle();
  if (error) throw error;
  if (!subject) throw httpError(404, 'SUBJECT_NOT_FOUND', 'No se ha encontrado el expediente del portal.');
  return { sessionRow, subject };
}

async function logoutPortalSession(supabase, portal, config, clientSession = {}) {
  const { sessionRow } = await requireSessionSubject(supabase, portal, config, clientSession);
  await supabase.from('portal_sessions').update({
    status: 'revoked',
    logged_out_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', sessionRow.id);
  await revokePendingOtps(supabase, config, sessionRow.subject_id);
  await audit(supabase, `${config.label}: cierre de sesion`);
}

async function buildOverview(supabase, portal, subject) {
  if (portal === 'beneficiary') return buildBeneficiaryOverview(supabase, subject);
  if (portal === 'collaborator') return buildCollaboratorOverview(supabase, subject);
  return buildDonorOverview(supabase, subject);
}

async function buildBeneficiaryOverview(supabase, beneficiary) {
  const [deliveries, documents, history, notices, resources, renewals, profileUpdates] = await Promise.all([
    listBy(supabase, 'deliveries', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_documents', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'social_history', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_notices', 'beneficiary_id', beneficiary.id),
    listPublishedResources(supabase),
    listBy(supabase, 'beneficiary_portal_renewals', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_profile_updates', 'beneficiary_id', beneficiary.id)
  ]);
  const activeDeliveries = deliveries.filter((item) => cleanText(item.status).toLowerCase() !== 'anulada');
  return {
    beneficiary,
    upcomingDeliveries: activeDeliveries.slice(0, 3),
    history: [
      ...activeDeliveries.map((item) => ({ ...item, source: 'delivery', timeline_at: item.delivered_at || item.created_at })),
      ...history.map((item) => ({ ...item, source: 'social', timeline_at: item.date || item.created_at }))
    ].sort((a, b) => String(b.timeline_at || '').localeCompare(String(a.timeline_at || ''))),
    documents,
    personalizedResources: resources,
    notices: notices.map((item) => ({ ...item, source: 'portal' })),
    renewals,
    profileUpdates,
    requests: profileUpdates.filter((item) => item.requested_changes?.request_type || item.notes),
    auth: { provider: 'server-api', requiresOtpForSensitiveActions: true },
    integrations: { portalApi: true }
  };
}

async function buildCollaboratorOverview(supabase, collaborator) {
  const [donations, campaigns, resources, profileUpdates, requests, certificates] = await Promise.all([
    listAll(supabase, 'donations'),
    listAll(supabase, 'campanas'),
    listAll(supabase, 'recursos'),
    listBy(supabase, 'collaborator_portal_profile_updates', 'collaborator_id', collaborator.id),
    listBy(supabase, 'collaborator_portal_requests', 'collaborator_id', collaborator.id),
    listBy(supabase, 'collaborator_certificates', 'collaborator_id', collaborator.id)
  ]);
  const email = cleanEmail(collaborator.email);
  const name = normalizeText(collaborator.name);
  const ownDonations = donations.filter((item) => item.collaborator_id === collaborator.id || cleanEmail(item.donor_email) === email || normalizeText(item.donor) === name);
  const ownResources = resources.filter((item) => item.collaborator_id === collaborator.id || cleanEmail(item.created_by_email || item.email) === email);
  return {
    collaborator,
    latestCollaboration: ownDonations[0] || null,
    upcomingCampaigns: campaigns.slice(0, 6),
    activeCampaigns: campaigns.filter((item) => ['Activa', 'Planificada'].includes(item.status)).slice(0, 8),
    impact: { ...(collaborator.impact || {}), donationCount: ownDonations.length },
    donations: ownDonations,
    resources: ownResources,
    profileUpdates,
    requests,
    certificates,
    auth: { provider: 'server-api', requiresOtpForSensitiveActions: true },
    integrations: { portalApi: true }
  };
}

async function buildDonorOverview(supabase, donor) {
  const [donations, campaigns, profileUpdates, certificates] = await Promise.all([
    listAll(supabase, 'donations'),
    listAll(supabase, 'campanas'),
    listBy(supabase, 'donor_portal_profile_updates', 'donor_id', donor.id),
    listBy(supabase, 'donor_certificates', 'donor_id', donor.id)
  ]);
  const email = cleanEmail(donor.email);
  const name = normalizeText(donor.name);
  const ownDonations = donations.filter((item) => item.donor_id === donor.id || cleanEmail(item.donor_email) === email || normalizeText(item.donor) === name);
  return {
    donor,
    latestDonation: ownDonations[0] || null,
    upcomingCampaigns: campaigns.slice(0, 6),
    activeCampaigns: campaigns.filter((item) => ['Activa', 'Planificada'].includes(item.status)).slice(0, 8),
    impact: { ...(donor.impact || {}), donationCount: ownDonations.length },
    donations: ownDonations,
    profileUpdates,
    certificates,
    auth: { provider: 'server-api', requiresOtpForSensitiveActions: true },
    integrations: { portalApi: true }
  };
}

async function executePortalAction(supabase, portal, subject, body) {
  const action = cleanText(body.portalAction);
  const payload = body.payload || {};
  if (portal === 'beneficiary') {
    if (action === 'mark-notice-read') {
      const { data, error } = await supabase.from('beneficiary_portal_notices').update({ status: 'read', read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', payload.noticeId).eq('beneficiary_id', subject.id).select().single();
      if (error) throw error;
      return data;
    }
    if (action === 'create-request' || action === 'request-profile-update') {
      const changes = action === 'create-request' ? { request_type: payload.request_type, message: payload.message, preferred_contact: payload.preferred_contact } : payload.changes || payload;
      const { data, error } = await supabase.from('beneficiary_portal_profile_updates').insert({
        beneficiary_id: subject.id,
        requested_changes: changes,
        status: 'pending',
        notes: cleanText(payload.notes || payload.message),
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return data;
    }
  }

  if (portal === 'collaborator') {
    if (action === 'create-donation-request') {
      const { data, error } = await supabase.from('donations').insert({
        collaborator_id: subject.id,
        donor: subject.name,
        donor_email: subject.email,
        donor_kind: subject.type || 'Colaborador',
        donation_type: cleanText(payload.donation_type || 'Productos'),
        status: 'Pendiente',
        state: 'Pendiente',
        donated_at: payload.proposed_date || new Date().toISOString().slice(0, 10),
        estimated_value: Number(payload.amount || payload.estimated_value || 0),
        quantity: cleanText(payload.quantity),
        pickup_requested: payload.pickup_requested === true,
        proposed_pickup_at: payload.proposed_pickup_at || null,
        notes: [payload.description, payload.observations].map(cleanText).filter(Boolean).join('\n'),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return data;
    }
    if (action === 'propose-resource') {
      const { data, error } = await supabase.from('recursos').insert({
        titulo: cleanText(payload.titulo || payload.title),
        descripcion: cleanText(payload.descripcion || payload.description),
        categoria_nombre: cleanText(payload.categoria_nombre || payload.category),
        provincia_nombre: cleanText(payload.provincia_nombre || payload.province),
        tipo: cleanText(payload.tipo || payload.type),
        url: cleanText(payload.url || '/#contacto'),
        publicado: false,
        status: 'draft',
        collaborator_id: subject.id,
        created_by_email: subject.email,
        review_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return data;
    }
    if (action === 'join-campaign' || action === 'request-profile-update') {
      const table = action === 'join-campaign' ? 'collaborator_portal_requests' : 'collaborator_portal_profile_updates';
      const insert = action === 'join-campaign'
        ? { collaborator_id: subject.id, request_type: 'join_campaign', campaign_id: payload.campaignId, title: 'Solicitud para unirse a campana', status: 'pending' }
        : { collaborator_id: subject.id, requested_changes: payload.changes || payload, status: 'pending', notes: cleanText(payload.notes) };
      const { data, error } = await supabase.from(table).insert({ ...insert, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
      if (error) throw error;
      return data;
    }
  }

  if (portal === 'donor') {
    if (action === 'create-donation-intent') {
      const { data, error } = await supabase.from('donations').insert({
        donor_id: subject.id,
        donor: subject.name,
        donor_email: subject.email,
        donor_kind: 'Particular',
        donation_type: 'Economica',
        status: 'Pendiente',
        state: 'Pendiente',
        payment_method: cleanText(payload.payment_method || 'Bizum'),
        donated_at: payload.donated_at || new Date().toISOString().slice(0, 10),
        estimated_value: Number(payload.amount || payload.estimated_value || 0),
        amount: Number(payload.amount || payload.estimated_value || 0),
        campaign_id: cleanText(payload.campaign_id) || null,
        frequency: cleanText(payload.frequency || 'Puntual'),
        notes: cleanText(payload.notes),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return data;
    }
    if (action === 'request-profile-update') {
      const { data, error } = await supabase.from('donor_portal_profile_updates').insert({
        donor_id: subject.id,
        requested_changes: payload.changes || payload,
        status: 'pending',
        notes: cleanText(payload.notes),
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (error) throw error;
      return data;
    }
  }

  throw httpError(400, 'INVALID_PORTAL_ACTION', 'Accion de portal no valida.');
}

async function revokePendingOtps(supabase, config, subjectId, action = '') {
  let query = supabase.from(config.otpTable).update({ status: 'revoked', updated_at: new Date().toISOString() }).eq(config.subjectKey, subjectId).eq('status', 'pending');
  if (action) query = query.eq('action', action);
  const { error } = await query;
  if (error) throw error;
}

async function listAll(supabase, table) {
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listBy(supabase, table, column, value) {
  const { data, error } = await supabase.from(table).select('*').eq(column, value).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listPublishedResources(supabase) {
  const { data, error } = await supabase.from('recursos').select('*').eq('publicado', true).eq('status', 'published').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function audit(supabase, action) {
  await supabase.from('audit_logs').insert({
    user_name: 'Portal',
    user_email: '',
    action,
    happened_at: new Date().toISOString()
  }).catch(() => null);
}

function buildAuthDescriptor(portal, subject) {
  return {
    provider: 'server-api',
    email: cleanEmail(subject.email || subject.contact_email),
    preferredChannel: 'email',
    requiresOtpForSensitiveActions: true,
    portal
  };
}

function toClientSession(session) {
  return {
    token: session.token,
    portal: session.portal,
    subjectType: session.subject_type,
    subjectId: session.subject_id,
    email: session.email,
    expiresAt: session.expires_at,
    startedAt: session.started_at
  };
}

function hashOtpCode(code, salt) {
  return crypto.createHash('sha256').update(`${cleanText(code)}:${cleanText(salt)}`).digest('hex');
}

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}
