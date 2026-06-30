import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import autoTableModule from 'jspdf-autotable';

const MAIL_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Tesorera', 'Coordinadora', 'Administrador'];
const autoTable = typeof autoTableModule === 'function' ? autoTableModule : autoTableModule.default;
const MAX_RESEND_ATTACHMENTS_BYTES = 35 * 1024 * 1024;

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let responseAttachments = [];
  console.info('[send-justificantes] Inicio', {
    requestId,
    method: request.method,
    contentType: getHeader(request, 'content-type'),
    contentLength: Number(getHeader(request, 'content-length') || 0)
  });

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || 'documentos';
    const { body, transport, rawSizeBytes } = await parseRequest(request);
    const logoUrl = process.env.PUBLIC_LOGO_URL || body.logoUrl;
    const recipients = normalizeRecipients(body.to);
    let attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const organization = body.organization || {};
    const isTest = Boolean(body.testMode);
    const shouldLogEmail = Boolean(body.logEmail) && !isTest;
    const receiptEntries = Array.isArray(body.receiptEntries) ? body.receiptEntries : [];

    if (!apiKey || !from) {
      console.error('[send-justificantes] Servicio no configurado', { requestId, hasApiKey: Boolean(apiKey), hasFrom: Boolean(from) });
      return sendJson(response, 503, { ok: false, code: 'MAIL_NOT_CONFIGURED', error: 'Servicio de correo no configurado. Anada RESEND_API_KEY en el archivo .env.' });
    }

    const auth = await requireMailPermission(request, { supabaseUrl, serviceRoleKey, requestId });
    if (!auth.ok) {
      return sendJson(response, auth.status, { ok: false, code: auth.code, error: auth.error });
    }

    assertPdfRuntime();

    if (attachments.length) {
      attachments = await loadStoredAttachments(auth.admin, storageBucket, attachments, requestId);
    }

    if (!attachments.length && receiptEntries.length) {
      console.info('[send-justificantes] Generando PDFs en servidor', {
        requestId,
        receiptEntriesCount: receiptEntries.length,
        includeSummary: Boolean(body.includeSummary),
        signatureBytes: receiptEntries.reduce((total, entry) => total
          + Buffer.byteLength(String(entry?.delivery?.signature_data_url || ''))
          + Buffer.byteLength(String(entry?.delivery?.responsible_signature_data_url || '')), 0)
      });
      attachments = await createServerReceiptAttachments(receiptEntries, {
        includeSummary: Boolean(body.includeSummary),
        organization,
        logoUrl
      });
      attachments = await persistGeneratedAttachments(auth.admin, storageBucket, attachments, requestId);
    }

    const attachmentStats = attachments.map((attachment) => ({
      filename: attachment.filename,
      contentBytes: getAttachmentBytes(attachment),
      hasBuffer: Buffer.isBuffer(attachment.content),
      hasStringContent: typeof attachment.content === 'string'
    }));
    console.info('[send-justificantes] Payload recibido', {
      requestId,
      transport,
      rawSizeBytes,
      recipientsCount: recipients.length,
      receiptEntriesCount: receiptEntries.length,
      attachmentsCount: attachments.length,
      attachmentsBytes: attachmentStats.reduce((total, item) => total + item.contentBytes, 0),
      attachmentStats
    });

    if (!recipients.length) {
      return sendJson(response, 400, { ok: false, code: 'NO_RECIPIENTS', error: 'Debes indicar al menos un destinatario.' });
    }

    if (shouldLogEmail && !attachments.length) {
      return sendJson(response, 400, {
        ok: false,
        code: 'NO_RECEIPTS',
        error: 'No se ha podido generar o recuperar ningun justificante PDF.'
      });
    }

    const invalidAttachment = attachments.find((attachment) => !attachment?.filename || !attachment?.content);
    if (invalidAttachment) {
      console.error('[send-justificantes] Adjunto invalido', { requestId, invalidAttachment: summarizeAttachment(invalidAttachment) });
      return sendJson(response, 400, { ok: false, code: 'INVALID_ATTACHMENT', error: 'Uno de los adjuntos no es valido.' });
    }

    const attachmentValidation = attachments.map(validatePdfAttachment);
    const invalidPdf = attachmentValidation.find((item) => !item.ok);
    if (invalidPdf) {
      console.error('[send-justificantes] PDF invalido antes de Resend', { requestId, invalidPdf, attachmentValidation });
      return sendJson(response, 400, {
        ok: false,
        code: 'INVALID_PDF_ATTACHMENT',
        error: `El adjunto ${invalidPdf.filename || 'sin nombre'} no es un PDF valido: ${invalidPdf.reason}.`
      });
    }

    const totalAttachmentBytes = attachmentValidation.reduce((total, item) => total + item.bytes, 0);
    if (totalAttachmentBytes > MAX_RESEND_ATTACHMENTS_BYTES) {
      return sendJson(response, 413, {
        ok: false,
        code: 'ATTACHMENTS_TOO_LARGE',
        error: 'Los PDF seleccionados superan el limite de 35 MB. Envie menos justificantes en cada correo.'
      });
    }

    const resendAttachments = attachments.map((attachment) => ({
      filename: attachment.filename,
      content: normalizeAttachmentContent(attachment.content),
      contentType: attachment.contentType || 'application/pdf'
    }));
    responseAttachments = attachments.map((attachment) => ({
      filename: attachment.filename,
      size: getAttachmentBytes(attachment),
      contentType: attachment.contentType || 'application/pdf',
      storagePath: attachment.storagePath || null,
      deliveryId: attachment.deliveryId || null,
      isSummary: Boolean(attachment.isSummary)
    }));

    console.info('[send-justificantes] Llamando a Resend', {
      requestId,
      from,
      recipients,
      subject: body.subject || 'Justificantes de entrega - Pan y Esperanza',
      attachmentsCount: resendAttachments.length,
      attachmentValidation
    });

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: body.subject || 'Justificantes de entrega - Pan y Esperanza',
      text: body.message || 'Adjuntamos los justificantes de entrega seleccionados.',
      html: buildHtml(body.message, logoUrl, organization),
      attachments: resendAttachments
    });

    console.info('[send-justificantes] Respuesta Resend', {
      requestId,
      data: result.data || null,
      error: result.error || null,
      hasProviderId: Boolean(result.data?.id)
    });

    if (result.error) {
      const providerMessage = result.error.message || result.error.name || 'Error al enviar el correo.';
      console.error('[send-justificantes] Error Resend', { requestId, error: result.error });
      if (shouldLogEmail) {
        await recordEmailLog(auth.admin, {
          body,
          auth,
          recipients,
          attachments: responseAttachments,
          providerId: null,
          status: 'Error',
          result: providerMessage,
          receiptEntries,
          requestId
        });
      }
      return sendJson(response, 502, { ok: false, code: 'MAIL_PROVIDER_ERROR', error: providerMessage, attachments: responseAttachments });
    }

    if (!result.data?.id) {
      console.error('[send-justificantes] Resend no devolvio identificador de envio', { requestId, result });
      if (shouldLogEmail) {
        await recordEmailLog(auth.admin, {
          body,
          auth,
          recipients,
          attachments: responseAttachments,
          providerId: null,
          status: 'Error',
          result: 'Resend no confirmo el envio del correo.',
          receiptEntries,
          requestId
        });
      }
      return sendJson(response, 502, {
        ok: false,
        code: 'MAIL_PROVIDER_NO_ID',
        error: 'Resend no confirmo el envio del correo.',
        attachments: responseAttachments
      });
    }

    let emailLog = null;
    if (shouldLogEmail) {
      emailLog = await recordEmailLog(auth.admin, {
        body,
        auth,
        recipients,
        attachments: responseAttachments,
        providerId: result.data.id,
        status: 'Enviado',
        result: 'Correo enviado correctamente.',
        receiptEntries,
        requestId
      });
      if (!emailLog?.id) {
        console.error('[send-justificantes] Resend confirmo el envio pero fallo email_logs', {
          requestId,
          providerId: result.data.id
        });
        return sendJson(response, 500, {
          ok: false,
          code: 'MAIL_SENT_LOG_FAILED',
          error: `Resend acepto el correo con ID ${result.data.id}, pero no se pudo registrar el historial.`,
          id: result.data.id,
          attachments: responseAttachments
        });
      }
    }

    console.info('[send-justificantes] Envio correcto', {
      requestId,
      id: result.data.id,
      emailLogId: emailLog?.id || null,
      responseAttachments
    });
    return sendJson(response, 200, {
      ok: true,
      id: result.data.id,
      logged: shouldLogEmail ? Boolean(emailLog?.id) : false,
      emailLog,
      message: 'Correo enviado correctamente.',
      attachments: responseAttachments
    });
  } catch (error) {
    console.error('[send-justificantes] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'MAIL_SEND_FAILED', error: error.message || 'Error al enviar el correo.', attachments: responseAttachments });
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

async function parseRequest(request) {
  const contentType = getHeader(request, 'content-type');
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const raw = await readRawBody(request);
    return {
      transport: 'multipart/form-data',
      rawSizeBytes: raw.length,
      body: parseMultipart(raw, contentType)
    };
  }

  const parsed = parseBody(request.body);
  const rawSizeBytes = typeof request.body === 'string'
    ? Buffer.byteLength(request.body)
    : Buffer.byteLength(JSON.stringify(parsed || {}));
  return { transport: 'application/json', rawSizeBytes, body: parsed };
}

function readRawBody(request) {
  if (Buffer.isBuffer(request.body)) return Promise.resolve(request.body);
  if (typeof request.body === 'string') return Promise.resolve(Buffer.from(request.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error('No se pudo leer el boundary multipart.');

  const body = { attachments: [] };
  const raw = buffer.toString('binary');
  const parts = raw.split(`--${boundary}`).slice(1, -1);

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const separator = part.indexOf('\r\n\r\n');
    if (separator === -1) continue;
    const headerText = part.slice(0, separator);
    const contentBinary = part.slice(separator + 4);
    const disposition = headerText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || '';
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || '';
    const contentTypeHeader = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream';

    if (!name) continue;
    if (filename) {
      body.attachments.push({
        filename,
        contentType: contentTypeHeader,
        content: Buffer.from(contentBinary, 'binary')
      });
      continue;
    }

    const value = Buffer.from(contentBinary, 'binary').toString('utf8');
    if (name === 'organization') {
      body.organization = parseBody(value);
    } else if (name === 'testMode') {
      body.testMode = value === 'true';
    } else if (name === 'logEmail') {
      body.logEmail = value === 'true';
    } else {
      body[name] = value;
    }
  }

  return body;
}

function getHeader(request, name) {
  if (typeof request.headers?.get === 'function') return String(request.headers.get(name) || '');
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.[name.toUpperCase()] || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function getAttachmentBytes(attachment) {
  if (Buffer.isBuffer(attachment?.content)) return attachment.content.length;
  if (typeof attachment?.content === 'string') return Buffer.byteLength(attachment.content);
  return 0;
}

function summarizeAttachment(attachment) {
  return {
    filename: attachment?.filename,
    contentBytes: getAttachmentBytes(attachment),
    hasContent: Boolean(attachment?.content)
  };
}

function validatePdfAttachment(attachment) {
  const filename = attachment?.filename || '';
  const content = attachment?.content;
  const bytes = getAttachmentBytes(attachment);
  if (!bytes) return { ok: false, filename, bytes, reason: 'contenido vacio' };
  if (bytes < 100) return { ok: false, filename, bytes, reason: 'tamano demasiado pequeno' };

  const buffer = Buffer.isBuffer(content)
    ? content
    : typeof content === 'string'
      ? Buffer.from(content, 'base64')
      : Buffer.alloc(0);

  const header = buffer.slice(0, 4).toString('ascii');
  const ok = header === '%PDF';
  return {
    ok,
    filename,
    bytes,
    contentType: attachment?.contentType || 'application/pdf',
    pdfHeader: header,
    reason: ok ? '' : `cabecera ${header || 'vacia'}`
  };
}

function normalizeAttachmentContent(content) {
  if (Buffer.isBuffer(content)) return content;
  return content;
}

function assertPdfRuntime() {
  if (typeof jsPDF !== 'function') {
    throw new Error(`jsPDF no esta disponible como constructor (tipo recibido: ${typeof jsPDF}).`);
  }
  if (typeof autoTable !== 'function') {
    throw new Error(`autoTable no esta disponible como funcion (tipo recibido: ${typeof autoTable}).`);
  }
}

async function loadStoredAttachments(admin, bucket, references = [], requestId) {
  const loaded = [];
  for (const reference of references) {
    if (reference?.content) {
      loaded.push(reference);
      continue;
    }
    const storagePath = reference?.storagePath || reference?.storage_path;
    if (!storagePath) continue;
    const { data, error } = await admin.storage.from(bucket).download(storagePath);
    if (error || !data) {
      console.error('[send-justificantes] No se pudo recuperar PDF original', {
        requestId,
        storagePath,
        error: error?.message
      });
      throw new Error(`No se pudo recuperar el PDF original ${reference.filename || storagePath}.`);
    }
    const content = Buffer.from(await data.arrayBuffer());
    loaded.push({
      ...reference,
      storagePath,
      contentType: reference.contentType || 'application/pdf',
      content
    });
  }
  console.info('[send-justificantes] PDFs originales recuperados', {
    requestId,
    requested: references.length,
    loaded: loaded.length
  });
  return loaded;
}

async function persistGeneratedAttachments(admin, bucket, attachments = [], requestId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const year = new Date().getFullYear();
  const persisted = [];
  const uploadedPaths = [];
  for (const [index, attachment] of attachments.entries()) {
    const safeName = sanitizeStorageFilename(attachment.filename || `justificante-${index + 1}.pdf`);
    const storagePath = `justificantes/${year}/${timestamp}-${index + 1}-${safeName}`;
    const { error } = await admin.storage.from(bucket).upload(storagePath, attachment.content, {
      contentType: attachment.contentType || 'application/pdf',
      upsert: false
    });
    if (error) {
      console.error('[send-justificantes] No se pudo guardar PDF en Storage', {
        requestId,
        bucket,
        storagePath,
        error: error.message
      });
      if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths);
      throw new Error(`No se pudo guardar el justificante ${attachment.filename} en Supabase Storage: ${error.message}`);
    }
    uploadedPaths.push(storagePath);
    persisted.push({ ...attachment, storagePath });
  }
  console.info('[send-justificantes] Persistencia de PDFs completada', {
    requestId,
    bucket,
    generated: attachments.length,
    stored: persisted.filter((item) => item.storagePath).length
  });
  return persisted;
}

function sanitizeStorageFilename(value) {
  return String(value || 'justificante.pdf')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-');
}

export async function createServerReceiptAttachments(receiptEntries = [], options = {}) {
  assertPdfRuntime();
  const logo = await loadServerLogo(options.logoUrl);
  const attachments = receiptEntries.map((entry, index) => {
    const doc = createServerReceiptPdf(entry, options.organization || {}, logo);
    const receiptNumber = entry?.delivery?.receipt_number || fallbackReceiptNumber(entry?.delivery, index);
    const buffer = Buffer.from(doc.output('arraybuffer'));
    return {
      filename: `Justificante-${receiptNumber}.pdf`,
      contentType: 'application/pdf',
      content: buffer,
      deliveryId: entry?.delivery?.id || null,
      isSummary: false
    };
  });

  if (options.includeSummary) {
    const summaryDoc = createServerDeliveriesSummaryPdf(receiptEntries, options.organization || {}, logo);
    attachments.push({
      filename: 'Resumen-entregas.pdf',
      contentType: 'application/pdf',
      content: Buffer.from(summaryDoc.output('arraybuffer')),
      deliveryId: null,
      isSummary: true
    });
  }

  return attachments;
}

function createServerReceiptPdf(entry = {}, organization = {}, logo = null) {
  const delivery = entry.delivery || {};
  const beneficiary = entry.beneficiary || {};
  const doc = new jsPDF();
  const receiptNumber = delivery.receipt_number || fallbackReceiptNumber(delivery, 0);
  const productRows = getServerProductRows(delivery);

  doc.setFont('helvetica', 'bold');
  if (logo) {
    doc.addImage(logo.bytes, logo.format, 14, 8, 26, 26);
  }
  doc.setFontSize(15);
  doc.text(organization.name || 'PAN Y ESPERANZA', logo ? 46 : 14, 16);
  doc.setFontSize(13);
  doc.text('JUSTIFICANTE DE ENTREGA DE AYUDA SOCIAL', 14, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`No. Justificante: ${receiptNumber}`, 140, 16);
  doc.text(`Fecha de emision: ${formatDateTimeServer(new Date().toISOString())}`, 140, 23);
  doc.text('CIF: EN TRAMITE', 14, 22);
  doc.text(organization.email || 'info@panyesperanza.org', 14, 26);
  doc.text(organization.web || organization.website || 'www.panyesperanza.org', 72, 26);
  doc.setDrawColor(219, 229, 220);
  doc.line(14, 38, 196, 38);

  drawServerSectionTitle(doc, 'DATOS DEL BENEFICIARIO', 48);
  autoTable(doc, {
    startY: 53,
    body: [
      ['Beneficiario', beneficiary.full_name || delivery.beneficiary_name || '-'],
      ['Codigo beneficiario', beneficiary.code || '-'],
      ['Documento identificativo', beneficiary.document_id || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } }
  });

  drawServerSectionTitle(doc, 'DATOS DE LA ENTREGA', doc.lastAutoTable.finalY + 10);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 15,
    body: [
      ['Fecha y hora de entrega', formatDateTimeServer(delivery.reception_at || delivery.delivered_at)],
      ['Responsable', delivery.responsible || '-'],
      ['Tipo de ayuda', delivery.help_type || '-'],
      ['Observaciones', delivery.notes || '-']
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } }
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 10,
    head: [['Producto entregado', 'Cantidad']],
    body: productRows,
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 9 }
  });

  let signatureY = doc.lastAutoTable.finalY + 20;
  if (signatureY > 215) {
    doc.addPage();
    signatureY = 28;
  }
  doc.setFontSize(12);
  doc.text('Firma del beneficiario', 14, signatureY);
  doc.text('Firma del responsable', 112, signatureY);
  doc.setDrawColor(180, 190, 185);
  doc.roundedRect(14, signatureY + 4, 80, 36, 2, 2);
  doc.roundedRect(112, signatureY + 4, 80, 36, 2, 2);
  addServerSignature(doc, delivery.signature_data_url, 14, signatureY + 5);
  addServerSignature(doc, delivery.responsible_signature_data_url, 112, signatureY + 5);

  doc.setDrawColor(219, 229, 220);
  doc.line(14, 272, 196, 272);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text('Este documento acredita la entrega de ayuda social realizada por Pan y Esperanza.', 14, 279);
  doc.text('Documento generado electronicamente por el Sistema de Gestion Pan y Esperanza.', 14, 285);
  doc.setTextColor(23, 33, 27);

  return doc;
}

