import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_MESSAGES = 20;
const REQUEST_MESSAGE_MAX = 1200;

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  try {
    const body = await parseBody(request);
    const supabase = createServerClient();
    const { sessionRow, beneficiary } = await requireBeneficiarySession(supabase, body.session);
    await enforceRateLimit(supabase, beneficiary.id);

    const userMessage = sanitizeUserMessage(body.message || body.prompt || body.intent || '');
    const intent = classifyIntent(body.intent, userMessage);
    const context = await buildBeneficiaryContext(supabase, beneficiary);
    const reply = await buildReply(supabase, beneficiary, sessionRow, context, intent, userMessage, body);

    await logAssistantMessage(supabase, {
      beneficiaryId: beneficiary.id,
      sessionId: sessionRow.id,
      category: reply.category,
      userMessage,
      assistantResponse: reply.answer,
      actionPerformed: reply.actionPerformed || '',
      metadata: {
        intent,
        source: 'beneficiary-assistant',
        requiresConfirmation: reply.requiresConfirmation === true
      }
    });

    return sendJson(response, 200, { ok: true, reply });
  } catch (error) {
    const status = error.status || 500;
    return sendJson(response, status, {
      ok: false,
      code: error.code || 'BENEFICIARY_ASSISTANT_FAILED',
      error: error.message || 'No se pudo completar la consulta del asistente.'
    });
  }
}

async function buildReply(supabase, beneficiary, sessionRow, context, intent, userMessage, body) {
  if (intent === 'blocked_other_person') {
    return {
      category: 'seguridad',
      answer: 'No puedo consultar datos de otras personas. Solo puedo ayudarte con la informacion autorizada de tu propio portal.',
      actionPerformed: 'access_denied'
    };
  }

  if (intent === 'blocked_sensitive_advice') {
    return {
      category: 'seguridad',
      answer: 'No puedo dar diagnosticos medicos ni asesoramiento juridico definitivo. Si quieres, puedo preparar una solicitud para que el equipo de Pan y Esperanza revise tu caso.',
      action: { type: 'prepare_request' },
      actionPerformed: 'safe_refusal'
    };
  }

  if (intent === 'blocked_prompt_injection') {
    return {
      category: 'seguridad',
      answer: 'Por seguridad, solo puedo responder usando las opciones autorizadas del Portal del Beneficiario.',
      actionPerformed: 'prompt_injection_blocked'
    };
  }

  if (intent === 'blocked_credentials') {
    return {
      category: 'seguridad',
      answer: 'No puedo consultar, guardar ni mostrar PIN, OTP o credenciales. Si tienes un problema de acceso, contacta con Pan y Esperanza para que el equipo lo revise.',
      action: { type: 'contact', email: context.contact.email, phone: context.contact.phone },
      actionPerformed: 'credentials_blocked'
    };
  }

  if (intent === 'next_delivery') return nextDeliveryReply(context);
  if (intent === 'documents') return documentsReply(context);
  if (intent === 'notices') return noticesReply(context);
  if (intent === 'contact') return contactReply(context);
  if (intent === 'requests') return requestsReply(context);
  if (intent === 'confirm_request') return confirmRequestReply(supabase, beneficiary, sessionRow, body);
  if (intent === 'create_request') return prepareRequestReply(userMessage);

  return {
    category: 'sin_informacion',
    answer: 'No encuentro esa informacion en tu portal. Puedo ayudarte a enviar una solicitud al equipo de Pan y Esperanza para que la revisen.',
    action: { type: 'prepare_request' },
    actionPerformed: 'fallback_request_offer'
  };
}

function nextDeliveryReply(context) {
  const delivery = context.nextDelivery;
  if (!delivery) {
    return {
      category: 'proxima_entrega',
      answer: 'Ahora mismo no aparece una entrega futura programada en tu portal. Si crees que falta informacion, puedo ayudarte a enviar una solicitud al equipo.',
      action: { type: 'open_tab', tab: 'entrega' },
      actionPerformed: 'read_next_delivery'
    };
  }

  const parts = [
    `Tu proxima entrega esta registrada para el ${formatDate(delivery.delivered_at || delivery.created_at)}.`,
    delivery.delivered_time ? `Hora: ${delivery.delivered_time}.` : 'La hora aun no esta indicada.',
    delivery.location ? `Lugar: ${delivery.location}.` : 'El lugar aun no esta indicado.',
    `Tipo de ayuda: ${delivery.help_type || 'Ayuda'}.`,
    `Estado: ${delivery.status || 'Pendiente'}.`
  ];
  return {
    category: 'proxima_entrega',
    answer: parts.join(' '),
    action: { type: 'open_tab', tab: 'entrega' },
    actionPerformed: 'read_next_delivery'
  };
}

