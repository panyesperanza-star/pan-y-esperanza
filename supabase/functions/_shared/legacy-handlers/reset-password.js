import crypto from 'node:crypto';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[reset-password] Inicio', { requestId });

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = parseBody(request.body);
    const token = String(body.token || '').trim();
    const password = String(body.password || '').trim();
    const validateOnly = body.validateOnly === true;

    if (!url || !serviceRoleKey) {
      return sendJson(response, 503, { ok: false, code: 'SUPABASE_ADMIN_NOT_CONFIGURED', error: 'Servicio de usuarios no configurado. Añada SUPABASE_SERVICE_ROLE_KEY en Supabase Edge Functions.' });
    }
    if (!token || (!validateOnly && password.length < 8)) {
      return sendJson(response, 400, { ok: false, code: 'INVALID_RESET', error: 'El enlace no es válido o la contraseña tiene menos de 8 caracteres.' });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data: resetToken, error: tokenError } = await admin
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (tokenError || !resetToken) {
      return sendJson(response, 400, { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN', error: 'El enlace de recuperación no es válido o ha caducado.' });
    }

    if (!resetToken.auth_user_id) {
      return sendJson(response, 400, { ok: false, code: 'NO_AUTH_USER', error: 'El usuario no está vinculado a Supabase Auth.' });
    }

    if (validateOnly) {
      return sendJson(response, 200, { ok: true, message: 'Enlace validado correctamente.' });
    }

    const { error: authError } = await admin.auth.admin.updateUserById(resetToken.auth_user_id, { password });
    if (authError) throw authError;

    await admin.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('id', resetToken.id);
    await admin.from('audit_logs').insert({
      user_name: resetToken.email,
      user_email: resetToken.email,
      action: 'Restableció su contraseña',
      happened_at: new Date().toISOString()
    });

    console.info('[reset-password] Contraseña actualizada', { requestId, email: resetToken.email });
    return sendJson(response, 200, { ok: true, message: 'Contraseña actualizada correctamente. Ya puede iniciar sesión.' });
  } catch (error) {
    console.error('[reset-password] Excepción', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'PASSWORD_RESET_FAILED', error: error.message || 'No se pudo actualizar la contraseña.' });
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
