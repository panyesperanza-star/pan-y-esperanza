import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const MAIL_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Administrador'];

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[send-justificantes] Inicio', { requestId });

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = parseBody(request.body);
    const logoUrl = process.env.PUBLIC_LOGO_URL || body.logoUrl;
    const recipients = normalizeRecipients(body.to);
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const organization = body.organization || {};
    const isTest = Boolean(body.testMode);

    if (!apiKey || !from) {
      console.error('[send-justificantes] Servicio no configurado', { requestId, hasApiKey: Boolean(apiKey), hasFrom: Boolean(from) });
      return sendJson(response, 503, { ok: false, code: 'MAIL_NOT_CONFIGURED', error: 'Servicio de correo no configurado. Anada RESEND_API_KEY en el archivo .env.' });
    }

    const auth = await requireMailPermission(request, { supabaseUrl, serviceRoleKey, requestId });
    if (!auth.ok) {
      return sendJson(response, auth.status, { ok: false, code: auth.code, error: auth.error });
    }

    if (!recipients.length) {
      return sendJson(response, 400, { ok: false, code: 'NO_RECIPIENTS', error: 'Debes indicar al menos un destinatario.' });
    }

    const invalidAttachment = attachments.find((attachment) => !attachment?.filename || !attachment?.content);
    if (invalidAttachment) {
      console.error('[send-justificantes] Adjunto invalido', { requestId, invalidAttachment });
      return sendJson(response, 400, { ok: false, code: 'INVALID_ATTACHMENT', error: 'Uno de los adjuntos no es valido.' });
    }

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: body.subject || 'Justificantes de entrega - Pan y Esperanza',
      text: body.message || 'Adjuntamos los justificantes de entrega seleccionados.',
      html: buildHtml(body.message, logoUrl, organization),
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content
      }))
    });

    if (result.error) {
      const providerMessage = result.error.message || result.error.name || 'Error al enviar el correo.';
      console.error('[send-justificantes] Error Resend', { requestId, error: result.error });
      return sendJson(response, 502, { ok: false, code: 'MAIL_PROVIDER_ERROR', error: providerMessage });
    }

    console.info('[send-justificantes] Envio correcto', { requestId, id: result.data?.id });
    return sendJson(response, 200, { ok: true, id: result.data?.id, message: 'Correo enviado correctamente.' });
  } catch (error) {
    console.error('[send-justificantes] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'MAIL_SEND_FAILED', error: error.message || 'Error al enviar el correo.' });
  }
}

function sendJson(response, status, payload) {
  return response.status(status).send(JSON.stringify(payload));
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function buildHtml(message, logoUrl, organization = {}) {
  const name = organization.name || 'Pan y Esperanza';
  const date = new Date().toLocaleDateString('es-ES');
  const footer = [organization.cif, organization.address, organization.phone, organization.email].filter(Boolean).join(' - ');
  return `
    <div style="margin:0;padding:24px;background:#f7faf6;font-family:Arial,sans-serif;color:#17211b;line-height:1.5">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #dbe5dc;border-radius:8px;overflow:hidden">
        <div style="padding:24px;border-bottom:4px solid #247e50">
          ${logoUrl ? `<img src="${logoUrl}" alt="${escapeHtml(name)}" style="max-height:82px;width:auto;object-fit:contain;margin-bottom:16px" />` : ''}
          <h1 style="margin:0;color:#247e50;font-size:22px">${escapeHtml(name)}</h1>
          <p style="margin:6px 0 0;color:#607064;font-size:13px">${escapeHtml(date)}</p>
        </div>
        <div style="padding:24px">
          <p>${escapeHtml(message || 'Adjuntamos los justificantes de entrega seleccionados.')}</p>
          <p style="margin-top:24px;color:#247e50;font-weight:bold">${escapeHtml(name)}</p>
          ${footer ? `<p style="font-size:12px;color:#607064">${escapeHtml(footer)}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(/[,\s;]+/).map((item) => item.trim()).filter(Boolean);
}

async function requireMailPermission(request, { supabaseUrl, serviceRoleKey, requestId }) {
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-justificantes] Supabase admin no configurado', { requestId, hasSupabaseUrl: Boolean(supabaseUrl), hasServiceRoleKey: Boolean(serviceRoleKey) });
    return { ok: false, status: 503, code: 'SUPABASE_ADMIN_NOT_CONFIGURED', error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.' };
  }

  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sesion requerida para enviar correos.' };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    console.error('[send-justificantes] Token invalido', { requestId, error: authError?.message });
    return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesion no valida o caducada.' };
  }

  let { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('id,email,auth_user_id,role,is_active,status,permissions,permission_matrix')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (!profile && !profileError) {
    const byEmail = await admin
      .from('app_users')
      .select('id,email,auth_user_id,role,is_active,status,permissions,permission_matrix')
      .ilike('email', authData.user.email)
      .maybeSingle();
    profile = byEmail.data;
    profileError = byEmail.error;
  }

  if (profileError || !profile) {
    console.error('[send-justificantes] Perfil no encontrado', { requestId, error: profileError?.message, email: authData.user.email });
    return { ok: false, status: 403, code: 'PROFILE_NOT_FOUND', error: 'Usuario sin permisos para enviar correos.' };
  }

  const active = profile.is_active !== false && (profile.status || 'Activo') === 'Activo';
  const allowed = canSendMail(profile);
  if (!active || !allowed) {
    console.error('[send-justificantes] Permiso denegado', { requestId, profileId: profile.id, role: profile.role, active, allowed });
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'No tiene permisos para enviar correos.' };
  }

  return { ok: true, profile };
}

function getBearerToken(request) {
  const rawHeaderValue = request.headers.authorization || request.headers.Authorization || '';
  const rawHeader = Array.isArray(rawHeaderValue) ? rawHeaderValue[0] || '' : String(rawHeaderValue || '');
  const match = rawHeader.match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
  return match?.[1] || '';
}

function canSendMail(user) {
  if (MAIL_ROLES.includes(user.role)) return true;
  if (Array.isArray(user.permissions) && (user.permissions.includes('*') || user.permissions.includes('communications') || user.permissions.includes('receipts'))) return true;
  const matrix = user.permission_matrix || {};
  return Boolean(matrix.communications?.create || matrix.receipts?.create || matrix.settings?.edit);
}
