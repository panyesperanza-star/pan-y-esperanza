import crypto from 'node:crypto';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { Resend } from 'npm:resend@4.0.1';

const OTP_TTL_MINUTES = 10;
const SESSION_TTL_HOURS = 8;
const BENEFICIARY_ACCESS_LOCK_MAX_ATTEMPTS = 5;
const BENEFICIARY_ACCESS_LOCK_MINUTES = 15;
const PIN_RULE = /^\d{6,12}$/;

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

  let requestPortal = '';
  try {
    const body = await parseBody(request);
    const operation = cleanText(body.operation || body.action || 'request-access');
    const portal = cleanText(body.portal);
    requestPortal = portal;
    const config = PORTALS[portal];
    if (!config) return sendJson(response, 400, { ok: false, code: 'INVALID_PORTAL', error: 'Portal no valido.' });

    const supabase = createServerClient();

    if (operation === 'request-access') {
      const subject = await findSubjectForAccess(supabase, portal, body.credentials || body);
      const otpResponse = await createAndSendOtp({ supabase, portal, config, subject, action: 'access' });
      logPortalDebug(portal, 'respuesta final', { ok: true, status: 200, deliveryStatus: otpResponse.deliveryStatus });
      return sendJson(response, 200, { ok: true, ...otpResponse });
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
    logPortalDebug(requestPortal, 'respuesta final', { ok: false, status, code: error.code || 'PORTAL_AUTH_FAILED' });
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
    return findBeneficiaryForSecureAccess(supabase, credentials);
  }

  const email = cleanEmail(credentials.email || credentials);
  if (!email) throw httpError(400, 'INVALID_EMAIL', 'Correo no valido.');
  if (portal === 'collaborator') return findCollaboratorForAccess(supabase, email);

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

async function findCollaboratorForAccess(supabase, email) {
  logPortalDebug('collaborator', 'buscando colaborador', {
    table: 'collaborators',
    field: 'email',
    email: maskEmail(email)
  });
  const { data: byEmail, error: emailError } = await supabase
    .from('collaborators')
    .select('*')
    .ilike('email', email)
    .maybeSingle();
  if (emailError) throw emailError;

  let collaborator = byEmail;
  let matchedBy = byEmail ? 'email' : '';
  if (!collaborator) {
    logPortalDebug('collaborator', 'buscando colaborador', {
      table: 'collaborators',
      field: 'access_email',
      email: maskEmail(email)
    });
    const { data: byAccessEmail, error: accessEmailError } = await supabase
      .from('collaborators')
      .select('*')
      .ilike('access_email', email)
      .maybeSingle();
    if (accessEmailError) throw accessEmailError;
    collaborator = byAccessEmail;
    matchedBy = byAccessEmail ? 'access_email' : '';
  }

  logPortalDebug('collaborator', 'colaborador encontrado', {
    found: Boolean(collaborator),
    matchedBy,
    id: collaborator?.id || null,
    email: maskEmail(collaborator?.email || ''),
    accessEmail: maskEmail(collaborator?.access_email || '')
  });

  if (!collaborator) {
    throw httpError(403, 'ACCESS_DENIED', 'No hemos encontrado un colaborador con ese correo.');
  }

  const portalStatusRaw = cleanText(collaborator.portal_status || 'Activo');
  const statusRaw = cleanText(collaborator.status || 'Activo');
  const portalStatus = normalizeText(portalStatusRaw);
  const status = normalizeText(statusRaw);
  const hasPortalEnabledField = Object.prototype.hasOwnProperty.call(collaborator, 'portal_enabled');
  const hasPortalAccessField = Object.prototype.hasOwnProperty.call(collaborator, 'portal_access');
  const activeField = collaborator.is_active !== false;
  const statusAllowsAccess = status !== 'inactivo';
  const portalStatusAllowsAccess = portalStatus !== 'inactivo';
  const inactiveReasons = [];
  if (!activeField) inactiveReasons.push('is_active=false');
  if (!statusAllowsAccess) inactiveReasons.push(`status=${statusRaw || '(vacio)'}`);
  if (!portalStatusAllowsAccess) inactiveReasons.push(`portal_status=${portalStatusRaw || '(vacio)'}`);
  const active = activeField && statusAllowsAccess && portalStatusAllowsAccess;

  logPortalDebug('collaborator', 'validacion acceso colaborador', {
    id: collaborator.id,
    email: maskEmail(collaborator.email || ''),
    accessEmail: maskEmail(collaborator.access_email || ''),
    status: statusRaw,
    active: activeField,
    portalStatus: portalStatusRaw,
    portalEnabled: hasPortalEnabledField ? collaborator.portal_enabled : 'campo_no_existente',
    portalAccess: hasPortalAccessField ? collaborator.portal_access : 'campo_no_existente',
    allowed: active,
    motivo: inactiveReasons.length ? inactiveReasons.join(', ') : 'acceso_activo'
  });

  if (!active) throw httpError(403, 'SUBJECT_INACTIVE', 'El acceso no esta activo.');

  return {
    ...collaborator,
    email: cleanEmail(collaborator.access_email || collaborator.email || email),
    contact_email: cleanEmail(collaborator.email || email)
  };
}

async function findBeneficiaryForSecureAccess(supabase, credentials = {}) {
  const accessIdentifier = normalizeAccessIdentifier(credentials.accessIdentifier || credentials.access_identifier || credentials.identifier || credentials.portalIdentifier);
  const pin = cleanText(credentials.pin || credentials.accessPin || credentials.access_pin);
  if (!accessIdentifier || !pin) throw httpError(400, 'INVALID_CREDENTIALS', 'Introduce tu identificador y PIN de acceso.');

  const { data: account, error: accountError } = await supabase
    .from('beneficiary_portal_accounts')
    .select('*')
    .eq('access_identifier', accessIdentifier)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) {
    await audit(supabase, `Portal del Beneficiario: acceso fallido con identificador desconocido ${maskIdentifier(accessIdentifier)}`);
    throw httpError(403, 'ACCESS_DENIED', 'No hemos podido validar los datos de acceso.');
  }
  if (isAccessLocked(account)) {
    await audit(supabase, `Portal del Beneficiario: acceso bloqueado por intentos fallidos ${maskIdentifier(accessIdentifier)}`);
    throw httpError(429, 'ACCESS_LOCKED', 'Acceso bloqueado temporalmente por seguridad. Intentalo mas tarde.');
  }
  if (cleanText(account.status).toLowerCase() !== 'active') {
    await audit(supabase, `Portal del Beneficiario: acceso denegado por cuenta no activa ${maskIdentifier(accessIdentifier)}`);
    throw httpError(403, 'ACCESS_NOT_ACTIVE', 'El acceso al portal no esta activo. Contacta con Pan y Esperanza.');
  }
  if (!account.pin_hash || !account.pin_salt) {
    await audit(supabase, `Portal del Beneficiario: acceso denegado por PIN no configurado ${maskIdentifier(accessIdentifier)}`);
    throw httpError(403, 'ACCESS_NOT_CONFIGURED', 'El acceso seguro no esta activado. Contacta con Pan y Esperanza.');
  }
  if (cleanText(account.pin_hash) !== hashAccessPin(pin, account.pin_salt)) {
    await registerFailedBeneficiaryAccess(supabase, account, accessIdentifier);
    throw httpError(403, 'ACCESS_DENIED', 'No hemos podido validar los datos de acceso.');
  }

  const { data: beneficiary, error: beneficiaryError } = await supabase
    .from('beneficiaries')
    .select('*')
    .eq('id', account.beneficiary_id)
    .maybeSingle();
  if (beneficiaryError) throw beneficiaryError;
  if (!beneficiary) {
    await audit(supabase, `Portal del Beneficiario: acceso denegado por expediente no encontrado ${maskIdentifier(accessIdentifier)}`);
    throw httpError(403, 'ACCESS_DENIED', 'No hemos podido validar los datos de acceso.');
  }
  if (beneficiary.is_active === false) {
    await audit(supabase, `Portal del Beneficiario: acceso denegado por expediente inactivo ${beneficiary.code || beneficiary.id}`);
    throw httpError(403, 'SUBJECT_INACTIVE', 'El expediente no esta activo.');
  }

  await resetBeneficiaryAccessAttempts(supabase, account);
  await audit(supabase, `Portal del Beneficiario: primer factor seguro validado para ${beneficiary.code || beneficiary.id}`);
  return beneficiary;
}

