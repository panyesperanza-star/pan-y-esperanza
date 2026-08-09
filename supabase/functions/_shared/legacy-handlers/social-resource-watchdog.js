import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cleanJwtCredential, getServerConfig, hasAppPermission } from './_adminAuth.js';

const WATCHDOG_LOG_PREFIX = '[social-resource-watchdog]';
const MAX_CANDIDATES_PER_SOURCE = 25;
const FETCH_TIMEOUT_MS = 12000;
const RESOURCE_KEYWORDS = [
  'ayuda',
  'ayudas',
  'subvencion',
  'subvención',
  'convocatoria',
  'prestacion',
  'prestación',
  'beca',
  'bono',
  'alquiler',
  'vivienda',
  'familia',
  'infancia',
  'mayores',
  'discapacidad',
  'empleo',
  'formacion',
  'formación',
  'plazo'
];

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!['GET', 'POST'].includes(request.method)) {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = new Date();
  console.info(`${WATCHDOG_LOG_PREFIX} Inicio`, { requestId, method: request.method });

  try {
    const { url, serviceRoleKey, diagnostics } = getServerConfig();
    if (!url || !serviceRoleKey) {
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        error: 'Servicio de vigilancia no configurado.',
        details: diagnostics
      });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const auth = await authorizeWatchdog(request, admin, { serviceRoleKey, requestId });
    if (!auth.ok) {
      return sendJson(response, auth.status, { ok: false, code: auth.code, error: auth.error });
    }

    const sourceId = cleanText(body.sourceId || request.query?.sourceId || '');
    const mode = cleanText(body.mode || request.query?.mode || (sourceId ? 'source' : 'due'));
    const result = await runWatchdog({
      admin,
      sourceId,
      mode,
      actor: auth.actor,
      requestId
    });

    return sendJson(response, 200, {
      ok: true,
      requestId,
      trigger: auth.actor.type,
      elapsedMs: Date.now() - startedAt.getTime(),
      ...result
    });
  } catch (error) {
    console.error(`${WATCHDOG_LOG_PREFIX} Excepcion`, { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, {
      ok: false,
      code: 'SOCIAL_RESOURCE_WATCHDOG_FAILED',
      error: error.message || 'No se pudo ejecutar la vigilancia automatica.'
    });
  }
}

async function runWatchdog({ admin, sourceId, mode, actor, requestId }) {
  const now = new Date();
  const { data: allSources, error: sourcesError } = await admin
    .from('social_resource_sources')
    .select('*')
    .eq('status', 'Activa')
    .order('created_at', { ascending: true });

  if (sourcesError) throw sourcesError;

  const selectedSources = (allSources || [])
    .filter((source) => !sourceId || source.id === sourceId)
    .filter((source) => sourceId || mode === 'all' || isSourceDue(source, now));

  const [resourcesResult, detectionsResult] = await Promise.all([
    admin.from('social_resources').select('id,name,organization_name,official_url,web_url,status,requirements,required_documents,benefit,deadline_at,updated_at'),
    admin.from('social_resource_detections').select('id,source_id,dedupe_key,status')
  ]);
  if (resourcesResult.error) throw resourcesResult.error;
  if (detectionsResult.error) throw detectionsResult.error;

  const resources = resourcesResult.data || [];
  const dedupeKeys = new Set((detectionsResult.data || []).map((item) => item.dedupe_key).filter(Boolean));
  const summary = {
    checkedSources: 0,
    skippedSources: Math.max((allSources || []).length - selectedSources.length, 0),
    createdDetections: 0,
    duplicatedDetections: 0,
    failedSources: 0,
    sources: []
  };

  for (const source of selectedSources) {
    const sourceResult = await checkSource({ admin, source, resources, dedupeKeys, actor, requestId });
    summary.checkedSources += 1;
    summary.createdDetections += sourceResult.createdDetections;
    summary.duplicatedDetections += sourceResult.duplicatedDetections;
    if (!sourceResult.ok) summary.failedSources += 1;
    summary.sources.push(sourceResult);
  }

  return summary;
}

