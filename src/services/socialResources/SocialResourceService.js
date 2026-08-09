import { analyzeResourceCompatibility } from '../../lib/socialResourceRecommendations';

export const SOCIAL_RESOURCE_CATEGORIES = [
  'Alimentación',
  'Vivienda',
  'Empleo',
  'Formación',
  'Ayudas económicas',
  'Infancia y familia',
  'Personas mayores',
  'Discapacidad',
  'Extranjería',
  'Asesoramiento jurídico',
  'Salud',
  'Recursos municipales',
  'Otros'
];

export const SOCIAL_RESOURCE_STATUSES = ['Activo', 'Proximamente', 'Cerrado', 'Pendiente de verificar'];
export const SOCIAL_RESOURCE_SCOPES = ['municipal', 'autonomico', 'estatal', 'privado'];
export const SOCIAL_RESOURCE_SOURCE_TYPES = ['estado_ministerio', 'comunidad_madrid', 'ayuntamiento_madrid', 'organismo_publico', 'otra_fuente_oficial'];
export const SOCIAL_RESOURCE_SOURCE_STATUSES = ['Activa', 'Pausada', 'Archivada'];
export const SOCIAL_RESOURCE_SOURCE_ACCESS_METHODS = ['api', 'feed', 'web_oficial', 'manual'];
export const SOCIAL_RESOURCE_DETECTION_TYPES = [
  'Nueva convocatoria',
  'Apertura de plazo',
  'Cambio de requisitos',
  'Cambio de importe',
  'Cambio de documentacion',
  'Ampliacion de plazo',
  'Cierre/caducidad'
];
export const SOCIAL_RESOURCE_DETECTION_STATUSES = ['Pendiente de revision', 'Aprobada', 'Descartada'];
export const SOCIAL_RESOURCE_PORTAL_SCOPES = ['none', 'all', 'compatible', 'selected'];

export const BENEFICIARY_RESOURCE_STATUSES = [
  'saved',
  'interested',
  'started',
  'documents_pending',
  'submitted',
  'granted',
  'denied',
  'not_applicable'
];

const RESOURCE_HISTORY_FIELDS = {
  requirements: 'Requisitos',
  deadline_at: 'Plazo',
  benefit: 'Importe/beneficio',
  required_documents: 'Documentacion',
  status: 'Estado',
  publish_in_beneficiary_portal: 'Publicacion en portal',
  visible_to_all_beneficiaries: 'Visible para todos los beneficiarios',
  portal_visibility_scope: 'Visibilidad en portal',
  official_url: 'URL oficial',
  last_verified_at: 'Fecha de comprobacion',
  organization_name: 'Organismo responsable',
  target_audience: 'A quien va dirigido',
  opens_at: 'Fecha de apertura'
};

function cleanText(value) {
  return String(value || '').trim();
}

function cleanDate(value) {
  return value ? String(value).slice(0, 10) : null;
}

function cleanDateTime(value) {
  return value ? String(value) : null;
}

function cleanInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function cleanBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === 'on' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return Boolean(fallback);
}

