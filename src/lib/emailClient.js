import { getApiHeaders } from './apiAuth';
import { hasSupabaseConfig, supabase, supabaseStorageBucket } from './supabase';

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

export async function sendEmailViaApi({ to, subject, message, attachments = [], receiptEntries = [], includeSummary = false, organization = {}, testMode = false, logEmail = false }) {
  const useServerPdfGeneration = Array.isArray(receiptEntries) && receiptEntries.length > 0;
  const useMultipart = !useServerPdfGeneration && attachments.some((attachment) => attachment?.blob instanceof Blob);
  const headers = await getApiHeaders();
  const cleanOrganization = sanitizeOrganizationForTransport(organization);
  const cleanReceiptEntries = useServerPdfGeneration ? sanitizeReceiptEntriesForTransport(receiptEntries) : [];
  const requestBody = useMultipart
    ? buildEmailFormData({ to, subject, message, attachments, organization: cleanOrganization, testMode, logEmail })
    : JSON.stringify({
      to,
      subject,
      message,
      attachments: useServerPdfGeneration ? [] : attachments,
      receiptEntries: cleanReceiptEntries,
      includeSummary,
      organization: cleanOrganization,
      testMode,
      logEmail
    });
  const outgoingPayload = useMultipart ? requestBody : JSON.parse(requestBody);

  if (useMultipart) delete headers['Content-Type'];

  const payloadSize = estimatePayloadSize({
    to,
    subject,
    message,
    attachments: useServerPdfGeneration ? [] : attachments,
    receiptEntries: cleanReceiptEntries,
    includeSummary,
    organization: cleanOrganization,
    testMode,
    logEmail,
    useMultipart
  });
  console.info('[correo] Inicio flujo POST /api/send-justificantes');
  console.info('[correo] Diagnostico payload /api/send-justificantes', {
    contentType: useMultipart ? 'multipart/form-data; boundary=generado-por-navegador' : headers['Content-Type'] || 'application/json',
    contentLengthEstimado: payloadSize.estimatedTotalBytes,
    numeroJustificantes: payloadSize.receiptEntriesCount,
    numeroPdfs: payloadSize.expectedPdfCount,
    tamanoTotalPdfs: payloadSize.attachmentsBytes,
    tamanoFormDataEstimado: payloadSize.estimatedTotalBytes,
    pdfs: payloadSize.attachmentSizes,
    firmasBytes: payloadSize.signatureBytes,
    receiptEntriesBytes: payloadSize.receiptEntriesBytes,
    modoGeneracionPdf: useServerPdfGeneration ? 'servidor' : 'navegador',
    metadataBytes: payloadSize.metadataBytes,
    headers: Object.keys(headers)
  });
  console.info('[correo] Estructura del payload', buildOutgoingPayloadDiagnostics(outgoingPayload, requestBody, payloadSize, useMultipart));

  if (payloadSize.estimatedTotalBytes > SAFE_VERCEL_PAYLOAD_LIMIT_BYTES) {
    throw new Error(`Los justificantes ocupan ${formatBytes(payloadSize.estimatedTotalBytes)} y superan el limite seguro de envio (${formatBytes(SAFE_VERCEL_PAYLOAD_LIMIT_BYTES)}). Selecciona menos justificantes o envia sin resumen PDF.`);
  }

  const response = await fetch('/api/send-justificantes', {
    method: 'POST',
    headers,
    body: requestBody
  });
  const responsePayload = await parseJsonResponse(response);
  console.info('[correo] Respuesta recibida de /api/send-justificantes', {
    status: response.status,
    ok: response.ok,
    payload: responsePayload
  });

  if (!response.ok) {
    if (responsePayload.code === 'MAIL_NOT_CONFIGURED') {
      throw createEmailApiError(responsePayload.error || 'Servicio de correo no configurado. Anada RESEND_API_KEY en el archivo .env.', responsePayload, response.status);
    }
    throw createEmailApiError(responsePayload.error || 'Error al enviar el correo.', responsePayload, response.status);
  }
  if (!responsePayload.ok || !responsePayload.id) {
    throw createEmailApiError(responsePayload.error || 'Resend no confirmo el envio del correo.', responsePayload, response.status);
  }
  if (logEmail && (!responsePayload.logged || !responsePayload.emailLog?.id)) {
    throw createEmailApiError('El correo fue aceptado por Resend, pero no se pudo registrar correctamente en el historial.', responsePayload, response.status);
  }
  return responsePayload;
}