function documentsReply(context) {
  const pending = context.documents.filter((item) => item.status !== 'received');
  if (!context.documents.length) {
    return {
      category: 'documentacion',
      answer: 'No aparece documentacion registrada en tu portal. Si necesitas confirmar algo, puedo preparar una solicitud para el equipo.',
      action: { type: 'open_tab', tab: 'documentos' },
      actionPerformed: 'read_documents'
    };
  }

  if (!pending.length) {
    return {
      category: 'documentacion',
      answer: `Tu estado documental aparece al dia. Hay ${context.documents.length} documento${context.documents.length === 1 ? '' : 's'} recibido${context.documents.length === 1 ? '' : 's'}.`,
      action: { type: 'open_tab', tab: 'documentos' },
      actionPerformed: 'read_documents'
    };
  }

  const names = pending.slice(0, 3).map((item) => item.document_type || 'Documento').join(', ');
  return {
    category: 'documentacion',
    answer: `Te falta revisar ${pending.length} documento${pending.length === 1 ? '' : 's'}: ${names}. No puedo mostrar documentos internos ni enlaces privados.`,
    action: { type: 'open_tab', tab: 'documentos' },
    actionPerformed: 'read_documents'
  };
}

function noticesReply(context) {
  if (!context.notices.length) {
    return {
      category: 'avisos',
      answer: 'No tienes avisos activos en este momento.',
      action: { type: 'open_tab', tab: 'avisos' },
      actionPerformed: 'read_notices'
    };
  }

  const unread = context.notices.filter((item) => item.status !== 'read');
  const latest = context.notices[0];
  return {
    category: 'avisos',
    answer: `Tienes ${context.notices.length} aviso${context.notices.length === 1 ? '' : 's'} activo${context.notices.length === 1 ? '' : 's'}, ${unread.length} nuevo${unread.length === 1 ? '' : 's'}. El ultimo es: "${latest.title || 'Aviso'}".`,
    action: { type: 'open_tab', tab: 'avisos' },
    actionPerformed: 'read_notices'
  };
}

function contactReply(context) {
  const contact = context.contact;
  return {
    category: 'contacto',
    answer: `Puedes contactar con Pan y Esperanza por correo en ${contact.email} o por WhatsApp en ${contact.phone}.`,
    action: { type: 'contact', email: contact.email, phone: contact.phone },
    actionPerformed: 'read_contact'
  };
}

function requestsReply(context) {
  const pending = context.requests.filter((item) => cleanText(item.status).toLowerCase() === 'pending');
  if (!context.requests.length) {
    return {
      category: 'solicitudes',
      answer: 'No aparecen solicitudes registradas en tu portal.',
      action: { type: 'open_tab', tab: 'solicitudes' },
      actionPerformed: 'read_requests'
    };
  }
  return {
    category: 'solicitudes',
    answer: `Tienes ${context.requests.length} solicitud${context.requests.length === 1 ? '' : 'es'} registrada${context.requests.length === 1 ? '' : 's'}, ${pending.length} pendiente${pending.length === 1 ? '' : 's'}.`,
    action: { type: 'open_tab', tab: 'solicitudes' },
    actionPerformed: 'read_requests'
  };
}

function prepareRequestReply(userMessage) {
  const message = cleanText(userMessage).length > 8 && !cleanText(userMessage).toLowerCase().includes('enviar una solicitud')
    ? cleanText(userMessage)
    : 'Solicito que el equipo de Pan y Esperanza contacte conmigo para revisar mi caso.';
  return {
    category: 'solicitudes',
    answer: `Puedo enviar esta solicitud al equipo: "${message}". Confirmala antes de guardarla.`,
    requiresConfirmation: true,
    draftRequest: {
      request_type: 'assistant_request',
      message
    },
    actionPerformed: 'request_prepared'
  };
}