function createServerDeliveriesSummaryPdf(receiptEntries = [], organization = {}, logo = null) {
  const doc = new jsPDF();
  const deliveries = receiptEntries.map((entry) => entry.delivery || {});
  const summaryRows = receiptEntries.flatMap((entry) => {
    const delivery = entry.delivery || {};
    const beneficiaryName = entry.beneficiary?.full_name || delivery.beneficiary_name || '-';
    return getServerProductRows(delivery).map(([product, quantity]) => ({ delivery, beneficiaryName, product, quantity }));
  });
  const beneficiaries = new Set(receiptEntries.map((entry) => entry.beneficiary?.full_name || entry.delivery?.beneficiary_name).filter(Boolean));
  const productsTotal = summaryRows.reduce((total, row) => total + Number(row.quantity || 0), 0);
  const responsibles = new Set(deliveries.map((delivery) => delivery.responsible).filter(Boolean));
  if (logo) {
    doc.addImage(logo.bytes, logo.format, 14, 8, 26, 26);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('INFORME OFICIAL DE ENTREGAS', logo ? 46 : 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Periodo consultado: ${getServerDeliveriesPeriod(deliveries)}`, logo ? 46 : 14, 26);
  doc.text(`Fecha de emision: ${formatDateTimeServer(new Date().toISOString())}`, logo ? 46 : 14, 32);
  autoTable(doc, {
    startY: 40,
    head: [['Fecha', 'Hora', 'Beneficiario', 'Responsable', 'Producto', 'Cantidad', 'Tipo de ayuda']],
    body: summaryRows.map(({ delivery, beneficiaryName, product, quantity }) => [
      formatDateServer(delivery.delivered_at),
      formatTimeServer(delivery.reception_at || delivery.delivered_at),
      beneficiaryName,
      delivery.responsible || '-',
      product,
      quantity,
      delivery.help_type || '-'
    ]),
    headStyles: { fillColor: [36, 126, 80] },
    styles: { fontSize: 8 }
  });
  const totalsY = Math.min((doc.lastAutoTable?.finalY || 40) + 12, 250);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('RESUMEN DEL PERIODO', 14, totalsY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Beneficiarios atendidos: ${beneficiaries.size}`, 14, totalsY + 8);
  doc.text(`Entregas realizadas: ${deliveries.length}`, 14, totalsY + 16);
  doc.text(`Productos entregados: ${productsTotal}`, 14, totalsY + 24);
  doc.text(`Responsables participantes: ${responsibles.size}`, 14, totalsY + 32);
  doc.setFontSize(8);
  doc.setTextColor(96, 112, 100);
  doc.text('Informe interno de gestion y seguimiento.', 14, 278);
  doc.text(`${organization.name || 'Pan y Esperanza'} - ${organization.email || 'info@panyesperanza.org'} - ${organization.web || organization.website || 'www.panyesperanza.org'}`, 14, 284);
  doc.setTextColor(23, 33, 27);
  return doc;
}

function drawServerSectionTitle(doc, title, y) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(36, 126, 80);
  doc.text(title, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 27);
}

