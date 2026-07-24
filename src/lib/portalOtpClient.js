import { callEdgeJson } from './edgeFunctions';

export async function callPortalApi(operation, payload = {}) {
  const data = await callEdgeJson('send-portal-otp', { operation, ...payload });
  if (!data.ok) {
    const error = new Error(data.error || 'No se pudo completar la operación del portal.');
    error.code = data.code || 'PORTAL_API_FAILED';
    throw error;
  }
  return data;
}

export function normalizePortalOtpError(error) {
  if (error?.code === 'MAIL_NOT_CONFIGURED') return 'Servicio de correo no configurado.';
  if (error?.code === 'SUPABASE_ADMIN_NOT_CONFIGURED') return 'Supabase no esta configurado para el portal.';
  if (error?.message) return error.message;
  return 'No se pudo completar la operación del portal.';
}