async function confirmRequestReply(supabase, beneficiary, sessionRow, body) {
  const draft = body.draftRequest && typeof body.draftRequest === 'object' ? body.draftRequest : {};
  const message = sanitizeUserMessage(draft.message || body.message || '');
  if (message.length < 8) {
    throw httpError(422, 'INVALID_REQUEST_MESSAGE', 'La solicitud necesita un texto mas claro.');
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('beneficiary_portal_profile_updates').insert({
    beneficiary_id: beneficiary.id,
    requested_changes: {
      request_type: 'assistant_request',
      message,
      preferred_contact: 'portal'
    },
    status: 'pending',
    notes: message,
    requested_at: now,
    created_at: now,
    updated_at: now
  }).select('id,status,requested_at').single();
  if (error) throw error;

  await audit(supabase, `Asistente Beneficiario: solicitud creada para ${beneficiary.code || beneficiary.id}`, sessionRow.id);
  return {
    category: 'solicitudes',
    answer: 'Tu solicitud se ha enviado al equipo de Pan y Esperanza. La revisaran lo antes posible.',
    action: { type: 'open_tab', tab: 'solicitudes', requestId: data.id },
    actionPerformed: 'request_created',
    request: data
  };
}

async function buildBeneficiaryContext(supabase, beneficiary) {
  const [deliveries, documents, notices, resources, requests, settings] = await Promise.all([
    listBy(supabase, 'deliveries', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_documents', 'beneficiary_id', beneficiary.id),
    listBy(supabase, 'beneficiary_portal_notices', 'beneficiary_id', beneficiary.id),
    listPublishedResources(supabase, beneficiary),
    listBy(supabase, 'beneficiary_portal_profile_updates', 'beneficiary_id', beneficiary.id),
    getOrganizationSettings(supabase)
  ]);

  const activeDeliveries = deliveries.filter((item) => cleanText(item.status).toLowerCase() !== 'anulada');
  const nextDelivery = activeDeliveries
    .filter(isFutureDelivery)
    .sort(sortDeliveryAsc)
    .map(sanitizeDelivery)[0] || null;

  return {
    beneficiary: sanitizeBeneficiary(beneficiary),
    nextDelivery,
    deliveries: activeDeliveries.slice(0, 5).map(sanitizeDelivery),
    documents: documents.map(sanitizeDocument),
    notices: notices
      .filter((item) => cleanText(item.status).toLowerCase() !== 'archived')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .map(sanitizeNotice),
    resources: resources.slice(0, 6).map(sanitizeResource),
    requests: requests.map(sanitizeRequest),
    contact: {
      email: settings?.email || settings?.mail_sender_email || 'info@panyesperanza.org',
      phone: settings?.phone || '+34 611 88 91 67',
      website: settings?.website || 'https://www.panyesperanza.org'
    }
  };
}

async function requireBeneficiarySession(supabase, clientSession = {}) {
  const token = cleanText(clientSession.token);
  const subjectId = cleanText(clientSession.subjectId || clientSession.subject_id);
  if (!token || !subjectId) throw httpError(401, 'INVALID_SESSION', 'La sesion no es valida.');

  const { data: sessionRow, error: sessionError } = await supabase
    .from('portal_sessions')
    .select('*')
    .eq('token', token)
    .eq('portal', 'beneficiary')
    .eq('subject_id', subjectId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow || sessionRow.status !== 'active') {
    await audit(supabase, 'Asistente Beneficiario: acceso denegado por sesion no valida');
    throw httpError(401, 'INVALID_SESSION', 'La sesion no es valida. Vuelve a acceder.');
  }
  if (!sessionRow.expires_at || new Date(sessionRow.expires_at).getTime() < Date.now()) {
    await supabase.from('portal_sessions').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', sessionRow.id);
    await audit(supabase, 'Asistente Beneficiario: sesion caducada', sessionRow.id);
    throw httpError(401, 'SESSION_EXPIRED', 'La sesion ha caducado. Vuelve a acceder.');
  }

  const { data: beneficiary, error } = await supabase.from('beneficiaries').select('*').eq('id', subjectId).maybeSingle();
  if (error) throw error;
  if (!beneficiary || beneficiary.is_active === false) {
    await audit(supabase, 'Asistente Beneficiario: beneficiario no disponible', sessionRow.id);
    throw httpError(403, 'BENEFICIARY_NOT_AVAILABLE', 'El acceso no esta disponible.');
  }

  await supabase.from('portal_sessions').update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sessionRow.id);
  return { sessionRow, beneficiary };
}

async function enforceRateLimit(supabase, beneficiaryId) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('beneficiary_assistant_messages')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiary_id', beneficiaryId)
    .gte('created_at', since);
  if (error) throw error;
  if ((count || 0) >= RATE_LIMIT_MAX_MESSAGES) {
    throw httpError(429, 'RATE_LIMITED', 'Has realizado muchas consultas seguidas. Intentalo de nuevo en unos minutos.');
  }
}