async function checkSource({ admin, source, resources, dedupeKeys, actor, requestId }) {
  const startedAt = new Date();
  const sourceResult = {
    id: source.id,
    name: source.name,
    ok: true,
    createdDetections: 0,
    duplicatedDetections: 0,
    message: ''
  };
  await updateSourceCheck(admin, source, {
    last_check_started_at: startedAt.toISOString(),
    last_check_status: 'Comprobacion iniciada.',
    last_check_error: ''
  });

  try {
    if (source.access_method === 'manual') {
      sourceResult.message = 'Fuente marcada como comprobacion manual.';
      await finishSourceCheck(admin, source, sourceResult.message, '');
      return sourceResult;
    }

    const targetUrl = resolveSourceUrl(source);
    if (!targetUrl) throw new Error('La fuente no tiene URL oficial o feed configurado.');

    const fetched = await fetchOfficialSource(targetUrl);
    const candidates = parseOfficialSource(fetched, source)
      .slice(0, MAX_CANDIDATES_PER_SOURCE);

    for (const candidate of candidates) {
      const detection = await buildDetection(candidate, source, resources, actor);
      if (!detection?.dedupe_key || dedupeKeys.has(detection.dedupe_key)) {
        sourceResult.duplicatedDetections += 1;
        continue;
      }

      const { error } = await admin.from('social_resource_detections').insert(detection);
      if (error) {
        if (error.code === '23505') {
          sourceResult.duplicatedDetections += 1;
          dedupeKeys.add(detection.dedupe_key);
          continue;
        }
        throw error;
      }
      dedupeKeys.add(detection.dedupe_key);
      sourceResult.createdDetections += 1;
    }

    sourceResult.message = candidates.length
      ? `Comprobada automaticamente: ${sourceResult.createdDetections} detecciones nuevas, ${sourceResult.duplicatedDetections} duplicadas.`
      : 'Comprobada automaticamente: no se han encontrado convocatorias estructuradas nuevas.';
    await finishSourceCheck(admin, source, sourceResult.message, '');
  } catch (error) {
    sourceResult.ok = false;
    sourceResult.message = error.message || 'Error desconocido al comprobar la fuente.';
    console.error(`${WATCHDOG_LOG_PREFIX} Fuente fallida`, { requestId, sourceId: source.id, sourceName: source.name, error: sourceResult.message });
    await finishSourceCheck(admin, source, 'Comprobacion fallida.', sourceResult.message);
  }

  return sourceResult;
}

async function buildDetection(candidate, source, resources, actor) {
  const officialUrl = candidate.url || source.official_url;
  const title = cleanText(candidate.title).slice(0, 240);
  if (!title || !officialUrl) return null;

  const duplicate = findDuplicateResource(resources, officialUrl, title, source);
  const detectionType = inferDetectionType(candidate, duplicate);
  const changedFields = inferChangedFields(candidate, detectionType);
  const newData = {
    name: title,
    organization_name: source.organization_name || source.name || '',
    category: inferCategory(`${title} ${candidate.summary || ''}`),
    description: cleanText(candidate.summary),
    requirements: cleanText(candidate.requirements),
    required_documents: cleanText(candidate.requiredDocuments),
    benefit: cleanText(candidate.benefit),
    opens_at: candidate.opensAt || '',
    deadline_at: candidate.deadlineAt || '',
    web_url: officialUrl,
    official_url: officialUrl,
    status: detectionType === 'Cierre/caducidad' ? 'Cerrado' : 'Activo',
    scope: source.scope || 'municipal',
    last_verified_at: new Date().toISOString().slice(0, 10),
    notes: `Detectado automaticamente desde ${source.name}.`
  };
  const dedupeInput = JSON.stringify({
    sourceId: source.id,
    title,
    officialUrl,
    detectionType,
    contentHash: candidate.contentHash || candidate.summary || ''
  });

  return {
    source_id: source.id,
    resource_id: duplicate?.id || null,
    duplicate_resource_id: duplicate?.id || null,
    detection_type: detectionType,
    status: 'Pendiente de revision',
    title,
    official_url: officialUrl,
    detected_at: new Date().toISOString(),
    detected_by: actor.type === 'scheduled' ? 'Vigilancia automatica diaria' : `Comprobacion manual: ${actor.name}`,
    change_summary: buildChangeSummary(candidate, detectionType, source),
    changed_fields: changedFields.map((field) => ({ field, label: fieldLabel(field) })),
    previous_data: duplicate ? pickPreviousData(duplicate) : {},
    new_data: newData,
    raw_payload: candidate.raw || {},
    dedupe_key: await sha256Hex(dedupeInput),
    compatibility_count: 0,
    reviewed_by: null,
    reviewed_by_name: '',
    reviewed_at: null,
    decision: '',
    review_notes: ''
  };
}

