export const EMAIL_TEMPLATES = [
  {
    id: 'receipt',
    name: 'Justificante de ayuda recibida',
    subject: 'Justificante de ayuda recibida - Pan y Esperanza',
    message: 'Adjuntamos el justificante de la ayuda recibida. Gracias por confirmar la recepcion.'
  },
  {
    id: 'pickup',
    name: 'Aviso de recogida',
    subject: 'Aviso de recogida - Pan y Esperanza',
    message: 'Le informamos de que puede acudir a recoger la ayuda asignada en el horario indicado por la asociacion.'
  },
  {
    id: 'documentation',
    name: 'Solicitud de documentacion',
    subject: 'Solicitud de documentacion - Pan y Esperanza',
    message: 'Para completar su expediente necesitamos que aporte la documentacion pendiente indicada por el equipo social.'
  },
  {
    id: 'thanks',
    name: 'Agradecimiento',
    subject: 'Gracias - Pan y Esperanza',
    message: 'Gracias por su colaboracion y confianza. Seguimos trabajando para acompanarle de forma cercana y responsable.'
  }
];

export async function sendEmailViaApi({ to, subject, message, attachments = [], organization = {}, testMode = false }) {
  console.info('[comunicaciones] Enviando request a /api/send-justificantes', {
    recipients: to,
    subject,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      size: attachment.content?.length || 0
    })),
    testMode
  });

  const response = await fetch('/api/send-justificantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, message, attachments, organization, testMode })
  });
  const payload = await parseJsonResponse(response);
  console.info('[comunicaciones] Respuesta recibida', { status: response.status, payload });

  if (!response.ok) {
    if (payload.code === 'MAIL_NOT_CONFIGURED') {
      throw new Error(payload.error || 'Servicio de correo no configurado. Anada RESEND_API_KEY en el archivo .env.');
    }
    throw new Error(payload.error || 'Error al enviar el correo.');
  }
  return payload;
}

export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    console.warn('[comunicaciones] Respuesta vacia del servidor', { status: response.status });
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('[comunicaciones] Respuesta no JSON del servidor', { status: response.status, text: text.slice(0, 500), error });
    return { error: 'Respuesta no valida del servidor.' };
  }
}

export function normalizeEmailError(error) {
  const message = error?.message || '';
  if (message.startsWith('Servicio de correo no configurado.')) return message;
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return 'Error de red al enviar el correo.';
  return message || 'Error al enviar el correo.';
}

export async function saveEmailLog(actions, currentUser, email, count, result, attachments = []) {
  await actions.createEmailLog({
    sent_at: new Date().toISOString(),
    recipient: email.recipients || email.to || '',
    sent_by: `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || 'Usuario',
    receipts_count: count,
    result,
    subject: email.subject,
    message: email.message,
    attachments
  });
}
