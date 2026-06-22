import { Resend } from 'resend';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[send-justificantes] Inicio', { requestId });

  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const logoUrl = process.env.PUBLIC_LOGO_URL;
    const body = parseBody(request.body);
    const recipients = normalizeRecipients(body.to);
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const organization = body.organization || {};
    const isTest = Boolean(body.testMode);

    console.info('[send-justificantes] Payload recibido', {
      requestId,
      recipients: recipients.length,
      testMode: isTest,
      attachments: attachments.map((attachment) => ({
        filename: attachment?.filename,
        contentLength: attachment?.content?.length || 0
      }))
    });

    if (!apiKey || !from) {
      console.error('[send-justificantes] Servicio no configurado', { requestId, hasApiKey: Boolean(apiKey), hasFrom: Boolean(from) });
      return sendJson(response, 503, { ok: false, code: 'MAIL_NOT_CONFIGURED', error: 'Servicio de correo no configurado. Añada RESEND_API_KEY en el archivo .env.' });
    }

    if (!recipients.length) {
      return sendJson(response, 400, { ok: false, code: 'NO_RECIPIENTS', error: 'Debes indicar al menos un destinatario.' });
    }

    const invalidAttachment = attachments.find((attachment) => !attachment?.filename || !attachment?.content);
    if (invalidAttachment) {
      console.error('[send-justificantes] Adjunto invalido', { requestId, invalidAttachment });
      return sendJson(response, 400, { ok: false, code: 'INVALID_ATTACHMENT', error: 'Uno de los adjuntos no es valido.' });
    }

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: body.subject || 'Justificantes de entrega - Pan y Esperanza',
      text: body.message || 'Adjuntamos los justificantes de entrega seleccionados.',
      html: buildHtml(body.message, logoUrl, organization),
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content
      }))
    });

    if (result.error) {
      const providerMessage = result.error.message || result.error.name || 'Error al enviar el correo.';
      console.error('[send-justificantes] Error Resend', { requestId, error: result.error });
      return sendJson(response, 502, { ok: false, code: 'MAIL_PROVIDER_ERROR', error: providerMessage });
    }

    console.info('[send-justificantes] Envio correcto', { requestId, id: result.data?.id });
    return sendJson(response, 200, { ok: true, id: result.data?.id, message: 'Correo enviado correctamente.' });
  } catch (error) {
    console.error('[send-justificantes] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'MAIL_SEND_FAILED', error: error.message || 'Error al enviar el correo.' });
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

function buildHtml(message, logoUrl, organization = {}) {
  const name = organization.name || 'Pan y Esperanza';
  const date = new Date().toLocaleDateString('es-ES');
  const footer = [organization.cif, organization.address, organization.phone, organization.email].filter(Boolean).join(' · ');
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
