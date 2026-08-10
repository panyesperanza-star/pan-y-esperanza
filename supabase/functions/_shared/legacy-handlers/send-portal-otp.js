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

    return sendJson(response, 400, { ok: false, code: 'INVALID_OPERATION', error: 'OperaciÃ³n no vÃ¡lida.' });
  } catch (error) {
    const status = error.status || 500;
    logPortalDebug(requestPortal, 'respuesta final', { ok: false, status, code: error.code || 'PORTAL_AUTH_FAILED' });
    return sendJson(response, status, {
      ok: false,
      code: error.code || 'PORTAL_AUTH_FAILED',
      error: error.message || 'No se pudo completar la operaciÃ³n del portal.'
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
  const [deliveries, documents, history, notices, resources, renewals, profileUpdates, community, accountResult] = await Promise.all([
    listBy(supabase, 'deliveries', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_documents', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'social_history', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_notices', 'beneficiary_id', beneficiary.id),
    listPublishedResources(supabase, beneficiary),
    listBy(supabase, 'beneficiary_portal_renewals', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_profile_updates', 'beneficiary_id', beneficiary.id),
    listCommunityOverview(supabase, beneficiary),
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
    community,
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
    if (action === 'create-community-post') {
      return createCommunityPostFromPortal(supabase, subject, payload);
    }
    if (action === 'register-community-interest') {
      return registerCommunityInterestFromPortal(supabase, subject, payload);
    }
    if (action === 'withdraw-community-post') {
      return withdrawCommunityPostFromPortal(supabase, subject, payload);
    }
    if (action === 'withdraw-community-interest') {
      return withdrawCommunityInterestFromPortal(supabase, subject, payload);
    }
    if (action === 'resolve-community-interest') {
      return resolveCommunityInterestFromPortal(supabase, subject, payload);
    }
    if (action === 'report-community-post') {
      return reportCommunityPostFromPortal(supabase, subject, payload);
    }
    if (action === 'send-community-message') {
      return sendCommunityMessageFromPortal(supabase, subject, payload);
    }
    if (action === 'mark-community-conversation-read') {
      return markCommunityConversationReadFromPortal(supabase, subject, payload);
    }
    if (action === 'update-community-offer-status') {
      return updateCommunityOfferStatusFromPortal(supabase, subject, payload);
    }
    if (action === 'block-community-conversation') {
      return blockCommunityConversationFromPortal(supabase, subject, payload);
    }
    if (action === 'report-community-conversation') {
      return reportCommunityConversationFromPortal(supabase, subject, payload);
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

async function listPublishedResources(supabase, beneficiary) {
  const today = new Date().toISOString().slice(0, 10);
  const resourceSelect = 'id,name,organization_name,category,description,requirements,target_audience,required_documents,benefit,opens_at,deadline_at,address,municipality,phone,email,web_url,official_url,application_method,status,scope,age_min,age_max,family_situation,employment_situation,housing_situation,created_at,updated_at,publish_in_beneficiary_portal,visible_to_all_beneficiaries,portal_visibility_scope';
  const [publishedResult, linkResult, audienceResult, documentResult] = await Promise.all([
    supabase
      .from('social_resources')
      .select(resourceSelect)
      .eq('publish_in_beneficiary_portal', true)
      .in('status', ['Activo', 'Proximamente'])
      .or(`deadline_at.is.null,deadline_at.gte.${today}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('beneficiary_social_resources')
      .select('id,resource_id,status,observations,linked_at,updated_at')
      .eq('beneficiary_id', beneficiary.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('social_resource_portal_beneficiaries')
      .select('resource_id')
      .eq('beneficiary_id', beneficiary.id),
    supabase
      .from('beneficiary_documents')
      .select('*')
      .eq('beneficiary_id', beneficiary.id)
  ]);
  if (publishedResult.error) throw publishedResult.error;
  if (linkResult.error) throw linkResult.error;
  if (audienceResult.error) throw audienceResult.error;
  if (documentResult.error) throw documentResult.error;

  const linkedRows = linkResult.data || [];
  const linkedIds = [...new Set(linkedRows.map((item) => item.resource_id).filter(Boolean))];
  let assignedResources = [];
  if (linkedIds.length) {
    const assignedResult = await supabase
      .from('social_resources')
      .select(resourceSelect)
      .in('id', linkedIds)
      .in('status', ['Activo', 'Proximamente'])
      .or(`deadline_at.is.null,deadline_at.gte.${today}`);
    if (assignedResult.error) throw assignedResult.error;
    assignedResources = assignedResult.data || [];
  }

  const linkByResource = new Map(linkedRows.map((item) => [item.resource_id, item]));
  const selectedResourceIds = new Set((audienceResult.data || []).map((item) => item.resource_id).filter(Boolean));
  const beneficiaryDocuments = documentResult.data || [];
  const resourcesById = new Map();
  (publishedResult.data || []).forEach((resource) => {
    const scope = resolvePortalResourceScope(resource);
    if (scope === 'all') {
      resourcesById.set(resource.id, sanitizePortalSocialResource(resource, linkByResource.get(resource.id), 'global'));
    } else if (scope === 'compatible' && isPortalCompatibleResource(resource, beneficiary, beneficiaryDocuments)) {
      resourcesById.set(resource.id, sanitizePortalSocialResource(resource, linkByResource.get(resource.id), 'compatible'));
    } else if (scope === 'selected' && selectedResourceIds.has(resource.id)) {
      resourcesById.set(resource.id, sanitizePortalSocialResource(resource, linkByResource.get(resource.id), 'selected'));
    }
  });
  assignedResources.forEach((resource) => {
    resourcesById.set(resource.id, sanitizePortalSocialResource(resource, linkByResource.get(resource.id), 'individual'));
  });

  return [...resourcesById.values()].sort((a, b) =>
    Number(b.is_new) - Number(a.is_new)
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))
  );
}

async function listCommunityOverview(supabase, beneficiary) {
  const postsSelect = [
    'id', 'beneficiary_id', 'category', 'title', 'zone', 'description',
    'photo_storage_bucket', 'photo_storage_path', 'photo_file_name', 'photo_mime_type',
    'job_position', 'company_name', 'workday', 'schedule', 'requirements', 'deadline_at',
    'expires_at', 'contact_method', 'status', 'resolution_status', 'rejection_reason',
    'blocked_reason', 'reviewed_at', 'withdrawn_at', 'created_at', 'updated_at',
    'offer_status', 'reserved_interest_id', 'reserved_beneficiary_id', 'reserved_at',
    'delivered_interest_id', 'delivered_beneficiary_id', 'delivered_at'
  ].join(',');

  const { data: postsData, error: postsError } = await supabase
    .from('community_posts')
    .select(postsSelect)
    .or(`status.eq.approved,beneficiary_id.eq.${beneficiary.id},reserved_beneficiary_id.eq.${beneficiary.id}`)
    .order('created_at', { ascending: false });
  if (postsError) throw postsError;

  const posts = postsData || [];
  const postIds = posts.map((item) => item.id).filter(Boolean);
  const ownPostIds = posts.filter((post) => post.beneficiary_id === beneficiary.id).map((post) => post.id).filter(Boolean);

  const currentInterestsQuery = supabase
    .from('community_interests')
    .select('id,post_id,beneficiary_id,status,message,status_notes,closed_at,created_at,updated_at')
    .eq('beneficiary_id', beneficiary.id)
    .order('created_at', { ascending: false });
  const ownInterestsQuery = ownPostIds.length
    ? supabase
        .from('community_interests')
        .select('id,post_id,beneficiary_id,status,message,status_notes,closed_at,created_at,updated_at')
        .in('post_id', ownPostIds)
        .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const reportsQuery = supabase
    .from('community_post_reports')
    .select('id,post_id,beneficiary_id,status,reason,created_at,updated_at')
    .eq('beneficiary_id', beneficiary.id)
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false });
  const recommendationsQuery = supabase
    .from('community_post_recommendations')
    .select('id,post_id,beneficiary_id,status,created_at,updated_at')
    .eq('beneficiary_id', beneficiary.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  const conversationsQuery = supabase
    .from('community_conversations')
    .select('id,post_id,interest_id,author_beneficiary_id,interested_beneficiary_id,status,blocked_by_beneficiary_id,blocked_reason,reported_by_beneficiary_id,report_reason,reported_at,closed_at,last_message_at,created_at,updated_at')
    .or(`author_beneficiary_id.eq.${beneficiary.id},interested_beneficiary_id.eq.${beneficiary.id}`)
    .order('updated_at', { ascending: false });

  const [currentInterestsResult, ownInterestsResult, reportsResult, recommendationsResult, conversationsResult] = await Promise.all([
    currentInterestsQuery,
    ownInterestsQuery,
    reportsQuery,
    recommendationsQuery,
    conversationsQuery
  ]);
  if (currentInterestsResult.error) throw currentInterestsResult.error;
  if (ownInterestsResult.error) throw ownInterestsResult.error;
  if (reportsResult.error) throw reportsResult.error;
  if (recommendationsResult.error) throw recommendationsResult.error;
  if (conversationsResult.error) throw conversationsResult.error;

  const currentInterests = currentInterestsResult.data || [];
  const ownInterests = ownInterestsResult.data || [];
  const allRelevantInterests = dedupeById([...currentInterests, ...ownInterests]);
  const conversations = conversationsResult.data || [];
  const conversationIds = conversations.map((item) => item.id).filter(Boolean);

  const messagesResult = conversationIds.length
    ? await supabase
        .from('community_messages')
        .select('id,conversation_id,sender_beneficiary_id,message,read_at,created_at,updated_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (messagesResult.error) throw messagesResult.error;

  const participantIds = new Set([beneficiary.id]);
  allRelevantInterests.forEach((interest) => participantIds.add(interest.beneficiary_id));
  conversations.forEach((conversation) => {
    participantIds.add(conversation.author_beneficiary_id);
    participantIds.add(conversation.interested_beneficiary_id);
  });
  const beneficiariesResult = participantIds.size
    ? await supabase
        .from('beneficiaries')
        .select('id,full_name,code')
        .in('id', [...participantIds])
    : { data: [], error: null };
  if (beneficiariesResult.error) throw beneficiariesResult.error;

  const context = {
    currentBeneficiary: beneficiary,
    currentBeneficiaryId: beneficiary.id,
    interestByPost: latestByPost(currentInterests),
    reportByPost: new Map((reportsResult.data || []).map((item) => [item.post_id, item])),
    recommendationByPost: latestByPost(recommendationsResult.data || []),
    ownerInterestsByPost: groupByPost(allRelevantInterests.filter((item) => ownPostIds.includes(item.post_id))),
    conversationByInterest: new Map(conversations.map((item) => [item.interest_id, item])),
    messagesByConversation: groupByConversation(messagesResult.data || []),
    beneficiaryById: new Map((beneficiariesResult.data || []).map((item) => [item.id, item]))
  };

  const visiblePosts = posts.filter((post) => isCommunityPostVisibleToBeneficiary(post, beneficiary.id, context.interestByPost.get(post.id)));
  const sanitized = await Promise.all(visiblePosts.map((post) => sanitizePortalCommunityPost(supabase, post, context)));

  return {
    posts: sanitized.filter((post) => !post.ownPost && post.status === 'approved' && (post.active || post.reserved_for_me)),
    myPosts: sanitized.filter((post) => post.ownPost),
    interests: currentInterests.filter(interestIsActive)
  };
}

async function sanitizePortalCommunityPost(supabase, post = {}, contextOrBeneficiary = '', interestArg = null, reportArg = null) {
  const context = normalizeCommunitySanitizeContext(contextOrBeneficiary, interestArg, reportArg);
  const currentBeneficiary = context.currentBeneficiary;
  const currentBeneficiaryId = context.currentBeneficiaryId;
  const ownPost = post.beneficiary_id === currentBeneficiaryId;
  const interest = context.interestByPost?.get(post.id) || null;
  const report = context.reportByPost?.get(post.id) || null;
  const ownerInterests = context.ownerInterestsByPost?.get(post.id) || [];
  const offerStatus = post.offer_status || 'available';
  const reservedForMe = post.reserved_beneficiary_id === currentBeneficiaryId || interest?.status === 'reserved';
  const active = isCommunityPostActive(post);
  const availableForInterest = !ownPost && active && !interestIsActive(interest) && isCommunityPostAvailableForInterest(post);
  const conversation = interest?.id ? context.conversationByInterest?.get(interest.id) : null;
  const manualRecommendation = context.recommendationByPost?.get(post.id) || null;
  const automaticRecommendation = ownPost ? null : analyzeCommunityEmploymentRecommendation(post, currentBeneficiary);
  const recommendation = !ownPost && manualRecommendation
    ? {
        recommended: true,
        label: 'Recomendado por el equipo',
        reasons: ['El equipo de Pan y Esperanza ha revisado esta publicacion y la ha marcado para tu Portal.'],
        note: 'Recomendacion revisada por el equipo de Pan y Esperanza.'
      }
    : automaticRecommendation;

  return {
    id: post.id,
    category: post.category || 'need',
    title: post.title || '',
    zone: post.zone || '',
    description: post.description || '',
    photo_url: await signedCommunityPhotoUrl(supabase, post),
    job_position: post.job_position || '',
    company_name: post.company_name || '',
    workday: post.workday || '',
    schedule: post.schedule || '',
    requirements: post.requirements || '',
    deadline_at: post.deadline_at || null,
    expires_at: post.expires_at || null,
    contact_method: post.contact_method || 'Chat privado dentro del Portal Beneficiario',
    status: post.status || 'pending_review',
    resolution_status: post.resolution_status || 'active',
    offer_status: offerStatus,
    reserved_interest_id: post.reserved_interest_id || null,
    reserved_beneficiary_id: post.reserved_beneficiary_id || null,
    reserved_at: post.reserved_at || null,
    delivered_interest_id: post.delivered_interest_id || null,
    delivered_beneficiary_id: post.delivered_beneficiary_id || null,
    delivered_at: post.delivered_at || null,
    rejection_reason: ownPost ? post.rejection_reason || '' : '',
    blocked_reason: ownPost ? post.blocked_reason || '' : '',
    created_at: post.created_at || null,
    updated_at: post.updated_at || null,
    reviewed_at: post.reviewed_at || null,
    withdrawn_at: post.withdrawn_at || null,
    ownPost,
    active,
    available_for_interest: availableForInterest,
    reserved_for_me: reservedForMe,
    interested: interestIsActive(interest),
    interest_id: interest?.id || null,
    interest_status: interest?.status || '',
    interest_status_label: statusLabelForCommunityInterest(interest?.status),
    interest_count: ownerInterests.filter(interestIsActive).length,
    interests: ownPost ? ownerInterests.map((item) => sanitizeCommunityInterestForPortal(item, context)) : [],
    conversation: conversation ? sanitizeCommunityConversationForPortal(conversation, context) : null,
    reported: Boolean(report && report.status !== 'dismissed'),
    manual_recommendation: Boolean(manualRecommendation),
    recommendation
  };
}

function normalizeCommunitySanitizeContext(contextOrBeneficiary, interest, report) {
  if (contextOrBeneficiary && typeof contextOrBeneficiary === 'object' && contextOrBeneficiary.currentBeneficiaryId) {
    return contextOrBeneficiary;
  }
  const currentBeneficiary = typeof contextOrBeneficiary === 'object' ? contextOrBeneficiary : { id: contextOrBeneficiary };
  return {
    currentBeneficiary,
    currentBeneficiaryId: currentBeneficiary?.id || contextOrBeneficiary,
    interestByPost: new Map(interest ? [[interest.post_id, interest]] : []),
    reportByPost: new Map(report ? [[report.post_id, report]] : []),
    recommendationByPost: new Map(),
    ownerInterestsByPost: new Map(),
    conversationByInterest: new Map(),
    messagesByConversation: new Map(),
    beneficiaryById: new Map()
  };
}

function sanitizeCommunityInterestForPortal(interest = {}, context = {}) {
  const beneficiary = context.beneficiaryById?.get(interest.beneficiary_id) || {};
  const conversation = context.conversationByInterest?.get(interest.id) || null;
  return {
    id: interest.id,
    post_id: interest.post_id,
    beneficiary_id: interest.beneficiary_id,
    beneficiary_name: beneficiary.full_name || 'Beneficiario',
    beneficiary_code: beneficiary.code || '',
    status: interest.status || 'new',
    status_label: statusLabelForCommunityInterest(interest.status),
    message: interest.message || '',
    status_notes: interest.status_notes || '',
    created_at: interest.created_at || null,
    updated_at: interest.updated_at || null,
    conversation: conversation ? sanitizeCommunityConversationForPortal(conversation, context) : null
  };
}

function sanitizeCommunityConversationForPortal(conversation = {}, context = {}) {
  const currentId = context.currentBeneficiaryId;
  const messages = context.messagesByConversation?.get(conversation.id) || [];
  const participantId = conversation.author_beneficiary_id === currentId
    ? conversation.interested_beneficiary_id
    : conversation.author_beneficiary_id;
  const participant = context.beneficiaryById?.get(participantId) || {};
  return {
    id: conversation.id,
    post_id: conversation.post_id,
    interest_id: conversation.interest_id,
    status: conversation.status || 'open',
    blocked_by_me: conversation.blocked_by_beneficiary_id === currentId,
    reported_by_me: conversation.reported_by_beneficiary_id === currentId,
    participant_name: participant.full_name || 'Beneficiario',
    participant_code: participant.code || '',
    last_message_at: conversation.last_message_at || null,
    unread_count: messages.filter((message) => message.sender_beneficiary_id !== currentId && !message.read_at).length,
    messages: messages.map((message) => ({
      id: message.id,
      conversation_id: message.conversation_id,
      sender: message.sender_beneficiary_id === currentId ? 'me' : 'other',
      message: message.message || '',
      read_at: message.read_at || null,
      created_at: message.created_at || null
    }))
  };
}

async function signedCommunityPhotoUrl(supabase, post = {}) {
  const bucket = cleanText(post.photo_storage_bucket || 'community-post-photos');
  const path = cleanText(post.photo_storage_path);
  if (!path) return '';
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn('[send-portal-otp] No se pudo firmar foto de comunidad', { postId: post.id, message: error.message });
    return '';
  }
  return data?.signedUrl || '';
}

function sanitizeCommunityPostPayload(beneficiary, payload = {}) {
  const category = cleanText(payload.category || 'need');
  const title = cleanText(payload.title || payload.job_position || payload.position);
  const zone = cleanText(payload.zone || payload.neighborhood || payload.barrio);
  const description = cleanText(payload.description);
  const expiresAt = cleanText(payload.expires_at || payload.valid_until || payload.deadline_at) || defaultCommunityExpiresAt();
  if (!['employment', 'offer', 'need'].includes(category)) throw new Error('Categoria de comunidad no valida.');
  if (title.length < 3) throw new Error('Indica un titulo para la publicacion.');
  if (zone.length < 2) throw new Error('Indica una zona o barrio, sin direccion privada.');
  if (description.length < 10) throw new Error('Describe brevemente la publicacion.');

  return {
    beneficiary_id: beneficiary.id,
    category,
    title,
    zone,
    description,
    job_position: cleanText(payload.job_position || payload.position),
    company_name: cleanText(payload.company_name || payload.company),
    workday: cleanText(payload.workday),
    schedule: cleanText(payload.schedule),
    requirements: cleanText(payload.requirements),
    deadline_at: payload.deadline_at || null,
    expires_at: expiresAt,
    contact_method: cleanText(payload.contact_method || 'Chat privado dentro del Portal Beneficiario'),
    status: 'pending_review',
    resolution_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function defaultCommunityExpiresAt() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function isCommunityPostActive(post = {}) {
  if (post.status !== 'approved') return false;
  if ((post.resolution_status || 'active') !== 'active') return false;
  if (post.expires_at && String(post.expires_at).slice(0, 10) < new Date().toISOString().slice(0, 10)) return false;
  return true;
}

function isCommunityPostAvailableForInterest(post = {}) {
  if (!isCommunityPostActive(post)) return false;
  if (post.category === 'offer' && (post.offer_status || 'available') !== 'available') return false;
  return true;
}

function isCommunityPostVisibleToBeneficiary(post = {}, beneficiaryId = '', interest = null) {
  if (post.beneficiary_id === beneficiaryId) return true;
  if (!isCommunityPostActive(post)) return false;
  if (post.category !== 'offer') return true;
  const offerStatus = post.offer_status || 'available';
  if (offerStatus === 'available') return true;
  if (offerStatus === 'reserved') return post.reserved_beneficiary_id === beneficiaryId || interest?.status === 'reserved';
  return false;
}

function interestIsActive(interest = null) {
  return Boolean(interest && !['cancelled', 'withdrawn', 'closed', 'delivered', 'not_completed', 'completed', 'not_selected'].includes(interest.status));
}

function statusLabelForCommunityInterest(status = '') {
  const labels = {
    registered: 'Nuevo',
    new: 'Nuevo',
    reviewed: 'Revisado',
    contacted: 'Contactado',
    delivery_pending: 'Entrega pendiente',
    delivered: 'Entregado / Cerrado',
    not_completed: 'No realizado',
    reserved: 'Reservado',
    completed: 'Entregado / Cerrado',
    not_selected: 'Cerrado',
    referred: 'Derivado',
    closed: 'Cerrado',
    cancelled: 'Cancelado',
    withdrawn: 'Retirado'
  };
  return labels[status] || 'Nuevo';
}

function textSignalsFrom(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function containsAnySignal(source, signals) {
  const normalizedSource = normalizeText(source);
  return signals.some((signal) => signal && normalizedSource.includes(signal));
}

function analyzeCommunityEmploymentRecommendation(post = {}, beneficiary = {}) {
  if (post.category !== 'employment') return null;
  const reasons = [];
  const jobText = [post.title, post.job_position, post.company_name, post.workday, post.schedule, post.requirements, post.description].filter(Boolean).join(' ');
  const laborProfile = [beneficiary.job_sector, beneficiary.desired_sector, beneficiary.work_interests, beneficiary.employment_interests, beneficiary.professional_interests, beneficiary.profession, beneficiary.skills].filter(Boolean).join(' ');
  const availability = [beneficiary.availability, beneficiary.work_availability, beneficiary.desired_workday, beneficiary.preferred_workday].filter(Boolean).join(' ');
  const experience = [beneficiary.experience, beneficiary.work_experience, beneficiary.training, beneficiary.education].filter(Boolean).join(' ');
  const zone = [beneficiary.zone, beneficiary.neighborhood, beneficiary.barrio, beneficiary.municipality, beneficiary.city].filter(Boolean).join(' ');

  if (post.zone && zone && containsAnySignal(post.zone, textSignalsFrom(zone))) reasons.push('Coincide con tu zona o municipio registrado.');
  if (laborProfile && containsAnySignal(jobText, textSignalsFrom(laborProfile))) reasons.push('Relacionada con tus intereses laborales registrados.');
  if (availability && containsAnySignal(`${post.workday} ${post.schedule}`, textSignalsFrom(availability))) reasons.push('Encaja con tu disponibilidad o jornada buscada.');
  if (experience && containsAnySignal(`${post.requirements} ${post.description}`, textSignalsFrom(experience))) reasons.push('Puede encajar con tu experiencia o formacion registrada.');

  if (!reasons.length) return null;
  return {
    recommended: true,
    label: 'Puede interesarte',
    reasons: reasons.slice(0, 3),
    note: 'Recomendacion basada solo en datos laborales disponibles del expediente.'
  };
}

async function createCommunityPostFromPortal(supabase, beneficiary, payload = {}) {
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('community_posts')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiary_id', beneficiary.id)
    .gte('created_at', since)
    .not('status', 'in', '(withdrawn,rejected,blocked)');
  if (countError) throw countError;
  if (Number(count || 0) >= 3) throw new Error('Has alcanzado el limite diario de publicaciones. El equipo revisara las pendientes.');

  const insertPayload = sanitizeCommunityPostPayload(beneficiary, payload);
  const photo = payload.photoDataUrl
    ? await uploadCommunityPhotoFromDataUrl(supabase, beneficiary, payload.photoDataUrl, payload.photoFileName)
    : null;

  if (photo) {
    insertPayload.photo_storage_bucket = photo.bucket;
    insertPayload.photo_storage_path = photo.path;
    insertPayload.photo_file_name = photo.fileName;
    insertPayload.photo_mime_type = photo.mimeType;
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert(insertPayload)
    .select('*')
    .single();
  if (error) throw error;

  await notifyCommunityModeration(supabase, beneficiary, data, now);
  await audit(supabase, `Portal del Beneficiario: publicacion de comunidad pendiente ${data.id}`);
  return sanitizePortalCommunityPost(supabase, data, beneficiary, null);
}

async function registerCommunityInterestFromPortal(supabase, beneficiary, payload = {}) {
  const postId = cleanText(payload.postId || payload.post_id);
  if (!postId) throw new Error('No se ha indicado la publicacion.');

  const { data: post, error: postError } = await supabase
    .from('community_posts')
    .select('id,beneficiary_id,category,title,status,resolution_status,expires_at,offer_status')
    .eq('id', postId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post || !isCommunityPostAvailableForInterest(post)) throw new Error('La publicacion ya no esta disponible.');
  if (post.beneficiary_id === beneficiary.id) throw new Error('No puedes marcar interes en tu propia publicacion.');

  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabase
    .from('community_interests')
    .select('id,status')
    .eq('post_id', postId)
    .eq('beneficiary_id', beneficiary.id)
    .maybeSingle();
  if (currentError) throw currentError;

  const interestPayload = {
    post_id: postId,
    beneficiary_id: beneficiary.id,
    status: 'new',
    message: cleanText(payload.message),
    updated_at: now
  };
  const query = current
    ? supabase.from('community_interests').update(interestPayload).eq('id', current.id)
    : supabase.from('community_interests').insert({ ...interestPayload, created_at: now });
  const { data: interest, error } = await query.select('id,post_id,beneficiary_id,status,message,created_at,updated_at').single();
  if (error) throw error;

  await ensureCommunityConversation(supabase, post, interest, now);
  await notifyCommunityInterest(supabase, beneficiary, post, now);
  await audit(supabase, `Portal del Beneficiario: interes registrado en comunidad ${postId}`);
  return interest;
}

async function withdrawCommunityPostFromPortal(supabase, beneficiary, payload = {}) {
  const postId = cleanText(payload.postId || payload.post_id);
  if (!postId) throw new Error('No se ha indicado la publicacion.');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('community_posts')
    .update({ status: 'withdrawn', withdrawn_at: now, updated_at: now })
    .eq('id', postId)
    .eq('beneficiary_id', beneficiary.id)
    .select('*')
    .single();
  if (error) throw error;
  await audit(supabase, `Portal del Beneficiario: publicacion de comunidad retirada ${postId}`);
  return sanitizePortalCommunityPost(supabase, data, beneficiary, null);
}

async function withdrawCommunityInterestFromPortal(supabase, beneficiary, payload = {}) {
  const interestId = cleanText(payload.interestId || payload.interest_id);
  if (!interestId) throw new Error('No se ha indicado el interes.');
  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabase
    .from('community_interests')
    .select('id,status')
    .eq('id', interestId)
    .eq('beneficiary_id', beneficiary.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error('El interes no existe o no pertenece a tu portal.');
  if (['reserved', 'completed', 'not_selected', 'delivery_pending', 'delivered', 'not_completed', 'closed'].includes(current.status)) {
    throw new Error('Este interes ya no puede retirarse desde el portal.');
  }
  const { data, error } = await supabase
    .from('community_interests')
    .update({ status: 'withdrawn', updated_at: now })
    .eq('id', interestId)
    .eq('beneficiary_id', beneficiary.id)
    .select('id,post_id,beneficiary_id,status,message,created_at,updated_at')
    .single();
  if (error) throw error;
  await audit(supabase, `Portal del Beneficiario: interes retirado en comunidad ${interestId}`);
  return data;
}

async function resolveCommunityInterestFromPortal(supabase, beneficiary, payload = {}) {
  throw new Error('El propietario de la publicacion gestiona la reserva y la entrega desde su Portal.');
}

async function reportCommunityPostFromPortal(supabase, beneficiary, payload = {}) {
  const postId = cleanText(payload.postId || payload.post_id);
  const reason = cleanText(payload.reason);
  if (!postId) throw new Error('No se ha indicado la publicacion.');
  if (reason.length < 3) throw new Error('Indica brevemente el motivo del reporte.');

  const { data: post, error: postError } = await supabase
    .from('community_posts')
    .select('id,beneficiary_id,title,status,resolution_status,expires_at')
    .eq('id', postId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post || !isCommunityPostActive(post)) throw new Error('La publicacion ya no esta disponible.');
  if (post.beneficiary_id === beneficiary.id) throw new Error('No puedes reportar tu propia publicacion.');

  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabase
    .from('community_post_reports')
    .select('id')
    .eq('post_id', postId)
    .eq('beneficiary_id', beneficiary.id)
    .maybeSingle();
  if (currentError) throw currentError;

  const reportPayload = {
    post_id: postId,
    beneficiary_id: beneficiary.id,
    reason,
    status: 'new',
    updated_at: now
  };
  const query = current
    ? supabase.from('community_post_reports').update(reportPayload).eq('id', current.id)
    : supabase.from('community_post_reports').insert({ ...reportPayload, created_at: now });
  const { data: report, error } = await query.select('id,post_id,beneficiary_id,status,reason,created_at,updated_at').single();
  if (error) throw error;

  await notifyCommunityReport(supabase, beneficiary, post, now);
  await audit(supabase, `Portal del Beneficiario: reporte de comunidad ${postId}`);
  return report;
}

async function notifyCommunityReport(supabase, beneficiary, post, now) {
  const { error } = await supabase.from('notificaciones').insert({
    tipo: 'warning',
    prioridad: 'warning',
    modulo: 'community-moderation',
    origen: 'Portal del Beneficiario',
    titulo: 'Reporte en Comunidad',
    mensaje: `${beneficiary.full_name || beneficiary.code || 'Beneficiario'} ha reportado: ${post.title}.`,
    estado: 'Pendiente',
    leida: false,
    entity_type: 'community_post',
    entity_id: post.id,
    action_url: '/community-moderation',
    dedupe_key: `community-report-${post.id}-${beneficiary.id}-${now}`,
    metadata: { beneficiary_id: beneficiary.id, post_id: post.id },
    created_at: now,
    updated_at: now
  });
  if (error) console.warn('[send-portal-otp] No se pudo registrar notificacion de reporte de comunidad', { message: error.message });
}
async function notifyCommunityModeration(supabase, beneficiary, post, now) {
  const { error } = await supabase.from('notificaciones').insert({
    tipo: 'info',
    prioridad: 'normal',
    modulo: 'community-moderation',
    origen: 'Portal del Beneficiario',
    titulo: 'Publicacion de comunidad pendiente',
    mensaje: `${beneficiary.full_name || beneficiary.code || 'Beneficiario'} ha enviado una publicacion: ${post.title}.`,
    estado: 'Pendiente',
    leida: false,
    entity_type: 'community_post',
    entity_id: post.id,
    action_url: '/community-moderation',
    dedupe_key: `community-post-${post.id}`,
    metadata: {
      beneficiary_id: beneficiary.id,
      post_id: post.id,
      category: post.category
    },
    created_at: now,
    updated_at: now
  });
  if (error) console.warn('[send-portal-otp] No se pudo registrar notificacion de comunidad', { message: error.message });
}

async function notifyCommunityInterest(supabase, beneficiary, post, now) {
  await createBeneficiaryPortalNotice(supabase, post.beneficiary_id, {
    title: 'Alguien esta interesado en tu publicacion',
    message: `A ${beneficiary.code || 'un beneficiario'} le interesa tu publicacion "${post.title}". Puedes verlo y contactar desde Comunidad.`,
    notice_type: 'community_interest',
    created_at: now
  });
}

async function ensureCommunityConversation(supabase, post, interest, now) {
  const { data: current, error: currentError } = await supabase
    .from('community_conversations')
    .select('id,status')
    .eq('interest_id', interest.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current) {
    if (current.status !== 'open') {
      const { error: reopenError } = await supabase
        .from('community_conversations')
        .update({ status: 'open', closed_at: null, updated_at: now })
        .eq('id', current.id);
      if (reopenError) throw reopenError;
    }
    return current;
  }
  const { data, error } = await supabase
    .from('community_conversations')
    .insert({
      post_id: post.id,
      interest_id: interest.id,
      author_beneficiary_id: post.beneficiary_id,
      interested_beneficiary_id: interest.beneficiary_id,
      status: 'open',
      created_at: now,
      updated_at: now
    })
    .select('id,status')
    .single();
  if (error) throw error;
  return data;
}

async function sendCommunityMessageFromPortal(supabase, beneficiary, payload = {}) {
  const conversationId = cleanText(payload.conversationId || payload.conversation_id);
  const message = cleanText(payload.message);
  if (!conversationId) throw new Error('No se ha indicado la conversacion.');
  if (!message) throw new Error('Escribe un mensaje.');
  if (message.length > 1200) throw new Error('El mensaje no puede superar 1200 caracteres.');

  const conversation = await requireCommunityConversationParticipant(supabase, conversationId, beneficiary.id);
  if (['blocked', 'closed', 'completed'].includes(conversation.status)) {
    throw new Error('Esta conversacion ya no admite nuevos mensajes.');
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('community_messages')
    .insert({
      conversation_id: conversation.id,
      sender_beneficiary_id: beneficiary.id,
      message,
      created_at: now,
      updated_at: now
    })
    .select('id,conversation_id,sender_beneficiary_id,message,read_at,created_at,updated_at')
    .single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from('community_conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conversation.id);
  if (updateError) throw updateError;
  const recipientId = conversation.author_beneficiary_id === beneficiary.id
    ? conversation.interested_beneficiary_id
    : conversation.author_beneficiary_id;
  await createBeneficiaryPortalNotice(supabase, recipientId, {
    title: 'Nuevo mensaje en Comunidad',
    message: `${beneficiary.code || 'Un beneficiario'} te ha enviado un mensaje sobre una publicacion.`,
    notice_type: 'community_message',
    created_at: now
  });
  await audit(supabase, `Portal del Beneficiario: mensaje de comunidad ${conversation.id}`);
  return data;
}

async function markCommunityConversationReadFromPortal(supabase, beneficiary, payload = {}) {
  const conversationId = cleanText(payload.conversationId || payload.conversation_id);
  if (!conversationId) throw new Error('No se ha indicado la conversacion.');
  const conversation = await requireCommunityConversationParticipant(supabase, conversationId, beneficiary.id);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('community_messages')
    .update({ read_at: now, updated_at: now })
    .eq('conversation_id', conversation.id)
    .neq('sender_beneficiary_id', beneficiary.id)
    .is('read_at', null);
  if (error) throw error;
  return { read: true };
}

async function updateCommunityOfferStatusFromPortal(supabase, beneficiary, payload = {}) {
  const postId = cleanText(payload.postId || payload.post_id);
  const interestId = cleanText(payload.interestId || payload.interest_id);
  const status = cleanText(payload.status || payload.offer_status);
  if (!postId) throw new Error('No se ha indicado la publicacion.');
  if (!['reserved', 'available', 'delivered'].includes(status)) throw new Error('Estado de articulo no valido.');

  const { data: post, error: postError } = await supabase
    .from('community_posts')
    .select('id,beneficiary_id,category,title,status,resolution_status,offer_status,reserved_interest_id,reserved_beneficiary_id')
    .eq('id', postId)
    .eq('beneficiary_id', beneficiary.id)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) throw new Error('La publicacion no existe o no pertenece a tu portal.');
  if (post.category !== 'offer') throw new Error('Esta accion solo esta disponible para publicaciones de Ofrezco.');

  if (status === 'reserved') return reserveCommunityOfferForInterest(supabase, beneficiary, post, interestId);
  if (status === 'available') return makeCommunityOfferAvailableAgain(supabase, beneficiary, post);
  return markCommunityOfferDelivered(supabase, beneficiary, post);
}

async function reserveCommunityOfferForInterest(supabase, beneficiary, post, interestId) {
  if (!interestId) throw new Error('Selecciona la persona interesada.');
  if (!isCommunityPostAvailableForInterest(post)) throw new Error('El articulo no esta disponible para reservar.');
  const { data: interest, error: interestError } = await supabase
    .from('community_interests')
    .select('id,post_id,beneficiary_id,status')
    .eq('id', interestId)
    .eq('post_id', post.id)
    .maybeSingle();
  if (interestError) throw interestError;
  if (!interest || !interestIsActive(interest)) throw new Error('El interes seleccionado no esta disponible.');

  const now = new Date().toISOString();
  const { data: updatedPost, error: postUpdateError } = await supabase
    .from('community_posts')
    .update({
      offer_status: 'reserved',
      reserved_interest_id: interest.id,
      reserved_beneficiary_id: interest.beneficiary_id,
      reserved_at: now,
      updated_at: now
    })
    .eq('id', post.id)
    .select('*')
    .single();
  if (postUpdateError) throw postUpdateError;
  const { error: interestUpdateError } = await supabase
    .from('community_interests')
    .update({
      status: 'reserved',
      status_notes: 'El propietario ha reservado este articulo para esta persona.',
      updated_at: now
    })
    .eq('id', interest.id);
  if (interestUpdateError) throw interestUpdateError;
  await notifyOfferReserved(supabase, interest.beneficiary_id, post, now);
  await audit(supabase, `Portal del Beneficiario: articulo reservado ${post.id}`);
  return updatedPost;
}

async function makeCommunityOfferAvailableAgain(supabase, beneficiary, post) {
  if ((post.offer_status || 'available') !== 'reserved') throw new Error('El articulo no esta reservado.');
  const now = new Date().toISOString();
  const reservedInterestId = post.reserved_interest_id;
  const reservedBeneficiaryId = post.reserved_beneficiary_id;
  const { data: updatedPost, error: postUpdateError } = await supabase
    .from('community_posts')
    .update({
      offer_status: 'available',
      reserved_interest_id: null,
      reserved_beneficiary_id: null,
      reserved_at: null,
      updated_at: now
    })
    .eq('id', post.id)
    .select('*')
    .single();
  if (postUpdateError) throw postUpdateError;
  if (reservedInterestId) {
    const { error: interestUpdateError } = await supabase
      .from('community_interests')
      .update({
        status: 'new',
        status_notes: 'El propietario cancelo la reserva. La publicacion vuelve a estar disponible.',
        updated_at: now
      })
      .eq('id', reservedInterestId);
    if (interestUpdateError) throw interestUpdateError;
  }
  if (reservedBeneficiaryId) await notifyOfferReservationCancelled(supabase, reservedBeneficiaryId, post, now);
  await audit(supabase, `Portal del Beneficiario: articulo vuelve a disponible ${post.id}`);
  return updatedPost;
}

async function markCommunityOfferDelivered(supabase, beneficiary, post) {
  if ((post.offer_status || 'available') !== 'reserved' || !post.reserved_interest_id || !post.reserved_beneficiary_id) {
    throw new Error('Antes de marcar como entregado debes reservar el articulo para una persona.');
  }
  const now = new Date().toISOString();
  const { data: updatedPost, error: postUpdateError } = await supabase
    .from('community_posts')
    .update({
      offer_status: 'delivered',
      resolution_status: 'item_delivered',
      resolution_notes: 'Articulo marcado como entregado por el propietario desde el Portal Beneficiario.',
      delivered_interest_id: post.reserved_interest_id,
      delivered_beneficiary_id: post.reserved_beneficiary_id,
      delivered_at: now,
      updated_at: now
    })
    .eq('id', post.id)
    .select('*')
    .single();
  if (postUpdateError) throw postUpdateError;
  const { error: selectedError } = await supabase
    .from('community_interests')
    .update({
      status: 'completed',
      status_notes: 'Articulo entregado por el propietario.',
      closed_at: now,
      updated_at: now
    })
    .eq('id', post.reserved_interest_id);
  if (selectedError) throw selectedError;

  const { data: otherInterests, error: othersReadError } = await supabase
    .from('community_interests')
    .select('id,beneficiary_id')
    .eq('post_id', post.id)
    .neq('id', post.reserved_interest_id)
    .not('status', 'in', '(cancelled,withdrawn,closed,completed,delivered,not_completed,not_selected)');
  if (othersReadError) throw othersReadError;
  const { error: othersUpdateError } = await supabase
    .from('community_interests')
    .update({
      status: 'not_selected',
      status_notes: 'Este articulo ya ha sido entregado.',
      closed_at: now,
      updated_at: now
    })
    .eq('post_id', post.id)
    .neq('id', post.reserved_interest_id)
    .not('status', 'in', '(cancelled,withdrawn,closed,completed,delivered,not_completed,not_selected)');
  if (othersUpdateError) throw othersUpdateError;
  const { error: conversationsError } = await supabase
    .from('community_conversations')
    .update({ status: 'completed', closed_at: now, updated_at: now })
    .eq('post_id', post.id);
  if (conversationsError) throw conversationsError;

  await notifyOfferDelivered(supabase, post.reserved_beneficiary_id, post, now);
  await Promise.all((otherInterests || []).map((interest) => notifyOfferNoLongerAvailable(supabase, interest.beneficiary_id, post, now)));
  await audit(supabase, `Portal del Beneficiario: articulo entregado ${post.id}`);
  return updatedPost;
}

async function blockCommunityConversationFromPortal(supabase, beneficiary, payload = {}) {
  const conversationId = cleanText(payload.conversationId || payload.conversation_id);
  const reason = cleanText(payload.reason || 'Bloqueada por el beneficiario');
  if (!conversationId) throw new Error('No se ha indicado la conversacion.');
  const conversation = await requireCommunityConversationParticipant(supabase, conversationId, beneficiary.id);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('community_conversations')
    .update({
      status: 'blocked',
      blocked_by_beneficiary_id: beneficiary.id,
      blocked_reason: reason,
      closed_at: now,
      updated_at: now
    })
    .eq('id', conversation.id)
    .select('*')
    .single();
  if (error) throw error;
  await audit(supabase, `Portal del Beneficiario: conversacion bloqueada ${conversation.id}`);
  return data;
}

async function reportCommunityConversationFromPortal(supabase, beneficiary, payload = {}) {
  const conversationId = cleanText(payload.conversationId || payload.conversation_id);
  const reason = cleanText(payload.reason);
  if (!conversationId) throw new Error('No se ha indicado la conversacion.');
  if (reason.length < 3) throw new Error('Indica brevemente el motivo del reporte.');
  const conversation = await requireCommunityConversationParticipant(supabase, conversationId, beneficiary.id);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('community_conversations')
    .update({
      status: 'reported',
      reported_by_beneficiary_id: beneficiary.id,
      report_reason: reason,
      reported_at: now,
      updated_at: now
    })
    .eq('id', conversation.id)
    .select('*')
    .single();
  if (error) throw error;
  await notifyCommunityConversationReport(supabase, beneficiary, data, now);
  await audit(supabase, `Portal del Beneficiario: conversacion reportada ${conversation.id}`);
  return data;
}

async function requireCommunityConversationParticipant(supabase, conversationId, beneficiaryId) {
  const { data, error } = await supabase
    .from('community_conversations')
    .select('id,post_id,interest_id,author_beneficiary_id,interested_beneficiary_id,status')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data.author_beneficiary_id !== beneficiaryId && data.interested_beneficiary_id !== beneficiaryId)) {
    throw new Error('La conversacion no existe o no pertenece a tu portal.');
  }
  return data;
}

async function createBeneficiaryPortalNotice(supabase, beneficiaryId, payload = {}) {
  if (!beneficiaryId) return null;
  const now = payload.created_at || new Date().toISOString();
  const { data, error } = await supabase
    .from('beneficiary_portal_notices')
    .insert({
      beneficiary_id: beneficiaryId,
      title: cleanText(payload.title || 'Aviso de Comunidad'),
      message: cleanText(payload.message || ''),
      notice_type: cleanText(payload.notice_type || 'community'),
      status: 'unread',
      created_at: now,
      updated_at: now
    })
    .select()
    .single();
  if (error) {
    console.warn('[send-portal-otp] No se pudo registrar aviso de portal de Comunidad', { beneficiaryId, message: error.message });
    return null;
  }
  return data;
}

async function notifyOfferReserved(supabase, beneficiaryId, post, now) {
  return createBeneficiaryPortalNotice(supabase, beneficiaryId, {
    title: 'Articulo reservado para ti',
    message: `La publicacion "${post.title}" ha sido reservada para ti. Puedes contactar con la persona autora desde Comunidad.`,
    notice_type: 'community_offer_reserved',
    created_at: now
  });
}

async function notifyOfferReservationCancelled(supabase, beneficiaryId, post, now) {
  return createBeneficiaryPortalNotice(supabase, beneficiaryId, {
    title: 'Reserva cancelada',
    message: `La reserva de "${post.title}" se ha cancelado. La publicacion vuelve a estar disponible.`,
    notice_type: 'community_offer_available',
    created_at: now
  });
}

async function notifyOfferDelivered(supabase, beneficiaryId, post, now) {
  return createBeneficiaryPortalNotice(supabase, beneficiaryId, {
    title: 'Articulo entregado',
    message: `La publicacion "${post.title}" ha sido marcada como entregada por su autor.`,
    notice_type: 'community_offer_delivered',
    created_at: now
  });
}

async function notifyOfferNoLongerAvailable(supabase, beneficiaryId, post, now) {
  return createBeneficiaryPortalNotice(supabase, beneficiaryId, {
    title: 'Articulo ya entregado',
    message: `La publicacion "${post.title}" ya ha sido entregada.`,
    notice_type: 'community_offer_unavailable',
    created_at: now
  });
}

async function notifyCommunityConversationReport(supabase, beneficiary, conversation, now) {
  const { error } = await supabase.from('notificaciones').insert({
    tipo: 'warning',
    prioridad: 'warning',
    modulo: 'community-moderation',
    origen: 'Portal del Beneficiario',
    titulo: 'Conversacion reportada en Comunidad',
    mensaje: `${beneficiary.full_name || beneficiary.code || 'Beneficiario'} ha reportado una conversacion de Comunidad.`,
    estado: 'Pendiente',
    leida: false,
    entity_type: 'community_conversation',
    entity_id: conversation.id,
    action_url: '/community-moderation',
    dedupe_key: `community-conversation-report-${conversation.id}-${beneficiary.id}-${now}`,
    metadata: {
      beneficiary_id: beneficiary.id,
      conversation_id: conversation.id,
      post_id: conversation.post_id
    },
    created_at: now,
    updated_at: now
  });
  if (error) console.warn('[send-portal-otp] No se pudo registrar notificacion de reporte de conversacion', { message: error.message });
}

function dedupeById(items = []) {
  return [...new Map(items.filter((item) => item?.id).map((item) => [item.id, item])).values()];
}

function latestByPost(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (!map.has(item.post_id) || String(item.updated_at || item.created_at || '') > String(map.get(item.post_id).updated_at || map.get(item.post_id).created_at || '')) {
      map.set(item.post_id, item);
    }
  });
  return map;
}

function groupByPost(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const list = map.get(item.post_id) || [];
    list.push(item);
    map.set(item.post_id, list);
  });
  return map;
}

function groupByConversation(items = []) {
  const map = new Map();
  items.forEach((item) => {
    const list = map.get(item.conversation_id) || [];
    list.push(item);
    map.set(item.conversation_id, list);
  });
  return map;
}

async function uploadCommunityPhotoFromDataUrl(supabase, beneficiary, dataUrl, fileName = '') {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) throw new Error('La imagen no tiene un formato valido.');
  if (parsed.bytes.byteLength > 5 * 1024 * 1024) throw new Error('La imagen no puede superar 5 MB.');
  const bucket = 'community-post-photos';
  const extension = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${beneficiary.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });
  if (error) throw error;
  return {
    bucket,
    path: storagePath,
    fileName: cleanText(fileName) || `comunidad.${extension}`,
    mimeType: parsed.mimeType
  };
}

function parseImageDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  return {
    mimeType,
    bytes: Uint8Array.from(Buffer.from(match[2].replace(/\s+/g, ''), 'base64'))
  };
}

function sanitizePortalSocialResource(resource = {}, link = null, portalScope = 'global') {
  const today = new Date().toISOString().slice(0, 10);
  const createdDate = String(resource.created_at || '').slice(0, 10);
  const deadline = String(resource.deadline_at || '').slice(0, 10);
  const daysSinceCreated = createdDate ? daysBetween(createdDate, today) : null;
  const daysUntilDeadline = deadline ? daysBetween(today, deadline) : null;
  return {
    id: resource.id,
    title: resource.name || '',
    name: resource.name || '',
    organization_name: resource.organization_name || '',
    category: resource.category || 'Otros',
    description: resource.description || '',
    requirements: resource.requirements || '',
    target_audience: resource.target_audience || '',
    required_documents: resource.required_documents || '',
    benefit: resource.benefit || '',
    opens_at: resource.opens_at || null,
    deadline_at: resource.deadline_at || null,
    municipality: resource.municipality || '',
    phone: resource.phone || '',
    email: resource.email || '',
    web_url: resource.web_url || '',
    official_url: resource.official_url || '',
    application_method: resource.application_method || '',
    status: resource.status || 'Activo',
    scope: resource.scope || 'municipal',
    created_at: resource.created_at || null,
    updated_at: resource.updated_at || null,
    portal_scope: portalScope,
    assigned_status: link?.status || '',
    is_new: Number.isFinite(daysSinceCreated) && daysSinceCreated <= 30,
    is_closing_soon: Number.isFinite(daysUntilDeadline) && daysUntilDeadline >= 0 && daysUntilDeadline <= 15
  };
}

function resolvePortalResourceScope(resource = {}) {
  const scope = cleanText(resource.portal_visibility_scope);
  if (['all', 'compatible', 'selected', 'none'].includes(scope)) return scope;
  if (resource.publish_in_beneficiary_portal && resource.visible_to_all_beneficiaries) return 'all';
  if (resource.publish_in_beneficiary_portal) return 'selected';
  return 'none';
}

function isPortalCompatibleResource(resource = {}, beneficiary = {}, documents = []) {
  const age = calculateAge(beneficiary.birth_date || beneficiary.date_of_birth || beneficiary.fecha_nacimiento);
  if (Number.isFinite(Number(resource.age_min)) && Number.isFinite(age) && age < Number(resource.age_min)) return false;
  if (Number.isFinite(Number(resource.age_max)) && Number.isFinite(age) && age > Number(resource.age_max)) return false;

  const resourceMunicipality = normalizeText(resource.municipality);
  const beneficiaryText = normalizeText([
    beneficiary.municipality,
    beneficiary.city,
    beneficiary.address,
    beneficiary.address_full,
    beneficiary.postal_code,
    beneficiary.requested_help,
    beneficiary.situation
  ].filter(Boolean).join(' '));
  if (resourceMunicipality && beneficiaryText && !beneficiaryText.includes(resourceMunicipality)) return false;

  const resourceText = normalizeText([
    resource.name,
    resource.description,
    resource.requirements,
    resource.target_audience,
    resource.required_documents,
    resource.family_situation,
    resource.employment_situation,
    resource.housing_situation
  ].filter(Boolean).join(' '));
  const profileText = normalizeText([
    beneficiary.situation,
    beneficiary.family_situation,
    beneficiary.employment_situation,
    beneficiary.housing_situation,
    beneficiary.requested_help,
    beneficiary.notes
  ].filter(Boolean).join(' '));

  let positiveSignals = 0;
  if (resourceMunicipality && beneficiaryText.includes(resourceMunicipality)) positiveSignals += 1;
  if (hasAny(resourceText, ['menor', 'infancia', 'familia']) && Number(beneficiary.minors_count || beneficiary.children_count || 0) > 0) positiveSignals += 1;
  if (hasAny(resourceText, ['desemple', 'empleo', 'trabajo']) && hasAny(profileText, ['desemple', 'empleo', 'trabajo'])) positiveSignals += 1;
  if (hasAny(resourceText, ['vivienda', 'alquiler', 'hogar']) && hasAny(profileText, ['vivienda', 'alquiler', 'hogar'])) positiveSignals += 1;
  if (hasAny(resourceText, ['discapacidad', 'dependencia']) && hasAny(profileText, ['discapacidad', 'dependencia'])) positiveSignals += 1;
  if (resource.required_documents && documents.length) positiveSignals += 1;
  if (!resourceMunicipality && !resource.age_min && !resource.age_max) positiveSignals += 1;

  return positiveSignals > 0;
}

function hasAny(text = '', fragments = []) {
  return fragments.some((fragment) => text.includes(fragment));
}

function calculateAge(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
  return age;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00Z`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
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
