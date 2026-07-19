import { normalize } from '../../lib/formatters';

const RESOURCE_STATUSES = new Set(['draft', 'published', 'unpublished', 'archived']);

const STATUS_ALIASES = {
  borrador: 'draft',
  publicado: 'published',
  publicada: 'published',
  despublicado: 'unpublished',
  despublicada: 'unpublished',
  archivado: 'archived',
  archivada: 'archived'
};

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeStatus(value, fallback = 'draft') {
  const key = normalize(value);
  const status = STATUS_ALIASES[key] || key || fallback;
  return RESOURCE_STATUSES.has(status) ? status : fallback;
}

function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanText(tag)).filter(Boolean).slice(0, 12);
  }
  return String(value || '')
    .split(',')
    .map((tag) => cleanText(tag))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function sanitizeResourcePayload(payload = {}, current = {}, context = {}) {
  const titulo = cleanText(payload.titulo || payload.title || current.titulo);
  if (titulo.length < 3) throw new Error('El titulo del recurso es obligatorio.');

  const descripcion = cleanText(payload.descripcion || payload.description || current.descripcion);
  if (descripcion.length < 10) throw new Error('La descripcion del recurso debe tener al menos 10 caracteres.');

  const categoriaSlug = slugify(payload.categoria_slug || payload.category || current.categoria_slug || 'ayudas');
  const categoriaNombre = cleanText(payload.categoria_nombre || payload.categoryLabel || current.categoria_nombre || categoriaSlug);
  const provinciaSlug = slugify(payload.provincia_slug || payload.provincia || payload.province || current.provincia_slug || 'madrid');
  const provinciaNombre = cleanText(payload.provincia_nombre || payload.provinceLabel || current.provincia_nombre || provinciaSlug);
  const status = normalizeStatus(payload.status || payload.estado || current.status, current.status || 'draft');
  const now = context.now || new Date().toISOString();
  const isPublished = status === 'published';
  const destacado = normalizeBoolean(payload.destacado ?? payload.es_destacado ?? payload.featured ?? current.destacado);
  const id = cleanText(payload.id || current.id) || `rec-${crypto.randomUUID()}`;

  return {
    id,
    titulo,
    slug: cleanText(payload.slug || current.slug) || slugify(titulo),
    descripcion,
    categoria_slug: categoriaSlug,
    categoria_nombre: categoriaNombre,
    provincia_slug: provinciaSlug,
    provincia_nombre: provinciaNombre,
    provincia: provinciaSlug,
    tipo: cleanText(payload.tipo || payload.type || current.tipo || 'Recurso'),
    url: cleanText(payload.url || current.url || '/#contacto'),
    telefono: cleanText(payload.telefono || payload.phone || current.telefono),
    email: cleanText(payload.email || current.email),
    direccion: cleanText(payload.direccion || payload.address || current.direccion),
    etiquetas: parseTags(payload.etiquetas ?? payload.tags ?? current.etiquetas),
    es_gratuito: payload.es_gratuito !== undefined ? normalizeBoolean(payload.es_gratuito) : current.es_gratuito !== false,
    es_online: normalizeBoolean(payload.es_online ?? current.es_online),
    publicado: isPublished,
    destacado,
    es_destacado: destacado,
    status,
    published_at: isPublished ? (payload.published_at || current.published_at || now) : current.published_at || null,
    published_by: isPublished ? (payload.published_by || current.published_by || context.userId || null) : current.published_by || null,
    unpublished_at: status === 'unpublished' ? now : current.unpublished_at || null,
    sort_order: Number(payload.sort_order ?? current.sort_order ?? 0),
    created_at: current.created_at || payload.created_at || now,
    updated_at: now,
    created_by: current.created_by || payload.created_by || context.userId || null,
    updated_by: context.userId || payload.updated_by || null
  };
}

export class RecursoService {
  constructor({
    repository,
    resources = [],
    audit = async () => {},
    assertPermission = () => {},
    notificacionService = null,
    currentUser = null
  } = {}) {
    if (!repository) throw new Error('RecursoService necesita un repository.');
    this.repository = repository;
    this.resources = resources;
    this.audit = audit;
    this.assertPermission = assertPermission;
    this.notificacionService = notificacionService;
    this.currentUser = currentUser;
  }

  async list() {
    return this.repository.listResources();
  }

  async listPublished() {
    const resources = await this.list();
    return resources.filter((resource) => resource.publicado === true && resource.status === 'published');
  }

  async listCategories() {
    return this.repository.listCategories();
  }

  async create(payload) {
    this.assertResourcePermission('create');
    const resource = sanitizeResourcePayload(payload, {}, this.context());
    const created = await this.repository.createResource(resource);
    await this.audit(`Recursos: creo recurso ${created.titulo || resource.titulo}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'created', resource: created });
    return created;
  }

  async update(id, payload) {
    this.assertResourcePermission('edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const updated = await this.repository.updateResource(id, sanitizeResourcePayload(payload, current, this.context()));
    await this.audit(`Recursos: edito recurso ${updated.titulo || current.titulo}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'updated', resource: updated });
    return updated;
  }

  async publish(id) {
    this.assertResourcePermission('edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const updated = await this.repository.updateResource(id, sanitizeResourcePayload({ status: 'published' }, current, this.context()));
    await this.audit(`Recursos: publico recurso ${updated.titulo || current.titulo}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'published', resource: updated });
    return updated;
  }

  async unpublish(id) {
    this.assertResourcePermission('edit');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const updated = await this.repository.updateResource(id, sanitizeResourcePayload({ status: 'unpublished' }, current, this.context()));
    await this.audit(`Recursos: despublico recurso ${updated.titulo || current.titulo}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'unpublished', resource: updated });
    return updated;
  }

  async archive(id) {
    this.assertResourcePermission('delete');
    const current = this.findResource(id);
    if (!current) throw new Error('El recurso no existe.');
    const updated = await this.repository.updateResource(id, sanitizeResourcePayload({ status: 'archived' }, current, this.context()));
    await this.audit(`Recursos: archivo recurso ${updated.titulo || current.titulo}`.trim());
    await this.notificacionService?.notifyResourceChanged?.({ type: 'archived', resource: updated });
    return updated;
  }

  async remove(id) {
    return this.archive(id);
  }

  assertResourcePermission(action) {
    if (this.currentUser?.role === 'Superadministrador') return;
    try {
      this.assertPermission('resources', action);
    } catch {
      this.assertPermission('settings', action);
    }
  }

  context() {
    return {
      userId: this.currentUser?.id || null,
      now: new Date().toISOString()
    };
  }

  findResource(id) {
    return this.resources.find((resource) => resource.id === id);
  }
}
