export async function callPortalApi(operation, payload = {}) {
  const response = await fetch('/api/send-portal-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...payload })
  });
  const data = await parseJson(response);
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || 'No se pudo completar la operacion del portal.');
    error.code = data.code || 'PORTAL_API_FAILED';
    error.status = response.status;
    throw error;
  }
  return data;
}

export function normalizePortalOtpError(error) {
  if (error?.code === 'MAIL_NOT_CONFIGURED') return 'Servicio de correo no configurado.';
  if (error?.code === 'SUPABASE_ADMIN_NOT_CONFIGURED') return 'Supabase no esta configurado para el portal.';
  if (error?.message) return error.message;
  return 'No se pudo completar la operacion del portal.';
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}