function addServerSignature(doc, dataUrl, x, y) {
  if (!dataUrl) {
    doc.setFontSize(10);
    doc.text('Sin firma registrada', x, y + 8);
    return;
  }
  try {
    const format = dataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(dataUrl, format, x, y, 80, 32);
  } catch (error) {
    console.warn('[send-justificantes] No se pudo insertar firma en PDF servidor', { message: error.message });
    doc.setFontSize(10);
    doc.text('Firma no disponible', x, y + 8);
  }
}

function getServerProductRows(delivery = {}) {
  if (Array.isArray(delivery.items) && delivery.items.length) {
    return delivery.items.map((item) => [
      item.name || item.inventory_item_name || item.product || '-',
      item.quantity || '-'
    ]);
  }
  return [[
    delivery.inventory_item_name || delivery.product || delivery.help_type || 'Ayuda entregada',
    delivery.quantity || '-'
  ]];
}

async function loadServerLogo(logoUrl) {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const format = contentType.includes('jpeg') || contentType.includes('jpg') ? 'JPEG' : 'PNG';
    return { bytes: new Uint8Array(await response.arrayBuffer()), format };
  } catch (error) {
    console.warn('[send-justificantes] No se pudo cargar el logo para el PDF', {
      logoUrl,
      error: error.message
    });
    return null;
  }
}