function createEmailApiError(message, payload = {}, status = 0) {
  const error = new Error(message);
  error.code = payload.code || 'MAIL_SEND_FAILED';
  error.status = status;
  error.payload = payload;
  return error;
}

export function buildEmailFormData({ to, subject, message, attachments = [], organization = {}, testMode = false, logEmail = false }) {
  const formData = new FormData();
  formData.append('to', normalizeToField(to));
  formData.append('subject', subject || '');
  formData.append('message', message || '');
  formData.append('organization', JSON.stringify(organization || {}));
  formData.append('testMode', testMode ? 'true' : 'false');
  formData.append('logEmail', logEmail ? 'true' : 'false');
  attachments.forEach((attachment, index) => {
    if (attachment?.blob instanceof Blob) {
      formData.append('files', attachment.blob, attachment.filename || `adjunto-${index + 1}.pdf`);
    }
  });
  return formData;
}

export function estimatePayloadSize({ to, subject, message, attachments = [], receiptEntries = [], includeSummary = false, organization = {}, testMode = false, logEmail = false, useMultipart = false }) {
  const attachmentSizes = attachments.map((attachment) => ({
    filename: attachment.filename,
    sizeBytes: attachment.blob?.size || attachment.size || attachment.content?.length || 0,
    transport: attachment.blob instanceof Blob ? 'multipart-blob' : attachment.content ? 'json-base64' : 'metadata'
  }));
  const signatureBytes = receiptEntries.reduce((total, entry) => total
    + byteLength(entry.delivery?.signature_data_url)
    + byteLength(entry.delivery?.responsible_signature_data_url), 0);
  const receiptEntriesBytes = new Blob([JSON.stringify(receiptEntries)]).size;
  const metadataBytes = new Blob([JSON.stringify({ to, subject, message, organization, testMode, includeSummary, logEmail })]).size;
  const multipartOverheadBytes = useMultipart ? Math.max(1024, attachments.length * 512 + 2048) : 0;
  return {
    transport: useMultipart ? 'multipart/form-data' : 'application/json',
    metadataBytes,
    receiptEntriesCount: receiptEntries.length,
    receiptEntriesBytes,
    signatureBytes,
    expectedPdfCount: attachments.length || (receiptEntries.length + (includeSummary ? 1 : 0)),
    attachmentsCount: attachments.length,
    attachmentsBytes: attachmentSizes.reduce((total, item) => total + item.sizeBytes, 0),
    multipartOverheadBytes,
    estimatedTotalBytes: metadataBytes + receiptEntriesBytes + attachmentSizes.reduce((total, item) => total + item.sizeBytes, 0) + multipartOverheadBytes,
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

export async function saveEmailLog(actions, currentUser, email, count, result, attachments = [], providerId = '', status = 'Enviado', receiptIds = []) {
  await actions.createEmailLog({
    sent_at: new Date().toISOString(),
    recipient: email.recipients || email.to || '',
    sent_by: `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || currentUser?.email || 'Usuario',
    receipts_count: count,
    result,
    subject: email.subject,
    message: email.message,
    attachments: sanitizeAttachmentsForLog(attachments),
    provider_id: providerId || null,
    status,
    receipt_ids: receiptIds
  });
}

export function sanitizeAttachmentsForLog(attachments = []) {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    size: attachment.blob?.size || attachment.size || attachment.content?.length || 0,
    contentType: attachment.contentType || 'application/pdf',
    storagePath: attachment.storagePath || attachment.storage_path || null,
    deliveryId: attachment.deliveryId || attachment.delivery_id || null,
    isSummary: Boolean(attachment.isSummary || attachment.is_summary)
  }));
}

export async function openStoredEmailAttachment(attachment) {
  const storagePath = attachment?.storagePath || attachment?.storage_path;
  if (!storagePath) throw new Error('El PDF original no esta disponible en el almacenamiento.');
  if (!hasSupabaseConfig || !supabase) throw new Error('Almacenamiento de Supabase no configurado.');
  const { data, error } = await supabase.storage.from(supabaseStorageBucket).createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'No se pudo abrir el PDF almacenado.');
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  return data.signedUrl;
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

function buildOutgoingPayloadDiagnostics(payload, requestBody, payloadSize, useMultipart) {
  if (useMultipart) {
    const formEntries = [];
    payload.forEach((value, key) => {
      formEntries.push({
        key,
        type: value instanceof Blob ? 'Blob' : typeof value,
        length: value instanceof Blob ? value.size : String(value || '').length,
        fileName: typeof File !== 'undefined' && value instanceof File ? value.name : undefined
      });
    });
    return {
      mode: 'multipart/form-data',
      jsonFinalBytes: null,
      formDataEntries: formEntries,
      keys: formEntries.map((entry) => entry.key),
      payloadSize
    };
  }

  const receiptEntries = Array.isArray(payload.receiptEntries) ? payload.receiptEntries : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const fieldLengths = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, getValueLength(value)])
  );
  const receiptEntryLengths = receiptEntries.map((entry, index) => ({
    index,
    totalBytes: byteLength(JSON.stringify(entry)),
    beneficiaryBytes: byteLength(JSON.stringify(entry.beneficiary || {})),
    deliveryBytes: byteLength(JSON.stringify(entry.delivery || {})),
    signatureLength: String(entry.delivery?.signature_data_url || '').length,
    signatureBytes: byteLength(entry.delivery?.signature_data_url),
    responsibleSignatureLength: String(entry.delivery?.responsible_signature_data_url || '').length,
    responsibleSignatureBytes: byteLength(entry.delivery?.responsible_signature_data_url)
  }));
  const attachmentLengths = attachments.map((attachment, index) => ({
    index,
    filename: attachment?.filename,
    keys: Object.keys(attachment || {}),
    contentLength: String(attachment?.content || '').length,
    blobSize: attachment?.blob?.size || 0,
    size: attachment?.size || 0
  }));

  return {
    mode: 'application/json',
    jsonFinalBytes: byteLength(requestBody),
    jsonFinalCharacters: String(requestBody || '').length,
    keys: Object.keys(payload),
    fieldLengths,
    receiptEntriesLength: receiptEntries.length,
    receiptEntriesJsonBytes: byteLength(JSON.stringify(receiptEntries)),
    receiptEntryLengths,
    attachmentsLength: attachments.length,
    attachmentLengths,
    payloadSize
  };
}

function getValueLength(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return byteLength(JSON.stringify(value));
  return String(value || '').length;
}

function sanitizeReceiptEntriesForTransport(entries = []) {
  return entries.map((entry) => ({
    beneficiary: {
      full_name: entry.beneficiary?.full_name || entry.delivery?.beneficiary_name || '',
      code: entry.beneficiary?.code || '',
      document_id: entry.beneficiary?.document_id || '',
      email: entry.beneficiary?.email || ''
    },
    delivery: {
      id: entry.delivery?.id,
      receipt_number: entry.delivery?.receipt_number,
      delivered_at: entry.delivery?.delivered_at,
      reception_at: entry.delivery?.reception_at,
      beneficiary_name: entry.delivery?.beneficiary_name,
      responsible: entry.delivery?.responsible,
      help_type: entry.delivery?.help_type,
      inventory_item_name: entry.delivery?.inventory_item_name,
      product: entry.delivery?.product,
      quantity: entry.delivery?.quantity,
      items: Array.isArray(entry.delivery?.items) ? entry.delivery.items.map((item) => ({
        name: item.name || item.inventory_item_name || item.product || '',
        quantity: item.quantity
      })) : [],
      notes: entry.delivery?.notes,
      signature_data_url: entry.delivery?.signature_data_url || '',
      responsible_signature_data_url: entry.delivery?.responsible_signature_data_url || ''
    }
  }));
}

function byteLength(value) {
  return new Blob([String(value || '')]).size;
}