function pickAllowed(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanUuid(value) {
  return value ? String(value) : null;
}

function nowISO() {
  return new Date().toISOString();
}

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function portalScopeLabel(scope) {
  const labels = {
    all: 'todos los beneficiarios',
    compatible: 'solo beneficiarios compatibles',
    selected: 'beneficiarios seleccionados',
    none: 'no publicado'
  };
  return labels[scope] || 'no publicado';
}

export function sanitizeSocialResourcePayload(payload = {}, current = {}, context = {}) {
  const name = cleanText(payload.name ?? current.name);
  if (name.length < 3) throw new Error('El nombre del recurso es obligatorio.');

  const organizationName = cleanText(payload.organization_name ?? current.organization_name);
  if (organizationName.length < 2) throw new Error('El organismo o entidad es obligatorio.');

  const category = pickAllowed(cleanText(payload.category ?? current.category), SOCIAL_RESOURCE_CATEGORIES, 'Otros');
  const status = pickAllowed(cleanText(payload.status ?? current.status), SOCIAL_RESOURCE_STATUSES, 'Activo');
  const scope = pickAllowed(cleanText(payload.scope ?? current.scope), SOCIAL_RESOURCE_SCOPES, 'municipal');
  const portalVisibilityScope = resolvePortalVisibilityScope(payload, current);
  const now = context.now || nowISO();
  const officialUrl = cleanText(payload.official_url ?? current.official_url);
  const lastVerifiedAt = cleanDate(payload.last_verified_at ?? current.last_verified_at);
  const shouldStampVerifier = Boolean(officialUrl && lastVerifiedAt) && (
    cleanText(current.official_url) !== officialUrl
    || cleanDate(current.last_verified_at) !== lastVerifiedAt
    || !current.verified_by
  );

  return {
    name,
    organization_name: organizationName,
    category,
    description: cleanText(payload.description ?? current.description),
    requirements: cleanText(payload.requirements ?? current.requirements),
    target_audience: cleanText(payload.target_audience ?? current.target_audience),
    required_documents: cleanText(payload.required_documents ?? current.required_documents),
    benefit: cleanText(payload.benefit ?? current.benefit),
    opens_at: cleanDate(payload.opens_at ?? current.opens_at),
    deadline_at: cleanDate(payload.deadline_at ?? current.deadline_at),
    address: cleanText(payload.address ?? current.address),
    municipality: cleanText(payload.municipality ?? current.municipality),
    phone: cleanText(payload.phone ?? current.phone),
    email: cleanText(payload.email ?? current.email),
    web_url: cleanText(payload.web_url ?? current.web_url),
    official_url: officialUrl,
    application_method: cleanText(payload.application_method ?? current.application_method),
    status,
    scope,
    portal_visibility_scope: portalVisibilityScope,
    visible_to_all_beneficiaries: portalVisibilityScope === 'all',
    publish_in_beneficiary_portal: portalVisibilityScope !== 'none',
    last_verified_at: lastVerifiedAt,
    verified_by: shouldStampVerifier ? context.userId || null : payload.verified_by || current.verified_by || null,
    verified_by_name: shouldStampVerifier ? context.userName || '' : cleanText(payload.verified_by_name ?? current.verified_by_name),
    age_min: cleanInteger(payload.age_min ?? current.age_min),
    age_max: cleanInteger(payload.age_max ?? current.age_max),
    family_situation: cleanText(payload.family_situation ?? current.family_situation),
    employment_situation: cleanText(payload.employment_situation ?? current.employment_situation),
    housing_situation: cleanText(payload.housing_situation ?? current.housing_situation),
    notes: cleanText(payload.notes ?? current.notes),
    created_by: current.created_by || payload.created_by || context.userId || null,
    updated_by: context.userId || payload.updated_by || current.updated_by || null,
    created_at: current.created_at || payload.created_at || now,
    updated_at: now
  };
}

function resolvePortalVisibilityScope(payload = {}, current = {}) {
  const explicit = cleanText(payload.portal_visibility_scope ?? current.portal_visibility_scope);
  if (SOCIAL_RESOURCE_PORTAL_SCOPES.includes(explicit)) return explicit;
  const published = cleanBoolean(payload.publish_in_beneficiary_portal ?? current.publish_in_beneficiary_portal, false);
  const visibleToAll = cleanBoolean(payload.visible_to_all_beneficiaries ?? current.visible_to_all_beneficiaries, false);
  if (!published) return 'none';
  if (visibleToAll) return 'all';
  return 'selected';
}

function sanitizeLinkPayload(payload = {}, current = {}, context = {}) {
  const status = pickAllowed(cleanText(payload.status ?? current.status), BENEFICIARY_RESOURCE_STATUSES, current.status || 'saved');
  const now = context.now || nowISO();
  return {
    beneficiary_id: cleanText(payload.beneficiary_id ?? current.beneficiary_id),
    resource_id: cleanText(payload.resource_id ?? current.resource_id),
    status,
    observations: cleanText(payload.observations ?? current.observations),
    linked_at: current.linked_at || payload.linked_at || now,
    updated_at: now,
    created_by: current.created_by || payload.created_by || context.userId || null,
    updated_by: context.userId || payload.updated_by || current.updated_by || null
  };
}

function actorName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || 'Usuario';
}

function cleanJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

