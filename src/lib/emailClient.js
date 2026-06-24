import { getApiHeaders } from './apiAuth';

const SAFE_VERCEL_PAYLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

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
  const useMultipart = attachments.some((attachment) => attachment?.blob instanceof Blob);
  const headers = await getApiHeaders();
  const cleanOrganization = sanitizeOrganizationForTransport(organization);
  const requestBody = useMultipart
    ? buildEmailFormData({ to, subject, message, attachments, organization: cleanOrganization, testMode })
    : JSON.stringify({ to, subject, message, attachments, organization: cleanOrganization, testMode });

  if (useMultipart) delete headers['Content-Type'];

  const payloadSize = estimatePayloadSize({ to, subject, message, attachments, organization: cleanOrganization, testMode, useMultipart });
  console.info('[correo] Inicio flujo POST /api/send-justificantes');
  console.info('[correo] Diagnostico payload /api/send-justificantes', {
    contentType: useMultipart ? 'multipart/form-data; boundary=generado-por-navegador' : headers['Content-Type'] || 'application/json',
    contentLengthEstimado: payloadSize.estimatedTotalBytes,
    numeroPdfs: payloadSize.attachmentsCount,
    tamanoTotalPdfs: payloadSize.attachmentsBytes,
    tamanoFormDataEstimado: payloadSize.estimatedTotalBytes,
    pdfs: payloadSize.attachmentSizes,
    metadataBytes: payloadSize.metadataBytes,
    headers: Object.keys(headers)
  });

  if (payloadSize.estimatedTotalBytes > SAFE_VERCEL_PAYLOAD_LIMIT_BYTES) {
    throw new Error(`Los justificantes ocupan ${formatBytes(payloadSize.estimatedTotalBytes)} y superan el limite seguro de envio (${formatBytes(SAFE_VERCEL_PAYLOAD_LIMIT_BYTES)}). Selecciona menos justificantes o envia sin resumen PDF.`);
  }

  const response = await fetch('/api/send-justificantes', {
    method: 'POST',
    headers,
    body: requestBody
  });
  const payload = await parseJsonResponse(response);
  console.info('[correo] Respuesta recibida de /api/send-justificantes', {
    status: response.status,
    ok: response.ok,
    payload
  });

  if (!response.ok) {
    if (payload.code === 'MAIL_NOT_CONFIGURED') {
      throw new Error(payload.error || 'Servicio de correo no configurado. Anada RESEND_API_KEY en el archivo .env.');
    }
    throw new Error(payload.error || 'Error al enviar el correo.');
  }
  if (!payload.ok || !payload.id) {
    throw new Error(payload.error || 'Resend no confirmo el envio del correo.');
  }
  return payload;
}

export function buildEmailFormData({ to, subject, message, attachments = [], organization = {}, testMode = false }) {
  const formData = new FormData();
  formData.append('to', normalizeToField(to));
  formData.append('subject', subject || '');
  formData.append('message', message || '');
  formData.append('organization', JSON.stringify(organization || {}));
  formData.append('testMode', testMode ? 'true' : 'false');
  attachments.forEach((attachment, index) => {
    if (attachment?.blob instanceof Blob) {
      formData.append('files', attachment.blob, attachment.filename || `adjunto-${index + 1}.pdf`);
    }
  });
  return formData;
}

export function estimatePayloadSize({ to, subject, message, attachments = [], organization = {}, testMode = false, useMultipart = false }) {
  const attachmentSizes = attachments.map((attachment) => ({
    filename: attachment.filename,
    sizeBytes: attachment.blob?.size || attachment.size || attachment.content?.length || 0,
    transport: attachment.blob instanceof Blob ? 'multipart-blob' : attachment.content ? 'json-base64' : 'metadata'
  }));
  const metadataBytes = new Blob([JSON.stringify({ to, subject, message, organization, testMode })]).size;
  const multipartOverheadBytes = useMultipart ? Math.max(1024, attachments.length * 512 + 2048) : 0;
  return {
    transport: useMultipart ? 'multipart/form-data' : 'application/json',
    metadataBytes,
    attachmentsCount: attachments.length,
    attachmentsBytes: attachmentSizes.reduce((total, item) => total + item.sizeBytes, 0),
    multipartOverheadBytes,
    estimatedTotalBytes: metadataBytes + attachmentSizes.reduce((total, item) => total + item.sizeBytes, 0) + multipartOverheadBytes,
    attachmentSizes
  };
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
    attachments: sanitizeAttachmentsForLog(attachments)
  });
}

export function sanitizeAttachmentsForLog(attachments = []) {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    size: attachment.blob?.size || attachment.size || attachment.content?.length || 0,
    contentType: attachment.contentType || 'application/pdf'
  }));
}

function normalizeToField(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}

function sanitizeOrganizationForTransport(organization = {}) {
  const {
    name,
    cif,
    address,
    phone,
    email,
    web,
    website
  } = organization || {};
  return {
    name,
    cif,
    address,
    phone,
    email,
    web,
    website
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
