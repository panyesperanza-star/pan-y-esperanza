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

function cleanInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function pickAllowed(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function nowISO() {
  return new Date().toISOString();
}

export function sanitizeSocialResourcePayload(payload = {}, current = {}, context = {}) {
  const name = cleanText(payload.name ?? current.name);
  if (name.length < 3) throw new Error('El nombre del recurso es obligatorio.');

  const organizationName = cleanText(payload.organization_name ?? current.organization_name);
  if (organizationName.length < 2) throw new Error('El organismo o entidad es obligatorio.');

  const category = pickAllowed(cleanText(payload.category ?? current.category), SOCIAL_RESOURCE_CATEGORIES, 'Otros');
  const status = pickAllowed(cleanText(payload.status ?? current.status), SOCIAL_RESOURCE_STATUSES, 'Activo');
  const scope = pickAllowed(cleanText(payload.scope ?? current.scope), SOCIAL_RESOURCE_SCOPES, 'municipal');
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

export class SocialResourceService {
  constructor({
    repository,
    resources = [],
    links = [],
    audit = async () => {},
    assertPermission = () => {},
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('SocialResourceService necesita un repository.');
    this.repository = repository;
    this.resources = resources;
    this.links = links;
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
      : await this.repository.createLink(linkPayload);
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

function changedResourceFields(current, next) {
  return Object.keys(RESOURCE_HISTORY_FIELDS).filter((field) => String(current?.[field] ?? '') !== String(next?.[field] ?? ''));
}

function pickResourceFields(resource = {}, fields = []) {
  return fields.reduce((acc, field) => {
    acc[field] = resource?.[field] ?? null;
    return acc;
  }, {});
}
