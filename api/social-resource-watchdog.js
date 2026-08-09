const EDGE_FUNCTION_NAME = 'social-resource-watchdog';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const cronSecret = clean(process.env.CRON_SECRET || process.env.SOCIAL_RESOURCE_WATCHDOG_SECRET || '');
  const incomingToken = getBearerToken(request.headers.authorization || '');
  if (cronSecret && incomingToken !== cronSecret) {
    return response.status(401).json({ ok: false, code: 'CRON_UNAUTHORIZED', error: 'Cron no autorizado.' });
  }

  if (!cronSecret && !request.headers['x-vercel-cron']) {
    return response.status(503).json({
      ok: false,
      code: 'CRON_SECRET_REQUIRED',
      error: 'Configure CRON_SECRET en Vercel para ejecutar la vigilancia diaria.'
    });
  }

  const supabaseUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const watchdogToken = clean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SOCIAL_RESOURCE_WATCHDOG_SECRET || process.env.CRON_SECRET || '');
  if (!supabaseUrl || !watchdogToken) {
    return response.status(503).json({
      ok: false,
      code: 'WATCHDOG_NOT_CONFIGURED',
      error: 'Faltan SUPABASE_URL y un token servidor para invocar la vigilancia.'
    });
  }

  const edgeResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${EDGE_FUNCTION_NAME}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${watchdogToken}`
    },
    body: JSON.stringify({ mode: 'due', trigger: 'vercel-cron' })
  });
  const payload = await readJson(edgeResponse);
  return response.status(edgeResponse.status).json(payload);
}

function getBearerToken(value) {
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1] || '');
}

function clean(value) {
  return String(value || '').trim();
}

async function readJson(edgeResponse) {
  const text = await edgeResponse.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, code: 'INVALID_EDGE_RESPONSE', error: 'Respuesta no valida de la vigilancia.' };
  }
}