async function authorizeWatchdog(request, admin, { serviceRoleKey, requestId }) {
  const token = getBearerToken(request);
  const schedulerSecret = cleanJwtCredential(process.env.SOCIAL_RESOURCE_WATCHDOG_SECRET || process.env.CRON_SECRET || process.env.WATCHDOG_SECRET);
  if (token && (token === schedulerSecret || token === serviceRoleKey || jwtRole(token) === 'service_role')) {
    return { ok: true, actor: { type: 'scheduled', name: 'Vigilancia automatica diaria' } };
  }

  if (!isJwtLike(token)) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sesion o token de vigilancia requerido.' };
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesion no valida o caducada.' };
  }

  const authUser = authData.user;
  let { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('id,email,auth_user_id,first_name,last_name,role,is_active,status,permissions,permission_matrix')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (!profile) {
    const byEmail = await admin
      .from('app_users')
      .select('id,email,auth_user_id,first_name,last_name,role,is_active,status,permissions,permission_matrix')
      .ilike('email', String(authUser.email || '').toLowerCase())
      .maybeSingle();
    if (byEmail.error) throw byEmail.error;
    profile = byEmail.data;
  }

  if (!profile || profile.is_active === false || (profile.status || 'Activo') !== 'Activo') {
    return { ok: false, status: 403, code: 'PROFILE_NOT_ALLOWED', error: 'Usuario sin perfil activo para vigilancia.' };
  }

  if (!hasAppPermission(profile, 'social-resources', 'edit')) {
    console.warn(`${WATCHDOG_LOG_PREFIX} Permiso denegado`, { requestId, userId: profile.id, role: profile.role });
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'No tiene permisos para comprobar fuentes vigiladas.' };
  }

  return {
    ok: true,
    actor: {
      type: 'manual',
      id: profile.id,
      name: actorName(profile)
    }
  };
}