async function logAssistantMessage(supabase, payload) {
  const { error } = await supabase.from('beneficiary_assistant_messages').insert({
    beneficiary_id: payload.beneficiaryId,
    portal_session_id: payload.sessionId,
    session_id: payload.sessionId,
    category: payload.category || 'general',
    user_message: stripCredentials(payload.userMessage || ''),
    assistant_response: cleanText(payload.assistantResponse).slice(0, 3000),
    action_performed: cleanText(payload.actionPerformed),
    metadata: payload.metadata || {},
    created_at: new Date().toISOString()
  });
  if (error) throw error;
}

async function listBy(supabase, table, column, value) {
  const { data, error } = await supabase.from(table).select('*').eq(column, value).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listPublishedResources(supabase, beneficiary) {
  const today = new Date().toISOString().slice(0, 10);
  const resourceSelect = 'id,name,organization_name,category,description,requirements,target_audience,required_documents,benefit,opens_at,deadline_at,municipality,phone,email,web_url,official_url,application_method,status,scope,created_at,updated_at,publish_in_beneficiary_portal,visible_to_all_beneficiaries';
  const [globalResult, linkResult] = await Promise.all([
    supabase
      .from('social_resources')
      .select(resourceSelect)
      .eq('publish_in_beneficiary_portal', true)
      .eq('visible_to_all_beneficiaries', true)
      .in('status', ['Activo', 'Proximamente'])
      .or(`deadline_at.is.null,deadline_at.gte.${today}`)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('beneficiary_social_resources')
      .select('resource_id,status')
      .eq('beneficiary_id', beneficiary.id)
  ]);
  if (globalResult.error) throw globalResult.error;
  if (linkResult.error) throw linkResult.error;

  const linkedIds = [...new Set((linkResult.data || []).map((item) => item.resource_id).filter(Boolean))];
  let assignedResources = [];
  if (linkedIds.length) {
    const assignedResult = await supabase
      .from('social_resources')
      .select(resourceSelect)
      .in('id', linkedIds)
      .eq('publish_in_beneficiary_portal', true)
      .in('status', ['Activo', 'Proximamente'])
      .or(`deadline_at.is.null,deadline_at.gte.${today}`)
      .limit(10);
    if (assignedResult.error) throw assignedResult.error;
    assignedResources = assignedResult.data || [];
  }

  const resourcesById = new Map();
  (globalResult.data || []).forEach((resource) => resourcesById.set(resource.id, resource));
  assignedResources.forEach((resource) => resourcesById.set(resource.id, resource));
  return [...resourcesById.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 10);
}

async function getOrganizationSettings(supabase) {
  const { data, error } = await supabase.from('organization_settings').select('name,email,phone,website,mail_sender_email').eq('id', 'main').maybeSingle();
  if (error) throw error;
  return data || {};
}

function classifyIntent(rawIntent, rawMessage) {
  const explicit = cleanText(rawIntent).toLowerCase();
  const message = cleanText(rawMessage).toLowerCase();
  const text = `${explicit} ${message}`;
  if (hasPromptInjection(text)) return 'blocked_prompt_injection';
  if (asksCredential(text)) return 'blocked_credentials';
  if (mentionsOtherPerson(text)) return 'blocked_other_person';
  if (asksMedicalOrLegalAdvice(text)) return 'blocked_sensitive_advice';
  if (['next_delivery', 'documents', 'notices', 'contact', 'requests', 'create_request', 'confirm_request'].includes(explicit)) return explicit;
  if (/(entrega|cita|reparto|cuando|cu[aá]ndo|fecha|hora|lugar)/i.test(text)) return 'next_delivery';
  if (/(document|papel|pendiente|falta|requerido|recibido)/i.test(text)) return 'documents';
  if (/(aviso|mensaje|notificacion|notificaci)/i.test(text)) return 'notices';
  if (/(contact|telefono|tel[eé]fono|whatsapp|correo|email|llamar)/i.test(text)) return 'contact';
  if (/(solicitud|pedir|solicito|necesito ayuda|consulta al equipo|enviar)/i.test(text)) return 'create_request';
  if (/(estado de mi solicitud|mis solicitudes|solicitudes)/i.test(text)) return 'requests';
  return 'unknown';
}

function hasPromptInjection(text) {
  return /(ignora|ignore|instrucciones anteriores|system prompt|prompt|sql|select \*|drop table|service_role|anon key)/i.test(text);
}

function mentionsOtherPerson(text) {
  return /(otra persona|otro beneficiario|expediente ajeno|datos de .*beneficiario|dni de|nif de|historial de otra)/i.test(text);
}

function asksCredential(text) {
  return /(mi pin|mi otp|codigo otp|c[oó]digo otp|clave|contrase|password|recuperar pin|ver pin|mostrar pin)/i.test(text);
}

function asksMedicalOrLegalAdvice(text) {
  return /(diagnostico|diagnóstico|medicamento|tratamiento|enfermedad|denuncia|demanda|abogado|legal|juridic|jurídic|sentencia)/i.test(text);
}

function sanitizeBeneficiary(beneficiary = {}) {
  return {
    id: beneficiary.id,
    code: beneficiary.code,
    full_name: beneficiary.full_name
  };
}

function sanitizeDelivery(delivery = {}) {
  return {
    id: delivery.id,
    delivered_at: delivery.delivered_at || null,
    delivered_time: delivery.delivered_time || null,
    location: cleanText(delivery.location || delivery.delivery_location || delivery.place || delivery.address),
    help_type: delivery.help_type || '',
    status: delivery.status || 'Pendiente',
    created_at: delivery.created_at || null
  };
}

function sanitizeDocument(document = {}) {
  return {
    id: document.id,
    document_type: document.document_type || 'Documento',
    status: inferDocumentStatus(document),
    uploaded_at: document.uploaded_at || null,
    created_at: document.created_at || null
  };
}

function sanitizeNotice(notice = {}) {
  return {
    id: notice.id,
    title: notice.title || 'Aviso',
    message: notice.message || '',
    status: notice.status || 'unread',
    created_at: notice.created_at || null
  };
}

function sanitizeResource(resource = {}) {
  return {
    id: resource.id,
    title: resource.name,
    description: resource.description,
    category: resource.category,
    url: resource.web_url || resource.official_url
  };
}

function sanitizeRequest(request = {}) {
  return {
    id: request.id,
    status: request.status,
    requested_at: request.requested_at || request.created_at,
    notes: request.notes || ''
  };
}

function inferDocumentStatus(document = {}) {
  const status = cleanText(document.portal_status || document.status).toLowerCase();
  const notes = cleanText(document.notes).toLowerCase();
  if (status.includes('recib') || status === 'received' || document.file_data_url || document.file_url || document.storage_path) return 'received';
  if (status.includes('caduc') || status === 'expired' || status.includes('requer') || notes.includes('requer')) return 'required';
  return 'pending';
}

function isFutureDelivery(delivery = {}) {
  const deliveryDate = String(delivery.delivered_at || delivery.created_at || '').slice(0, 10);
  return Boolean(deliveryDate) && deliveryDate >= new Date().toISOString().slice(0, 10);
}

function sortDeliveryAsc(a = {}, b = {}) {
  const dateCompare = String(a.delivered_at || a.created_at || '').localeCompare(String(b.delivered_at || b.created_at || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.delivered_time || '').localeCompare(String(b.delivered_time || ''));
}

function createServerClient() {
  const url = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    throw httpError(503, 'SUPABASE_ADMIN_NOT_CONFIGURED', 'Supabase no esta configurado para el asistente.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function audit(supabase, action, sessionId = '') {
  try {
    await supabase.from('audit_logs').insert({
      user_name: 'Asistente Beneficiario',
      user_email: '',
      action: `${action}${sessionId ? ` | session ${sessionId}` : ''}`,
      happened_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[beneficiary-assistant] No se pudo registrar auditoria', { message: error?.message || 'error desconocido' });
  }
}

function formatDate(value) {
  const text = cleanText(value).slice(0, 10);
  if (!text) return 'fecha pendiente';
  const [year, month, day] = text.split('-');
  if (!year || !month || !day) return text;
  return `${day}/${month}/${year}`;
}

function sanitizeUserMessage(value) {
  return stripCredentials(cleanText(value).slice(0, REQUEST_MESSAGE_MAX));
}

function stripCredentials(value) {
  return cleanText(value)
    .replace(/\b\d{6,12}\b/g, '[PIN]')
    .replace(/\b\d{4,8}\b/g, '[CODIGO]');
}

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value) {
  return String(value || '').trim();
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sendJson(response, status, payload) {
  response.status(status).json(payload);
}