function fallbackReceiptNumber(delivery = {}, index = 0) {
  const year = new Date(delivery.delivered_at || Date.now()).getFullYear();
  return `PE-${year}-${String(index + 1).padStart(6, '0')}`;
}

function getServerDeliveriesPeriod(deliveries = []) {
  const dates = deliveries.map((item) => item.delivered_at).filter(Boolean).sort();
  if (!dates.length) return 'Sin entregas seleccionadas';
  return `${formatDateServer(dates[0])} - ${formatDateServer(dates[dates.length - 1])}`;
}

function formatDateServer(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-ES');
}

function formatTimeServer(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeServer(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-ES');
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

export async function recordEmailLog(admin, context) {
  const {
    body,
    auth,
    recipients,
    attachments,
    providerId,
    status,
    result,
    receiptEntries,
    requestId
  } = context;
  const receiptIds = [...new Set([
    ...receiptEntries.map((entry) => entry?.delivery?.id).filter(Boolean),
    ...attachments.map((attachment) => attachment?.deliveryId || attachment?.delivery_id).filter(Boolean)
  ])];
  const senderName = [auth.profile?.first_name, auth.profile?.last_name].filter(Boolean).join(' ')
    || auth.profile?.email
    || 'Usuario';
  const historyResult = status === 'Error' && !/^error\b/i.test(result) ? `Error: ${result}` : result;
  const basePayload = {
    sent_at: new Date().toISOString(),
    recipient: recipients.join(', '),
    sent_by: senderName,
    receipts_count: attachments.filter((attachment) => !attachment.isSummary).length || receiptIds.length,
    result: providerId ? `${historyResult} Resend: ${providerId}` : historyResult,
    subject: body.subject || 'Justificantes de entrega - Pan y Esperanza',
    message: body.message || '',
    attachments
  };
  const fullPayload = {
    ...basePayload,
    provider_id: providerId,
    status,
    receipt_ids: receiptIds
  };

  let { data, error } = await admin.from('email_logs').insert(fullPayload).select().single();
  if (error && isMissingEmailLogColumn(error)) {
    console.warn('[send-justificantes] email_logs usa esquema anterior; guardando ID en result', {
      requestId,
      providerId,
      error: error.message
    });
    const fallback = await admin.from('email_logs').insert(basePayload).select().single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data?.id) {
    console.error('[send-justificantes] No se pudo registrar email_logs', {
      requestId,
      providerId,
      status,
      error: error?.message,
      code: error?.code
    });
    return null;
  }
  console.info('[send-justificantes] email_logs registrado', {
    requestId,
    emailLogId: data.id,
    providerId,
    status,
    receiptIds
  });
  return data;
}

function isMissingEmailLogColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === 'PGRST204' || message.includes('provider_id') || message.includes('receipt_ids') || message.includes('status');
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
    .select('id,email,first_name,last_name,auth_user_id,role,is_active,status,permissions,permission_matrix')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (!profile && !profileError) {
    const byEmail = await admin
      .from('app_users')
      .select('id,email,first_name,last_name,auth_user_id,role,is_active,status,permissions,permission_matrix')
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

  console.info('[send-justificantes] Permiso de correo validado', {
    requestId,
    profileId: profile.id,
    authUserId: authData.user.id,
    email: authData.user.email,
    role: profile.role
  });
  return { ok: true, profile, admin };
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