async function fetchOfficialSource(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/json, text/html;q=0.8, */*;q=0.5',
        'User-Agent': 'Mozilla/5.0 (compatible; ALTHEMON Social Resource Watchdog/1.0; +https://www.panyesperanza.org)'
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} al consultar la fuente oficial.`);
    return {
      url,
      contentType: response.headers.get('content-type') || '',
      text
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseOfficialSource(fetched, source) {
  const text = fetched.text || '';
  const contentType = fetched.contentType.toLowerCase();
  if (contentType.includes('json') || /^[\s\r\n]*[\[{]/.test(text)) {
    return parseJsonCandidates(text, fetched.url, source);
  }
  if (contentType.includes('xml') || contentType.includes('rss') || /<(rss|feed)\b/i.test(text)) {
    return parseXmlCandidates(text, fetched.url, source);
  }
  return parseHtmlCandidates(text, fetched.url, source);
}

function parseJsonCandidates(text, baseUrl, source) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : findFirstArray(parsed, ['items', 'entries', 'results', 'data', 'records', 'convocatorias', 'ayudas']);
  return (items || []).map((item) => normalizeObjectCandidate(item, baseUrl, source)).filter(Boolean);
}

function parseXmlCandidates(text, baseUrl, source) {
  const blocks = [...text.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  return blocks.map((block) => {
    const title = readXmlTag(block, ['title', 'name']);
    const linkHref = readXmlAttribute(block, 'link', 'href');
    const url = resolveUrl(linkHref || readXmlTag(block, ['link', 'guid', 'id']), baseUrl);
    const summary = readXmlTag(block, ['description', 'summary', 'content', 'subtitle']);
    const date = readXmlTag(block, ['pubDate', 'published', 'updated', 'date']);
    return normalizeCandidate({ title, url, summary, publishedAt: date, raw: { title, url, summary, date } }, source);
  }).filter(Boolean);
}

function parseHtmlCandidates(text, baseUrl, source) {
  const candidates = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(text)) && candidates.length < MAX_CANDIDATES_PER_SOURCE * 2) {
    const href = resolveUrl(match[1], baseUrl);
    const title = stripHtml(match[2]);
    const haystack = normalizeSearch(`${title} ${href}`);
    if (!title || !RESOURCE_KEYWORDS.some((keyword) => haystack.includes(normalizeSearch(keyword)))) continue;
    candidates.push(normalizeCandidate({
      title,
      url: href,
      summary: title,
      raw: { title, url: href }
    }, source));
  }
  return uniqueCandidates(candidates);
}

function normalizeObjectCandidate(item, baseUrl, source) {
  const title = pickText(item, ['title', 'titulo', 'name', 'nombre', 'subject', 'descripcion', 'description']);
  const url = resolveUrl(pickText(item, ['url', 'link', 'html_url', 'web_url', 'official_url', 'enlace']), baseUrl);
  const summary = pickText(item, ['summary', 'description', 'descripcion', 'extract', 'resumen', 'body']);
  return normalizeCandidate({
    title,
    url,
    summary,
    requirements: pickText(item, ['requirements', 'requisitos']),
    requiredDocuments: pickText(item, ['required_documents', 'documentacion', 'documentación']),
    benefit: pickText(item, ['benefit', 'importe', 'cuantia', 'cuantía']),
    opensAt: pickText(item, ['opens_at', 'fecha_apertura', 'start_date']),
    deadlineAt: pickText(item, ['deadline_at', 'fecha_limite', 'fecha_límite', 'end_date', 'plazo_fin']),
    publishedAt: pickText(item, ['published_at', 'created_at', 'updated_at', 'date', 'fecha']),
    raw: item
  }, source);
}

function normalizeCandidate(candidate, source) {
  const title = cleanText(candidate.title);
  const url = cleanText(candidate.url || source.official_url);
  if (!title || !url) return null;
  const summary = cleanText(candidate.summary);
  return {
    ...candidate,
    title,
    url,
    summary,
    contentHash: `${title}|${url}|${summary}|${cleanText(candidate.deadlineAt)}|${cleanText(candidate.benefit)}`
  };
}

function inferDetectionType(candidate, duplicate) {
  const text = normalizeSearch(`${candidate.title} ${candidate.summary} ${candidate.requirements} ${candidate.requiredDocuments} ${candidate.benefit}`);
  if (hasAny(text, ['ampliacion', 'ampliación', 'prorroga', 'prórroga'])) return 'Ampliacion de plazo';
  if (hasAny(text, ['cierre', 'cerrada', 'finalizada', 'finalizacion', 'caducidad'])) return 'Cierre/caducidad';
  if (hasAny(text, ['apertura', 'plazo abierto', 'abre plazo', 'abierto plazo'])) return 'Apertura de plazo';
  if (hasAny(text, ['documentacion', 'documentación', 'documentos'])) return 'Cambio de documentacion';
  if (hasAny(text, ['importe', 'cuantia', 'cuantía', 'euros', '€'])) return 'Cambio de importe';
  if (hasAny(text, ['requisito', 'requisitos', 'condiciones'])) return 'Cambio de requisitos';
  return duplicate ? 'Cambio de requisitos' : 'Nueva convocatoria';
}

function inferChangedFields(candidate, detectionType) {
  const fields = new Set();
  if (candidate.requirements || detectionType === 'Cambio de requisitos') fields.add('requirements');
  if (candidate.requiredDocuments || detectionType === 'Cambio de documentacion') fields.add('required_documents');
  if (candidate.benefit || detectionType === 'Cambio de importe') fields.add('benefit');
  if (candidate.deadlineAt || ['Apertura de plazo', 'Ampliacion de plazo', 'Cierre/caducidad'].includes(detectionType)) fields.add('deadline_at');
  if (!fields.size) fields.add('description');
  return [...fields];
}

function buildChangeSummary(candidate, detectionType, source) {
  const summary = cleanText(candidate.summary);
  const suffix = summary ? ` ${summary}` : '';
  return `${detectionType} detectada desde ${source.name}.${suffix}`.slice(0, 1000);
}

function inferCategory(text) {
  const normalized = normalizeSearch(text);
  if (hasAny(normalized, ['alimento', 'comedor', 'alimentacion'])) return 'Alimentacion';
  if (hasAny(normalized, ['vivienda', 'alquiler', 'habitacional'])) return 'Vivienda';
  if (hasAny(normalized, ['empleo', 'trabajo', 'laboral'])) return 'Empleo';
  if (hasAny(normalized, ['formacion', 'curso', 'certificado'])) return 'Formacion';
  if (hasAny(normalized, ['menor', 'infancia', 'familia'])) return 'Infancia y familia';
  if (hasAny(normalized, ['mayores', 'dependencia'])) return 'Personas mayores';
  if (hasAny(normalized, ['discapacidad'])) return 'Discapacidad';
  if (hasAny(normalized, ['extranj', 'arraigo', 'asilo'])) return 'Extranjeria';
  if (hasAny(normalized, ['juridic', 'legal'])) return 'Asesoramiento juridico';
  if (hasAny(normalized, ['salud', 'sanitario'])) return 'Salud';
  if (hasAny(normalized, ['ayuda economica', 'prestacion', 'renta', 'subvencion'])) return 'Ayudas economicas';
  return 'Otros';
}

function findDuplicateResource(resources, officialUrl, title, source) {
  const url = cleanText(officialUrl).toLowerCase();
  if (url) {
    const byUrl = resources.find((resource) => cleanText(resource.official_url || resource.web_url).toLowerCase() === url);
    if (byUrl) return byUrl;
  }
  const normalizedTitle = normalizeSearch(title);
  const sourceOrg = normalizeSearch(source.organization_name || source.name);
  return resources.find((resource) => normalizeSearch(resource.name) === normalizedTitle && normalizeSearch(resource.organization_name) === sourceOrg) || null;
}

function pickPreviousData(resource = {}) {
  return {
    name: resource.name || '',
    organization_name: resource.organization_name || '',
    official_url: resource.official_url || resource.web_url || '',
    status: resource.status || '',
    requirements: resource.requirements || '',
    required_documents: resource.required_documents || '',
    benefit: resource.benefit || '',
    deadline_at: resource.deadline_at || ''
  };
}

async function finishSourceCheck(admin, source, status, error) {
  const finishedAt = new Date();
  await updateSourceCheck(admin, source, {
    last_checked_at: finishedAt.toISOString(),
    next_check_at: nextCheckAt(source, finishedAt),
    last_check_finished_at: finishedAt.toISOString(),
    last_check_status: status,
    last_check_error: cleanText(error)
  });
}

async function updateSourceCheck(admin, source, payload) {
  const { error } = await admin
    .from('social_resource_sources')
    .update(payload)
    .eq('id', source.id);
  if (error) throw error;
}

function isSourceDue(source, now) {
  if (source.next_check_at) return new Date(source.next_check_at).getTime() <= now.getTime();
  if (!source.last_checked_at) return true;
  return new Date(nextCheckAt(source, new Date(source.last_checked_at))).getTime() <= now.getTime();
}

function nextCheckAt(source, baseDate) {
  const days = Math.max(Number(source.check_frequency_days || 1), 1);
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function resolveSourceUrl(source) {
  const preferred = ['api', 'feed'].includes(source.access_method) && source.feed_url ? source.feed_url : source.official_url;
  try {
    return new URL(preferred).toString();
  } catch {
    return '';
  }
}

function findFirstArray(object, keys) {
  if (!object || typeof object !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(object[key])) return object[key];
  }
  return Object.values(object).find(Array.isArray) || [];
}

function readXmlTag(block, tags) {
  for (const tag of tags) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = String(block || '').match(pattern);
    const value = cleanText(decodeXml(stripCdata(match?.[1] || '')));
    if (value) return value;
  }
  return '';
}

function readXmlAttribute(block, tag, attribute) {
  const pattern = new RegExp(`<${tag}\\b[^>]*\\s${attribute}=["']([^"']+)["'][^>]*>`, 'i');
  return cleanText(String(block || '').match(pattern)?.[1] || '');
}

function stripCdata(value) {
  return String(value || '').replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickText(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== '') return cleanText(value);
  }
  return '';
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(cleanText(value), baseUrl).toString();
  } catch {
    return '';
  }
}

function stripHtml(value) {
  return cleanText(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.url}|${normalizeSearch(candidate.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fieldLabel(field) {
  const labels = {
    requirements: 'Requisitos',
    required_documents: 'Documentacion',
    benefit: 'Importe/beneficio',
    deadline_at: 'Plazo',
    description: 'Descripcion'
  };
  return labels[field] || field;
}

function actorName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario';
}

function getBearerToken(request) {
  const header = getHeader(request, 'authorization');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return cleanJwtCredential(match?.[1] || '');
}

function getHeader(request, name) {
  if (typeof request.headers?.get === 'function') return String(request.headers.get(name) || '');
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.[name.toUpperCase()] || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function isJwtLike(token) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function jwtRole(token) {
  if (!isJwtLike(token)) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return cleanText(payload.role);
  } catch {
    return '';
  }
}

function hasAny(text, values) {
  return values.some((value) => text.includes(normalizeSearch(value)));
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanText(value) {
  return String(value || '').trim();
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sendJson(response, status, payload) {
  return response.status(status).send(JSON.stringify(payload));
}