async function registerFailedBeneficiaryAccess(supabase, account, accessIdentifier) {
  const attempts = Number(account.failed_access_attempts || 0) + 1;
  const lockedUntil = attempts >= BENEFICIARY_ACCESS_LOCK_MAX_ATTEMPTS
    ? new Date(Date.now() + BENEFICIARY_ACCESS_LOCK_MINUTES * 60 * 1000).toISOString()
    : null;
  await supabase.from('beneficiary_portal_accounts').update({
    failed_access_attempts: attempts,
    last_failed_access_at: new Date().toISOString(),
    locked_until: lockedUntil,
    updated_at: new Date().toISOString()
  }).eq('id', account.id);
  await audit(supabase, `Portal del Beneficiario: intento fallido ${attempts}/${BENEFICIARY_ACCESS_LOCK_MAX_ATTEMPTS} ${maskIdentifier(accessIdentifier)}`);
}

async function resetBeneficiaryAccessAttempts(supabase, account) {
  await supabase.from('beneficiary_portal_accounts').update({
    failed_access_attempts: 0,
    locked_until: null,
    last_successful_access_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', account.id);
}

function isAccessLocked(account) {
  return account?.locked_until && new Date(account.locked_until).getTime() > Date.now();
}

function normalizeAccessIdentifier(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, '');
}

function maskIdentifier(value) {
  const text = normalizeAccessIdentifier(value);
  if (text.length <= 4) return '****';
  return `${text.slice(0, 4)}****${text.slice(-2)}`;
}

function hashAccessPin(pin, salt) {
  return crypto.createHash('sha256').update(`${cleanText(pin)}:${cleanText(salt)}`).digest('hex');
}

async function createAndSendOtp({ supabase, portal, config, subject, action }) {
  const resendKey = cleanText(process.env.RESEND_API_KEY);
  const from = cleanText(process.env.FROM_EMAIL);
  if (!resendKey || !from) throw httpError(503, 'MAIL_NOT_CONFIGURED', 'Servicio de correo no configurado.');

  await revokePendingOtps(supabase, config, subject.id, action);

  const id = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const email = cleanEmail(subject.email || subject.contact_email);
  if (!email) throw httpError(400, 'INVALID_EMAIL', 'No existe correo electronico para enviar el OTP.');
  logPortalDebug(portal, 'email utilizado', { email: maskEmail(email), action });

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
  logPortalDebug(portal, 'OTP generado', { otpId: otp.id, expiresAt });

  const resend = new Resend(resendKey);
  const emailContext = { label: config.label, code, expiresAt };
  const result = await resend.emails.send({
    from,
    to: email,
    subject: `Codigo de verificacion - ${config.label}`,
    text: buildOtpEmailText(emailContext),
    html: buildOtpEmailHtml(emailContext)
  });
  logPortalDebug(portal, 'resultado resend', {
    ok: !result.error,
    messageId: result.data?.id || result.id || null,
    error: result.error?.message || null
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

function buildOtpEmailText({ label, code, expiresAt }) {
  return [
    `Tu codigo de verificacion para ${label} es: ${code}`,
    '',
    `Caduca el ${new Date(expiresAt).toLocaleString('es-ES')}.`,
    'Si no has solicitado este acceso, ignora este mensaje y contacta con Pan y Esperanza.'
  ].join('\n');
}

function buildOtpEmailHtml({ label, code, expiresAt }) {
  const safeLabel = escapeHtml(label);
  const safeCode = escapeHtml(code);
  const safeExpiresAt = escapeHtml(new Date(expiresAt).toLocaleString('es-ES'));

  return `
    <!doctype html>
    <html lang="es">
      <body style="margin:0;background:#f5f7f2;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f2;padding:28px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6eadf">
                <tr>
                  <td style="padding:28px 28px 12px">
                    <p style="margin:0 0 8px;color:#247e50;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Pan y Esperanza</p>
                    <h1 style="margin:0;color:#1f2933;font-size:24px;line-height:1.25">Codigo de verificacion</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 28px">
                    <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#374151">Tu codigo de verificacion para ${safeLabel} es:</p>
                    <div style="margin:0 0 20px;padding:18px 16px;background:#f1f7ef;border:1px solid #d8ead5;border-radius:14px;text-align:center">
                      <span style="display:block;font-size:34px;line-height:1.2;font-weight:800;letter-spacing:8px;color:#247e50">${safeCode}</span>
                    </div>
                    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#4b5563">Caduca el ${safeExpiresAt}.</p>
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">Si no has solicitado este acceso, ignora este mensaje y contacta con Pan y Esperanza.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
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
  const [deliveries, documents, history, notices, resources, renewals, profileUpdates, accountResult] = await Promise.all([
    listBy(supabase, 'deliveries', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_documents', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'social_history', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_notices', 'beneficiary_id', beneficiary.id),
    listPublishedResources(supabase),
    listBy(supabase, 'beneficiary_portal_renewals', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_profile_updates', 'beneficiary_id', beneficiary.id),
    supabase.from('beneficiary_portal_accounts').select('must_change_pin,pin_changed_at').eq('beneficiary_id', beneficiary.id).maybeSingle()
  ]);
  if (accountResult.error) throw accountResult.error;
  const account = accountResult.data || {};
  const activeDeliveries = deliveries.filter((item) => cleanText(item.status).toLowerCase() !== 'anulada');
  const upcomingDeliveries = activeDeliveries
    .filter(isFutureDelivery)
    .sort(sortDeliveryAsc)
    .map(sanitizePortalDelivery);
  const portalDocuments = documents
    .map(sanitizePortalDocument)
    .sort((a, b) => String(b.uploaded_at || b.created_at || '').localeCompare(String(a.uploaded_at || a.created_at || '')));
  const portalNotices = notices
    .filter((item) => cleanText(item.status).toLowerCase() !== 'archived')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((item) => ({ ...item, source: 'portal' }));
  return {
    beneficiary,
    upcomingDeliveries,
    history: [
      ...activeDeliveries.map((item) => ({ ...item, source: 'delivery', timeline_at: item.delivered_at || item.created_at })),
      ...history.map((item) => ({ ...item, source: 'social', timeline_at: item.date || item.created_at }))
    ].sort((a, b) => String(b.timeline_at || '').localeCompare(String(a.timeline_at || ''))),
    documents: portalDocuments,
    personalizedResources: resources,
    notices: portalNotices,
    renewals,
    profileUpdates,
    requests: profileUpdates.filter((item) => item.requested_changes?.request_type || item.notes),
    auth: {
      provider: 'server-api',
      requiresOtpForSensitiveActions: true,
      mustChangePin: account.must_change_pin === true,
      pinChangedAt: account.pin_changed_at || null
    },
    integrations: { portalApi: true }
  };
}

function isFutureDelivery(delivery = {}) {
  const deliveryDate = String(delivery.delivered_at || delivery.created_at || '').slice(0, 10);
  if (!deliveryDate) return false;
  return deliveryDate >= new Date().toISOString().slice(0, 10);
}

function sortDeliveryAsc(a = {}, b = {}) {
  const dateCompare = String(a.delivered_at || a.created_at || '').localeCompare(String(b.delivered_at || b.created_at || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.delivered_time || '').localeCompare(String(b.delivered_time || ''));
}

function sanitizePortalDelivery(delivery = {}) {
  return {
    id: delivery.id,
    delivered_at: delivery.delivered_at || null,
    delivered_time: delivery.delivered_time || null,
    location: cleanText(delivery.location || delivery.delivery_location || delivery.place || delivery.address),
    help_type: delivery.help_type || '',
    status: delivery.status || 'Pendiente',
    attendance_status: delivery.attendance_status || 'pending',
    attendance_confirmed_at: delivery.attendance_confirmed_at || null,
    attendance_source: delivery.attendance_source || null,
    attendance_reason: delivery.attendance_reason || '',
    attendance_notes: delivery.attendance_notes || '',
    created_at: delivery.created_at || null
  };
}

function sanitizePortalDocument(document = {}) {
  const status = inferPortalDocumentStatus(document);
  return {
    id: document.id,
    beneficiary_id: document.beneficiary_id,
    document_type: document.document_type || 'Documento',
    status,
    portal_status: status,
    uploaded_at: document.uploaded_at || null,
    expires_at: document.expires_at || null,
    created_at: document.created_at || null,
    updated_at: document.updated_at || null
  };
}

function inferPortalDocumentStatus(document = {}) {
  const explicit = cleanText(document.status).toLowerCase();
  const notes = cleanText(document.notes).toLowerCase();
  if (explicit.includes('pendiente') || explicit === 'pending' || notes.includes('pendiente')) return 'pending';
  if (explicit.includes('caduc') || explicit === 'expired') return 'expired';
  if (document.file_data_url || document.file_url || document.storage_path || document.storage_bucket) return 'received';
  if (explicit.includes('recib') || explicit === 'received' || explicit === 'uploaded') return 'received';
  return 'pending';
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
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const rootPayload = body && typeof body === 'object' ? body : {};
  if (portal === 'beneficiary') {
    if (action === 'change-pin') {
      return changeBeneficiaryPin(supabase, subject, payload, rootPayload);
    }
    if (action === 'mark-notice-read') {
      const { data, error } = await supabase.from('beneficiary_portal_notices').update({ status: 'read', read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', payload.noticeId).eq('beneficiary_id', subject.id).select().single();
      if (error) throw error;
      return data;
    }
    if (action === 'confirm-delivery-attendance') {
      return updateDeliveryAttendanceFromPortal(supabase, subject, payload);
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

async function updateDeliveryAttendanceFromPortal(supabase, beneficiary, payload = {}) {
  const deliveryId = cleanText(payload.deliveryId || payload.delivery_id);
  const requestedStatus = cleanText(payload.attendance_status || payload.status);
  const status = normalizeAttendanceStatus(requestedStatus);
  const reason = cleanText(payload.reason || payload.attendance_reason);
  const notes = cleanText(payload.notes || payload.message);

  if (!deliveryId) throw httpError(400, 'INVALID_DELIVERY', 'Entrega no valida.');
  if (!status) throw httpError(400, 'INVALID_ATTENDANCE_STATUS', 'Estado de asistencia no valido.');
  if (status === 'unavailable' && !isValidAttendanceReason(reason)) {
    throw httpError(422, 'INVALID_ATTENDANCE_REASON', 'Selecciona un motivo valido.');
  }

  const { data: delivery, error: deliveryError } = await supabase
    .from('deliveries')
    .select('*')
    .eq('id', deliveryId)
    .eq('beneficiary_id', beneficiary.id)
    .maybeSingle();
  if (deliveryError) throw deliveryError;
  if (!delivery || delivery.status === 'Anulada') throw httpError(404, 'DELIVERY_NOT_FOUND', 'No se ha encontrado la entrega programada.');
  if (!isFutureDelivery(delivery)) throw httpError(422, 'DELIVERY_NOT_UPCOMING', 'Solo se puede confirmar la asistencia de entregas futuras.');

  const now = new Date().toISOString();
  const updatePayload = {
    attendance_status: status,
    attendance_confirmed_at: now,
    attendance_source: 'portal',
    attendance_reason: status === 'unavailable' ? reason : null,
    attendance_notes: notes || attendanceStatusLabel(status)
  };

  const { data: updatedDelivery, error: updateError } = await supabase
    .from('deliveries')
    .update(updatePayload)
    .eq('id', delivery.id)
    .eq('beneficiary_id', beneficiary.id)
    .select()
    .single();
  if (updateError) throw updateError;

  let request = null;
  if (status === 'needs_contact') {
    const requestMessage = notes || `Necesito ayuda para asistir a la entrega del ${delivery.delivered_at || delivery.created_at || ''}.`;
    const { data, error } = await supabase.from('beneficiary_portal_profile_updates').insert({
      beneficiary_id: beneficiary.id,
      requested_changes: {
        request_type: 'delivery_attendance_help',
        delivery_id: delivery.id,
        message: requestMessage,
        preferred_contact: 'portal'
      },
      status: 'pending',
      notes: requestMessage,
      requested_at: now,
      created_at: now,
      updated_at: now
    }).select().single();
    if (error) throw error;
    request = data;
  }

  await notifyDeliveryAttendance(supabase, beneficiary, updatedDelivery, status, reason, request);
  await audit(supabase, `Portal del Beneficiario: asistencia ${attendanceStatusLabel(status)} para entrega ${delivery.receipt_number || delivery.id}`);

  return {
    delivery: sanitizePortalDelivery(updatedDelivery),
    request,
    attendance: {
      status,
      confirmed_at: now,
      source: 'portal',
      reason: updatePayload.attendance_reason
    }
  };
}

async function notifyDeliveryAttendance(supabase, beneficiary, delivery, status, reason, request) {
  const now = new Date().toISOString();
  const label = attendanceStatusLabel(status);
  const priority = status === 'confirmed' ? 'info' : status === 'unavailable' ? 'warning' : 'urgent';
  const messageParts = [
    `${beneficiary.full_name || beneficiary.code || 'Beneficiario'} ha actualizado su asistencia: ${label}.`,
    delivery.delivered_at ? `Entrega: ${delivery.delivered_at}.` : '',
    reason ? `Motivo: ${reason}.` : '',
    request?.id ? 'Se ha creado una solicitud asociada.' : ''
  ].filter(Boolean);
  const { error } = await supabase.from('notificaciones').insert({
    tipo: status === 'needs_contact' ? 'urgent' : priority,
    prioridad: priority,
    modulo: 'deliveries',
    origen: 'Portal del Beneficiario',
    titulo: `Asistencia ${label}`,
    mensaje: messageParts.join(' '),
    estado: 'Pendiente',
    leida: false,
    entity_type: 'delivery',
    entity_id: delivery.id,
    action_url: '/deliveries',
    dedupe_key: `delivery-attendance-${delivery.id}-${status}-${now}`,
    metadata: {
      beneficiary_id: beneficiary.id,
      delivery_id: delivery.id,
      attendance_status: status,
      attendance_source: 'portal',
      request_id: request?.id || null
    },
    created_at: now,
    updated_at: now
  });
  if (error) console.warn('[send-portal-otp] No se pudo registrar notificacion de asistencia', { message: error.message });
}

function normalizeAttendanceStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (status === 'confirmed') return 'confirmed';
  if (status === 'unavailable') return 'unavailable';
  if (status === 'needs_contact' || status === 'needs_help') return 'needs_contact';
  return '';
}

function isValidAttendanceReason(value) {
  return ['Trabajo', 'Enfermedad', 'Transporte', 'Otro'].includes(cleanText(value));
}

function attendanceStatusLabel(value) {
  if (value === 'confirmed') return 'Confirmada';
  if (value === 'unavailable') return 'No asistira';
  if (value === 'needs_contact') return 'Necesita contactar';
  return 'Pendiente';
}

async function changeBeneficiaryPin(supabase, beneficiary, payload = {}, rootPayload = {}) {
  const currentPinField = pickPinField(payload, rootPayload, ['currentPin', 'current_pin', 'pinActual', 'current_access_pin']);
  const newPinField = pickPinField(payload, rootPayload, ['newPin', 'new_pin', 'pin', 'newAccessPin', 'new_access_pin']);
  const confirmPinField = pickPinField(payload, rootPayload, ['confirmPin', 'confirm_pin', 'pinConfirmacion', 'repeatPin', 'repeat_pin']);
  const currentPin = cleanText(currentPinField.value);
  const newPin = cleanText(newPinField.value);
  const confirmPin = cleanText(confirmPinField.value || newPin);
  const currentPinValid = PIN_RULE.test(currentPin);
  const newPinValid = PIN_RULE.test(newPin);
  const confirmPinValid = PIN_RULE.test(confirmPin);
  const sameConfirmation = newPin === confirmPin;
  const sameAsCurrent = newPin === currentPin;
  const rejectionReason = !currentPin
    ? 'CURRENT_PIN_EMPTY'
    : !currentPinValid
      ? 'CURRENT_PIN_RULE_FAILED'
      : !newPinValid
        ? 'NEW_PIN_RULE_FAILED'
        : !confirmPinValid
          ? 'CONFIRM_PIN_RULE_FAILED'
          : !sameConfirmation
            ? 'PIN_CONFIRMATION_MISMATCH'
            : sameAsCurrent
              ? 'NEW_PIN_EQUALS_CURRENT'
              : null;
  console.info('[beneficiary-access] Edge cambio PIN validacion', {
    beneficiaryId: beneficiary?.id || null,
    payloadKeys: Object.keys(payload || {}),
    rootKeys: Object.keys(rootPayload || {}),
    currentPinField: currentPinField.name,
    newPinField: newPinField.name,
    confirmPinField: confirmPinField.name,
    newPinReceived: Boolean(newPinField.name),
    confirmPinReceived: Boolean(confirmPinField.name),
    newPinType: typeof newPinField.value,
    confirmPinType: typeof confirmPinField.value,
    currentPinLength: currentPin.length,
    newPinLength: newPin.length,
    confirmPinLength: confirmPin.length,
    currentPinMasked: maskPinForLog(currentPin),
    newPinMasked: maskPinForLog(newPin),
    confirmPinMasked: maskPinForLog(confirmPin),
    currentPinRegex: currentPinValid,
    newPinRegex: newPinValid,
    confirmPinRegex: confirmPinValid,
    sameConfirmation,
    sameAsCurrent,
    rejectionReason,
    rule: 'PIN numerico de 6 a 12 digitos'
  });
  if (rejectionReason) {
    console.warn('[beneficiary-access] Edge cambio PIN rechazado', {
      beneficiaryId: beneficiary?.id || null,
      rejectionReason,
      newPinReceived: Boolean(newPinField.name),
      newPinField: newPinField.name,
      newPinType: typeof newPinField.value,
      newPinLength: newPin.length,
      newPinRegex: newPinValid,
      newPinMasked: maskPinForLog(newPin)
    });
    if (rejectionReason === 'CURRENT_PIN_EMPTY') throw httpError(400, 'INVALID_PIN', 'Introduce tu PIN temporal actual.');
    if (rejectionReason === 'PIN_CONFIRMATION_MISMATCH') throw httpError(400, 'INVALID_PIN', 'Los PIN no coinciden.');
    if (rejectionReason === 'NEW_PIN_EQUALS_CURRENT') throw httpError(400, 'INVALID_PIN', 'El nuevo PIN debe ser diferente al temporal.');
    throw httpError(400, 'INVALID_PIN', 'El nuevo PIN debe tener entre 6 y 12 numeros.');
  }

  const { data: account, error: accountError } = await supabase
    .from('beneficiary_portal_accounts')
    .select('*')
    .eq('beneficiary_id', beneficiary.id)
    .eq('status', 'active')
    .maybeSingle();
  if (accountError) throw accountError;
  const temporaryPinHash = account?.pin_hash ? cleanText(account.pin_hash) : '';
  const temporaryPinSalt = account?.pin_salt ? cleanText(account.pin_salt) : '';
  const temporaryPinHashExists = Boolean(temporaryPinHash && temporaryPinSalt);
  const temporaryPinMatches = temporaryPinHashExists && temporaryPinHash === hashAccessPin(currentPin, temporaryPinSalt);
  const pinExpired = false;
  const accountStateDetail = account?.must_change_pin === false ? 'must_change_pin=false' : 'must_change_pin=true';
  const rejectionDetail = !account
    ? 'cuenta incorrecta'
    : !temporaryPinHashExists
      ? 'hash inexistente'
      : pinExpired
        ? 'PIN expirado'
        : !temporaryPinMatches
          ? 'hash no coincide'
          : 'PIN temporal valido';
  console.info('[beneficiary-access] Edge validacion PIN temporal', {
    beneficiaryLocated: Boolean(beneficiary?.id),
    beneficiaryId: beneficiary?.id || null,
    accountLocated: Boolean(account?.id),
    accountId: account?.id || null,
    accountBeneficiaryId: account?.beneficiary_id || null,
    accountMatchesBeneficiary: Boolean(account?.beneficiary_id && account.beneficiary_id === beneficiary?.id),
    accessIdentifier: maskIdentifier(account?.access_identifier || ''),
    accountStatus: account?.status || null,
    must_change_pin: account?.must_change_pin ?? null,
    hasTemporaryHash: temporaryPinHashExists,
    hasPinHash: Boolean(temporaryPinHash),
    hasPinSalt: Boolean(temporaryPinSalt),
    temporaryPinSentAt: account?.temporary_pin_sent_at || null,
    pinSetAt: account?.pin_set_at || null,
    pinExpired,
    pinExpirationPolicy: 'not_configured',
    algorithm: 'sha256(pin:salt)',
    temporaryPinComparison: temporaryPinMatches,
    accountStateDetail,
    rejectionDetail
  });
  if (!account?.pin_hash || !account?.pin_salt) {
    console.warn('[beneficiary-access] Edge PIN temporal rechazado', {
      beneficiaryId: beneficiary?.id || null,
      accountId: account?.id || null,
      rejectionDetail: !account ? 'cuenta incorrecta' : 'hash inexistente'
    });
    throw httpError(403, 'ACCESS_NOT_CONFIGURED', 'El acceso seguro no esta activado.');
  }
  if (!temporaryPinMatches) {
    console.warn('[beneficiary-access] Edge PIN temporal rechazado', {
      beneficiaryId: beneficiary?.id || null,
      accountId: account?.id || null,
      rejectionDetail
    });
    await registerFailedBeneficiaryAccess(supabase, account, account.access_identifier);
    throw httpError(403, 'ACCESS_DENIED', 'No hemos podido validar el PIN temporal.');
  }

  const now = new Date().toISOString();
  const salt = crypto.randomUUID();
  const { data, error } = await supabase
    .from('beneficiary_portal_accounts')
    .update({
      pin_hash: hashAccessPin(newPin, salt),
      pin_salt: salt,
      pin_set_at: now,
      must_change_pin: false,
      pin_changed_at: now,
      temporary_pin_sent_at: null,
      failed_access_attempts: 0,
      last_failed_access_at: null,
      locked_until: null,
      updated_at: now
    })
    .eq('id', account.id)
    .select()
    .single();
  if (error) throw error;
  await audit(supabase, `Portal del Beneficiario: PIN cambiado por ${beneficiary.code || beneficiary.id}`);
  return {
    changed: true,
    pinChangedAt: data.pin_changed_at
  };
}

function pickPinField(payload = {}, rootPayload = {}, names = []) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(payload, name)) {
      return { name: `payload.${name}`, value: payload[name] };
    }
  }
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(rootPayload, name)) {
      return { name: `body.${name}`, value: rootPayload[name] };
    }
  }
  return { name: '', value: '' };
}

function maskPinForLog(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= 2) return '*'.repeat(text.length);
  return `${'*'.repeat(text.length - 2)}${text.slice(-2)}`;
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
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_name: 'Portal',
      user_email: '',
      action,
      happened_at: new Date().toISOString()
    });
    if (error) console.warn('[send-portal-otp] No se pudo registrar auditoria', { message: error.message });
  } catch (error) {
    console.warn('[send-portal-otp] No se pudo registrar auditoria', { message: error?.message || 'error desconocido' });
  }
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

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function maskEmail(value) {
  const email = cleanEmail(value);
  if (!email) return '';
  const [name, domain] = email.split('@');
  const visibleName = name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

function normalizeText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function logPortalDebug(portal, message, details = {}) {
  if (portal !== 'collaborator') return;
  console.info('[send-portal-otp][collaborator]', message, details);
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
