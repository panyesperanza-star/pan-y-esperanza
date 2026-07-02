import { createClient } from '@supabase/supabase-js';
import { getServerConfig, requireAdmin } from './_adminAuth.js';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'GET') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[operations-summary] Inicio', { requestId });

  try {
    const { url, serviceRoleKey, diagnostics: serverDiagnostics } = getServerConfig();
    if (!url || !serviceRoleKey) {
      console.error('[operations-summary] Servicio no configurado', { requestId, ...serverDiagnostics });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.',
        details: serverDiagnostics
      });
    }

    if (serverDiagnostics.serviceRoleKeyHasNonAscii || !serverDiagnostics.serviceRoleKeyLooksJwt) {
      console.error('[operations-summary] SUPABASE_SERVICE_ROLE_KEY invalida', { requestId, ...serverDiagnostics });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_SERVICE_ROLE_INVALID',
        error: 'SUPABASE_SERVICE_ROLE_KEY no tiene formato valido. Revise la variable en Vercel.',
        details: serverDiagnostics
      });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const requester = await requireAdmin(request, admin, requestId, '[operations-summary]');
    if (!requester.ok) {
      return sendJson(response, requester.status, {
        ok: false,
        code: requester.code,
        error: requester.error,
        step: requester.step,
        details: requester.details
      });
    }

    const { count, error } = await admin
      .from('password_reset_tokens')
      .select('id', { count: 'exact', head: true })
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString());

    if (error) throw error;

    return sendJson(response, 200, {
      ok: true,
      pendingPasswordResets: count || 0
    });
  } catch (error) {
    console.error('[operations-summary] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, {
      ok: false,
      code: 'OPERATIONS_SUMMARY_FAILED',
      error: error.message || 'No se pudo cargar el resumen de operaciones.'
    });
  }
}

function sendJson(response, status, payload) {
  return response.status(status).send(JSON.stringify(payload));
}
