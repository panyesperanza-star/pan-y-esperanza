import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[request-password-reset] Inicio', { requestId });

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const body = parseBody(request.body);
    const email = String(body.email || '').trim().toLowerCase();

    if (!url || !serviceRoleKey) {
      return sendJson(response, 503, { ok: false, code: 'SUPABASE_ADMIN_NOT_CONFIGURED', error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
    }
    if (!resendKey || !from) {
      return sendJson(response, 503, { ok: false, code: 'MAIL_NOT_CONFIGURED', error: 'Servicio de correo no configurado. Anada RESEND_API_KEY y FROM_EMAIL en Vercel.' });
    }
    if (!email) {
      return sendJson(response, 400, { ok: false, code: 'EMAIL_REQUIRED', error: 'Indique el email del usuario.' });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: profile, error: profileError } = await admin
      .from('app_users')
      .select('id,auth_user_id,email,first_name,last_name,is_active,status')
      .eq('email', email)
      .single();

    if (profileError || !profile || profile.is_active === false || (profile.status || 'Activo') !== 'Activo') {
      console.warn('[request-password-reset] Usuario no disponible', { requestId, email });
      return sendJson(response, 200, { ok: true, message: 'Si el email existe y esta activo, recibira instrucciones para recuperar la contrasena.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const origin = getOrigin(request, body.origin);
    const resetUrl = `${origin}/?reset_token=${encodeURIComponent(token)}`;

    const { error: insertError } = await admin.from('password_reset_tokens').insert({
      user_id: profile.id,
      auth_user_id: profile.auth_user_id,
      email: profile.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date().toISOString()
    });
    if (insertError) throw insertError;

    const resend = new Resend(resendKey);
    const logoUrl = process.env.PUBLIC_LOGO_URL || body.logoUrl;
    const result = await resend.emails.send({
      from,
      to: profile.email,
      subject: 'Recuperacion de contrasena - Pan y Esperanza',
      text: `Hola ${profile.first_name || ''}. Para establecer una nueva contrasena accede a: ${resetUrl}`,
      html: buildHtml(profile, resetUrl, logoUrl)
    });

    if (result.error) {
      console.error('[request-password-reset] Error Resend', { requestId, error: result.error });
      return sendJson(response, 502, { ok: false, code: 'MAIL_PROVIDER_ERROR', error: result.error.message || 'No se pudo enviar el correo de recuperacion.' });
    }

    await admin.from('audit_logs').insert({
      user_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
      user_email: profile.email,
      action: 'Solicito recuperacion de contrasena',
      happened_at: new Date().toISOString()
    });

    console.info('[request-password-reset] Correo enviado', { requestId, email });
    return sendJson(response, 200, { ok: true, message: 'Si el email existe y esta activo, recibira instrucciones para recuperar la contrasena.' });
  } catch (error) {
    console.error('[request-password-reset] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'PASSWORD_RESET_REQUEST_FAILED', error: error.message || 'No se pudo solicitar la recuperacion de contrasena.' });
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

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getOrigin(request, origin) {
  if (origin) return String(origin).replace(/\/$/, '');
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  const proto = request.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function buildHtml(profile, resetUrl, logoUrl) {
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email;
  return `
    <div style="margin:0;padding:24px;background:#f7faf6;font-family:Arial,sans-serif;color:#17211b">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #dbe5dc;border-radius:8px;overflow:hidden">
        <div style="padding:24px;border-bottom:4px solid #247e50">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Pan y Esperanza" style="max-height:82px;width:auto;object-fit:contain;margin-bottom:16px" />` : ''}
          <h1 style="margin:0;color:#247e50;font-size:22px">Pan y Esperanza</h1>
        </div>
        <div style="padding:24px">
          <p>Hola ${escapeHtml(name)},</p>
          <p>Hemos recibido una solicitud para restablecer tu contrasena.</p>
          <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#247e50;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold">Establecer nueva contrasena</a></p>
          <p style="color:#607064;font-size:13px">Este enlace caduca en 1 hora. Si no has solicitado este cambio, puedes ignorar este correo.</p>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