export function sanitizeSocialResourceSourcePayload(payload = {}, current = {}, context = {}) {
  const name = cleanText(payload.name ?? current.name);
  if (name.length < 3) throw new Error('El nombre de la fuente oficial es obligatorio.');
  const officialUrl = cleanText(payload.official_url ?? current.official_url);
  if (!officialUrl) throw new Error('La URL oficial es obligatoria para vigilar una fuente.');
  const now = context.now || nowISO();
  return {
    name,
    organization_name: cleanText(payload.organization_name ?? current.organization_name),
    source_type: pickAllowed(cleanText(payload.source_type ?? current.source_type), SOCIAL_RESOURCE_SOURCE_TYPES, 'organismo_publico'),
    scope: pickAllowed(cleanText(payload.scope ?? current.scope), SOCIAL_RESOURCE_SCOPES, 'municipal'),
    official_url: officialUrl,
    feed_url: cleanText(payload.feed_url ?? current.feed_url),
    access_method: pickAllowed(cleanText(payload.access_method ?? current.access_method), SOCIAL_RESOURCE_SOURCE_ACCESS_METHODS, 'web_oficial'),
    check_frequency_days: cleanInteger(payload.check_frequency_days ?? current.check_frequency_days) || 7,
    status: pickAllowed(cleanText(payload.status ?? current.status), SOCIAL_RESOURCE_SOURCE_STATUSES, 'Activa'),
    last_checked_at: cleanDateTime(payload.last_checked_at ?? current.last_checked_at),
    last_check_status: cleanText(payload.last_check_status ?? current.last_check_status),
    notes: cleanText(payload.notes ?? current.notes),
    created_by: current.created_by || payload.created_by || context.userId || null,
    updated_by: context.userId || payload.updated_by || current.updated_by || null,
    created_at: current.created_at || payload.created_at || now,
    updated_at: now
  };
}

export function sanitizeSocialResourceDetectionPayload(payload = {}, current = {}, context = {}) {
  const title = cleanText(payload.title ?? current.title);
  if (title.length < 3) throw new Error('El titulo de la deteccion es obligatorio.');
  const officialUrl = cleanText(payload.official_url ?? current.official_url);
  if (!officialUrl) throw new Error('La deteccion necesita una URL oficial.');
  const now = context.now || nowISO();
  return {
    source_id: cleanUuid(payload.source_id ?? current.source_id),
    resource_id: cleanUuid(payload.resource_id ?? current.resource_id),
    duplicate_resource_id: cleanUuid(payload.duplicate_resource_id ?? current.duplicate_resource_id),
    detection_type: pickAllowed(cleanText(payload.detection_type ?? current.detection_type), SOCIAL_RESOURCE_DETECTION_TYPES, 'Nueva convocatoria'),
    status: pickAllowed(cleanText(payload.status ?? current.status), SOCIAL_RESOURCE_DETECTION_STATUSES, 'Pendiente de revision'),
    title,
    official_url: officialUrl,
    detected_at: cleanDateTime(payload.detected_at ?? current.detected_at) || now,
    detected_by: cleanText(payload.detected_by ?? current.detected_by) || 'Vigilancia oficial',
    change_summary: cleanText(payload.change_summary ?? current.change_summary),
    changed_fields: cleanJson(payload.changed_fields ?? current.changed_fields, []),
    previous_data: cleanJson(payload.previous_data ?? current.previous_data, {}),
    new_data: cleanJson(payload.new_data ?? current.new_data, {}),
    compatibility_count: cleanInteger(payload.compatibility_count ?? current.compatibility_count) || 0,
    reviewed_by: cleanUuid(payload.reviewed_by ?? current.reviewed_by),
    reviewed_by_name: cleanText(payload.reviewed_by_name ?? current.reviewed_by_name),
    reviewed_at: cleanDateTime(payload.reviewed_at ?? current.reviewed_at),
    decision: cleanText(payload.decision ?? current.decision),
    review_notes: cleanText(payload.review_notes ?? current.review_notes),
    created_at: current.created_at || payload.created_at || now,
    updated_at: now
  };
}

export class SocialResourceService {
  constructor({
    repository,
    resources = [],
    links = [],
    portalAudience = [],
    sources = [],
    detections = [],
    beneficiaries = [],
    documents = [],
    audit = async () => {},
    assertPermission = () => {},
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('SocialResourceService necesita un repository.');
    this.repository = repository;
    this.resources = resources;
    this.links = links;
    this.portalAudience = portalAudience;
    this.sources = sources;
    this.detections = detections;
    this.beneficiaries = beneficiaries;
    this.documents = documents;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.currentUser = currentUser;
  }

  async createResource(payload) {
    this.assertPermission('social-resources', 'create');
    const context = this.context();
    const created = await this.repository.createResource(sanitizeSocialResourcePayload(payload, {}, context));
    await this.recordHistory(created.id, 'created', {}, created, Object.keys(RESOURCE_HISTORY_FIELDS), context);
    await this.audit(`Centro de Recursos Sociales: creo recurso ${created.name}`.trim());
    return created;
  }

  async updateResource(id, payload) {
    this.assertPermission('social-resources', 'edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const context = this.context();
    const nextPayload = sanitizeSocialResourcePayload(payload, current, context);
    const changedFields = changedResourceFields(current, nextPayload);
    const updated = await this.repository.updateResource(id, nextPayload);
    if (changedFields.length) {
      await this.recordHistory(id, 'updated', current, updated, changedFields, context, cleanText(payload.change_reason));
    }
    await this.audit(`Centro de Recursos Sociales: actualizo recurso ${updated.name || current.name}`.trim());
    return updated;
  }

  async publishResourceToPortal(id, payload = {}) {
    this.assertPermission('social-resources', 'edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const scope = pickAllowed(cleanText(payload.portal_visibility_scope), SOCIAL_RESOURCE_PORTAL_SCOPES, 'all');
    if (scope === 'none') return this.unpublishResourceFromPortal(id);
    if (scope === 'selected' && !safeArray(payload.beneficiary_ids).length) {
      throw new Error('Selecciona al menos un beneficiario para publicar el recurso.');
    }
    const context = this.context();
    const nextPayload = sanitizeSocialResourcePayload({
      ...current,
      portal_visibility_scope: scope,
      publish_in_beneficiary_portal: true,
      visible_to_all_beneficiaries: scope === 'all',
      change_reason: payload.change_reason || `Publicacion en Portal: ${portalScopeLabel(scope)}`
    }, current, context);
    const changedFields = changedResourceFields(current, nextPayload);
    const updated = await this.repository.updateResource(id, nextPayload);
    await this.repository.replacePortalAudience(id, scope === 'selected' ? safeArray(payload.beneficiary_ids) : [], context);
    if (changedFields.length) {
      await this.recordHistory(id, 'updated', current, updated, changedFields, context, payload.change_reason || `Publicacion en Portal: ${portalScopeLabel(scope)}`);
    }
    await this.audit(`Centro de Recursos Sociales: publico ${updated.name || current.name} en Portal (${portalScopeLabel(scope)})`.trim());
    return updated;
  }

  async unpublishResourceFromPortal(id) {
    this.assertPermission('social-resources', 'edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const context = this.context();
    const nextPayload = sanitizeSocialResourcePayload({
      ...current,
      portal_visibility_scope: 'none',
      publish_in_beneficiary_portal: false,
      visible_to_all_beneficiaries: false,
      change_reason: 'Retirado del Portal del Beneficiario'
    }, current, context);
    const changedFields = changedResourceFields(current, nextPayload);
    const updated = await this.repository.updateResource(id, nextPayload);
    await this.repository.replacePortalAudience(id, [], context);
    if (changedFields.length) {
      await this.recordHistory(id, 'updated', current, updated, changedFields, context, 'Retirado del Portal del Beneficiario');
    }
    await this.audit(`Centro de Recursos Sociales: retiro ${updated.name || current.name} del Portal`.trim());
    return updated;
  }

  async deleteResource(id) {
    this.assertPermission('social-resources', 'delete');
    const resource = this.findResource(id);
    if (!resource) throw new Error('El recurso no existe.');
    const hasLinks = this.links.some((link) => link.resource_id === id);
    if (hasLinks) throw new Error('No se puede eliminar un recurso vinculado a expedientes. Cambia su estado a Cerrado.');
    await this.repository.deleteResource(id);
    await this.audit(`Centro de Recursos Sociales: elimino recurso ${resource.name}`.trim());
    return true;
  }

  async saveForBeneficiary(resourceId, beneficiaryId, payload = {}) {
    this.assertPermission('social-resources', 'edit');
    const resource = this.findResource(resourceId);
    if (!resource) throw new Error('El recurso no existe.');
    if (!beneficiaryId) throw new Error('Selecciona un beneficiario para vincular el recurso.');
    const context = this.context();
    const current = this.links.find((link) => link.resource_id === resourceId && link.beneficiary_id === beneficiaryId);
    const linkPayload = sanitizeLinkPayload({
      ...payload,
      resource_id: resourceId,
      beneficiary_id: beneficiaryId,
      status: payload.status || current?.status || 'saved'
    }, current || {}, context);
    const link = current
      ? await this.repository.updateLink(current.id, linkPayload)
      : await this.repository.upsertLink(linkPayload);
    await this.repository.createFollowup({
      beneficiary_id: beneficiaryId,
      resource_id: resourceId,
      beneficiary_resource_id: link.id,
      status: linkPayload.status,
      observations: linkPayload.observations,
      user_id: this.currentUser?.id || null,
      user_name: actorName(this.currentUser),
      created_at: context.now
    });
    await this.audit(`Centro de Recursos Sociales: vinculo ${resource.name} al expediente`.trim());
    return link;
  }

  async deleteBeneficiaryLink(id) {
    this.assertPermission('social-resources', 'edit');
    await this.repository.deleteLink(id);
    await this.audit('Centro de Recursos Sociales: elimino recurso vinculado al expediente');
    return true;
  }

  async createSource(payload) {
    this.assertPermission('social-resources', 'create');
    const created = await this.repository.createSource(sanitizeSocialResourceSourcePayload(payload, {}, this.context()));
    await this.audit(`Centro de Recursos Sociales: creo fuente vigilada ${created.name}`.trim());
    return created;
  }

  async updateSource(id, payload) {
    this.assertPermission('social-resources', 'edit');
    const current = this.findSource(id);
    if (!current) throw new Error('La fuente vigilada no existe.');
    const updated = await this.repository.updateSource(id, sanitizeSocialResourceSourcePayload(payload, current, this.context()));
    await this.audit(`Centro de Recursos Sociales: actualizo fuente vigilada ${updated.name || current.name}`.trim());
    return updated;
  }

  async deleteSource(id) {
    this.assertPermission('social-resources', 'delete');
    const source = this.findSource(id);
    if (!source) throw new Error('La fuente vigilada no existe.');
    await this.repository.deleteSource(id);
    await this.audit(`Centro de Recursos Sociales: elimino fuente vigilada ${source.name}`.trim());
    return true;
  }

  async createDetection(payload) {
    this.assertPermission('social-resources', 'edit');
    const source = payload.source_id ? this.findSource(payload.source_id) : null;
    const created = await this.repository.createDetection(sanitizeSocialResourceDetectionPayload({
      ...payload,
      official_url: payload.official_url || source?.official_url || '',
      detected_by: payload.detected_by || 'Registro manual de vigilancia'
    }, {}, this.context()));
    await this.audit(`Centro de Recursos Sociales: registro deteccion pendiente ${created.title}`.trim());
    return created;
  }

  async approveDetection(id, payload = {}) {
    this.assertPermission('social-resources', 'edit');
    const detection = this.findDetection(id);
    if (!detection) throw new Error('La deteccion no existe.');
    if (detection.status !== 'Pendiente de revision') throw new Error('La deteccion ya fue revisada.');

    const context = this.context();
    const source = this.findSource(detection.source_id);
    const resourcePayload = detectionToResourcePayload(detection, source, payload.resource || {});
    const duplicate = this.findDuplicateResource(detection, resourcePayload);
    const resource = duplicate
      ? await this.updateResource(duplicate.id, { ...resourcePayload, change_reason: detection.change_summary || 'Vigilancia oficial aprobada.' })
      : await this.createResource(resourcePayload);
    const compatibilityCount = this.countCompatibleBeneficiaries(resource);
    const reviewed = await this.repository.updateDetection(id, {
      ...sanitizeSocialResourceDetectionPayload(detection, detection, context),
      status: 'Aprobada',
      resource_id: resource.id,
      duplicate_resource_id: duplicate?.id || detection.duplicate_resource_id || null,
      compatibility_count: compatibilityCount,
      reviewed_by: context.userId,
      reviewed_by_name: context.userName,
      reviewed_at: context.now,
      decision: duplicate ? 'Aprobada y actualizada' : 'Aprobada e incorporada',
      review_notes: cleanText(payload.review_notes)
    });
    await this.audit(`Centro de Recursos Sociales: aprobo deteccion ${detection.title}`.trim());
    return { detection: reviewed, resource, compatibilityCount };
  }

  async discardDetection(id, payload = {}) {
    this.assertPermission('social-resources', 'edit');
    const detection = this.findDetection(id);
    if (!detection) throw new Error('La deteccion no existe.');
    if (detection.status !== 'Pendiente de revision') throw new Error('La deteccion ya fue revisada.');
    const context = this.context();
    const discarded = await this.repository.updateDetection(id, {
      ...sanitizeSocialResourceDetectionPayload(detection, detection, context),
      status: 'Descartada',
      reviewed_by: context.userId,
      reviewed_by_name: context.userName,
      reviewed_at: context.now,
      decision: 'Descartada',
      review_notes: cleanText(payload.review_notes)
    });
    await this.audit(`Centro de Recursos Sociales: descarto deteccion ${detection.title}`.trim());
    return discarded;
  }

  context() {
    return {
      userId: this.currentUser?.id || null,
      userName: actorName(this.currentUser),
      now: nowISO()
    };
  }

  findResource(id) {
    return this.resources.find((resource) => resource.id === id);
  }

  findSource(id) {
    return this.sources.find((source) => source.id === id);
  }

  findDetection(id) {
    return this.detections.find((detection) => detection.id === id);
  }

  findDuplicateResource(detection, resourcePayload) {
    const explicitId = detection.duplicate_resource_id || detection.resource_id;
    if (explicitId) {
      const explicit = this.findResource(explicitId);
      if (explicit) return explicit;
    }
    const officialUrl = cleanText(resourcePayload.official_url || detection.official_url).toLowerCase();
    if (officialUrl) {
      const byUrl = this.resources.find((resource) => cleanText(resource.official_url || resource.web_url).toLowerCase() === officialUrl);
      if (byUrl) return byUrl;
    }
    const name = cleanText(resourcePayload.name).toLowerCase();
    const organization = cleanText(resourcePayload.organization_name).toLowerCase();
    return this.resources.find((resource) => cleanText(resource.name).toLowerCase() === name && cleanText(resource.organization_name).toLowerCase() === organization) || null;
  }

  countCompatibleBeneficiaries(resource) {
    return this.beneficiaries
      .filter((beneficiary) => beneficiary.is_active !== false)
      .filter((beneficiary) => {
        const beneficiaryDocuments = this.documents.filter((document) => document.beneficiary_id === beneficiary.id);
        const linkedResourceIds = new Set(this.links.filter((link) => link.beneficiary_id === beneficiary.id).map((link) => link.resource_id));
        const analysis = analyzeResourceCompatibility(resource, beneficiary, beneficiaryDocuments, linkedResourceIds);
        return ['high', 'possible'].includes(analysis.level.id);
      }).length;
  }

  async recordHistory(resourceId, changeType, previousData, newData, changedFields, context, reason = '') {
    await this.repository.createHistory({
      resource_id: resourceId,
      changed_by: context.userId,
      changed_by_name: context.userName,
      change_type: changeType,
      changed_fields: changedFields.map((field) => ({ field, label: RESOURCE_HISTORY_FIELDS[field] || field })),
      previous_data: pickResourceFields(previousData, changedFields),
      new_data: pickResourceFields(newData, changedFields),
      reason: cleanText(reason),
      created_at: context.now
    });
  }
}

function detectionToResourcePayload(detection, source, overrides = {}) {
  const data = cleanJson(detection.new_data, {});
  return {
    name: data.name || detection.title,
    organization_name: data.organization_name || source?.organization_name || source?.name || 'Organismo oficial',
    category: data.category || 'Otros',
    description: data.description || detection.change_summary || '',
    requirements: data.requirements || '',
    target_audience: data.target_audience || '',
    required_documents: data.required_documents || '',
    benefit: data.benefit || '',
    opens_at: data.opens_at || '',
    deadline_at: data.deadline_at || '',
    address: data.address || '',
    municipality: data.municipality || '',
    phone: data.phone || '',
    email: data.email || '',
    web_url: data.web_url || detection.official_url || source?.official_url || '',
    official_url: data.official_url || detection.official_url || source?.official_url || '',
    application_method: data.application_method || '',
    status: data.status || (detection.detection_type === 'Cierre/caducidad' ? 'Cerrado' : 'Activo'),
    scope: data.scope || source?.scope || 'municipal',
    last_verified_at: data.last_verified_at || nowISO().slice(0, 10),
    age_min: data.age_min ?? '',
    age_max: data.age_max ?? '',
    family_situation: data.family_situation || '',
    employment_situation: data.employment_situation || '',
    housing_situation: data.housing_situation || '',
    notes: data.notes || `Incorporado desde vigilancia oficial: ${source?.name || detection.detected_by || 'fuente oficial'}`,
    ...overrides
  };
}

function changedResourceFields(current, next) {
  return Object.keys(RESOURCE_HISTORY_FIELDS).filter((field) => String(current?.[field] ?? '') !== String(next?.[field] ?? ''));
}

function pickResourceFields(resource = {}, fields = []) {
  return fields.reduce((acc, field) => {
    acc[field] = resource?.[field] ?? null;
    return acc;
  }, {});
}
