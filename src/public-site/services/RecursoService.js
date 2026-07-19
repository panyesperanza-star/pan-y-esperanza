import { createRepository } from "./repositories/createRepository.js";
import {
  resourceCategoryLabels,
  resourceFallbackUrl,
  resourceProvinceLabels,
  storageKeys,
} from "./coreData.js";
import { createEntityId, isValidDateString } from "./utils.js";

const resourceCollaborators = [
  {
    id: "empresa-formacion",
    name: "Entidad formativa colaboradora",
    type: "Formacion",
    description: "Colabora aportando cursos, orientacion y oportunidades de aprendizaje.",
    status: "Activa",
    state: "published",
  },
  {
    id: "empresa-empleo",
    name: "Red de empleo local",
    type: "Empleo",
    description: "Comparte ofertas, recursos y programas de insercion laboral.",
    status: "Activa",
    state: "published",
  },
  {
    id: "empresa-ayudas",
    name: "Asesoria social colaboradora",
    type: "Ayudas",
    description: "Ayuda a revisar tramites, prestaciones y documentacion habitual.",
    status: "Seguimiento",
    state: "featured",
  },
];

const baseResources = [
  {
    id: "rec-curso-informatica",
    title: "Curso gratuito de informatica",
    description: "Formacion basica para mejorar competencias digitales, buscar empleo, hacer tramites y usar herramientas cotidianas.",
    category: "formacion",
    province: "nacional",
    typeLabel: "Curso",
    tags: ["Gratuito", "Online"],
    url: resourceFallbackUrl,
    published: true,
    featured: true,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "rec-ingreso-minimo-vital",
    title: "Solicitar el Ingreso Minimo Vital",
    description: "Orientacion sobre requisitos, documentacion habitual y pasos para iniciar la solicitud del Ingreso Minimo Vital.",
    category: "ayudas",
    province: "nacional",
    typeLabel: "Ayuda",
    tags: ["Gratuito", "Online"],
    url: resourceFallbackUrl,
    published: true,
    featured: true,
    createdAt: "2026-07-02T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
  },
  {
    id: "rec-empleo-madrid",
    title: "Portal de empleo Comunidad de Madrid",
    description: "Acceso a ofertas, orientacion laboral y servicios publicos de empleo disponibles en la Comunidad de Madrid.",
    category: "empleo",
    province: "madrid",
    typeLabel: "Empleo",
    tags: ["Gratuito", "Madrid"],
    url: resourceFallbackUrl,
    published: true,
    featured: true,
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
  },
  {
    id: "rec-bono-social",
    title: "Bono Social electrico",
    description: "Informacion para revisar requisitos y solicitar el descuento en la factura electrica destinado a hogares vulnerables.",
    category: "tramites",
    province: "nacional",
    typeLabel: "Ayuda",
    tags: ["Gratuito", "Online"],
    url: resourceFallbackUrl,
    published: true,
    featured: false,
    createdAt: "2026-07-04T09:00:00.000Z",
    updatedAt: "2026-07-04T09:00:00.000Z",
  },
  {
    id: "rec-certificados-profesionalidad",
    title: "Certificados de profesionalidad",
    description: "Programas oficiales para acreditar competencias profesionales y mejorar oportunidades laborales en distintos sectores.",
    category: "formacion",
    province: "madrid",
    typeLabel: "Formacion",
    tags: ["Gratuito", "Madrid"],
    url: resourceFallbackUrl,
    published: true,
    featured: false,
    createdAt: "2026-07-05T09:00:00.000Z",
    updatedAt: "2026-07-05T09:00:00.000Z",
  },
  {
    id: "rec-ayudas-alquiler",
    title: "Ayudas al alquiler",
    description: "Informacion sobre convocatorias y documentacion habitual para ayudas al alquiler de vivienda en la Comunidad de Madrid.",
    category: "vivienda",
    province: "madrid",
    typeLabel: "Ayuda",
    tags: ["Gratuito", "Online", "Madrid"],
    url: resourceFallbackUrl,
    published: true,
    featured: false,
    createdAt: "2026-07-06T09:00:00.000Z",
    updatedAt: "2026-07-06T09:00:00.000Z",
  },
  {
    id: "rec-tarjeta-sanitaria",
    title: "Tarjeta sanitaria y cita previa",
    description: "Orientacion para gestionar la tarjeta sanitaria, pedir cita y localizar servicios de atencion primaria en Madrid.",
    category: "salud",
    province: "madrid",
    typeLabel: "Salud",
    tags: ["Gratuito", "Online"],
    url: resourceFallbackUrl,
    published: true,
    featured: false,
    createdAt: "2026-07-07T09:00:00.000Z",
    updatedAt: "2026-07-07T09:00:00.000Z",
  },
  {
    id: "rec-apoyo-alimentario",
    title: "Apoyo alimentario y productos basicos",
    description: "Informacion para familias que necesitan orientacion sobre alimentos, productos de primera necesidad y acompanamiento.",
    category: "alimentacion",
    province: "madrid",
    typeLabel: "Alimentacion",
    tags: ["Gratuito", "Madrid"],
    url: resourceFallbackUrl,
    published: true,
    featured: false,
    createdAt: "2026-07-08T09:00:00.000Z",
    updatedAt: "2026-07-08T09:00:00.000Z",
  },
];

const normalizeResourceUrl = (url) => {
  const trimmedUrl = typeof url === "string" ? url.trim() : "";

  if (!trimmedUrl) {
    return resourceFallbackUrl;
  }

  if (trimmedUrl.startsWith("/") || trimmedUrl.startsWith("#")) {
    return trimmedUrl;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];

    if (allowedProtocols.includes(parsedUrl.protocol)) {
      return parsedUrl.href;
    }
  } catch {
    return "";
  }

  return "";
};

const parseResourceTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6);
  }

  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
};

const normalizeResource = (resource) => {
  const category = resourceCategoryLabels[resource?.category] ? resource.category : "ayudas";
  const province = resourceProvinceLabels[resource?.province] ? resource.province : "madrid";
  const createdAt = isValidDateString(resource?.createdAt)
    ? resource.createdAt
    : new Date().toISOString();
  const updatedAt = isValidDateString(resource?.updatedAt) ? resource.updatedAt : createdAt;

  return {
    id: typeof resource?.id === "string" && resource.id ? resource.id : createEntityId(),
    title: typeof resource?.title === "string" ? resource.title.trim() : "",
    description: typeof resource?.description === "string" ? resource.description.trim() : "",
    category,
    categoryLabel: resource?.categoryLabel || resourceCategoryLabels[category],
    province,
    provinceLabel: resource?.provinceLabel || resourceProvinceLabels[province],
    typeLabel: resource?.typeLabel || "Recurso",
    tags: parseResourceTags(resource?.tags),
    url: normalizeResourceUrl(resource?.url),
    published: resource?.published !== false,
    featured: Boolean(resource?.featured),
    createdAt,
    updatedAt,
  };
};

const normalizeResourceCollection = (resources) =>
  (Array.isArray(resources) ? resources : [])
    .map(normalizeResource)
    .filter((resource) => resource.title && resource.description);

const createCategoryViewModel = (resources) =>
  Object.entries(resourceCategoryLabels).map(([slug, label]) => {
    const categoryResources = resources.filter((resource) => resource.category === slug);

    return {
      slug,
      label,
      total: categoryResources.length,
      published: categoryResources.filter((resource) => resource.published).length,
      featured: categoryResources.filter((resource) => resource.featured).length,
    };
  });

const createStats = (resources) => {
  const published = resources.filter((resource) => resource.published);
  const featured = resources.filter((resource) => resource.featured);
  const categories = new Set(resources.map((resource) => resource.category)).size;
  const collaborators = resourceCollaborators.filter((collaborator) => collaborator.state === "published").length;

  return {
    total: resources.length,
    published: published.length,
    drafts: resources.length - published.length,
    featured: featured.length,
    categories,
    collaborators,
  };
};

const createSummaryCards = (stats) => [
  {
    label: "Recursos",
    value: String(stats.total),
    description: `${stats.published} publicados - ${stats.drafts} despublicados`,
  },
  {
    label: "Categorias",
    value: String(stats.categories),
    description: "Areas de ayuda disponibles",
  },
  {
    label: "Destacados",
    value: String(stats.featured),
    description: "Visibles como prioridad editorial",
  },
  {
    label: "Empresas",
    value: String(stats.collaborators),
    description: "Colaboradoras activas",
  },
];

const resourceFromRow = (row) => ({
  id: row.id,
  title: row.titulo,
  description: row.descripcion,
  category: row.categoria_slug,
  categoryLabel: row.categoria_nombre,
  province: row.provincia_slug,
  provinceLabel: row.provincia_nombre,
  typeLabel: row.tipo,
  tags: row.etiquetas || [],
  url: row.url,
  published: row.publicado,
  featured: row.destacado,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const resourceToRow = (resource) => ({
  id: resource.id,
  titulo: resource.title,
  descripcion: resource.description,
  categoria_slug: resource.category,
  categoria_nombre: resource.categoryLabel,
  provincia_slug: resource.province,
  provincia_nombre: resource.provinceLabel,
  tipo: resource.typeLabel,
  etiquetas: resource.tags || [],
  url: resource.url,
  publicado: resource.published,
  destacado: resource.featured,
  created_at: resource.createdAt,
  updated_at: new Date().toISOString(),
});

const repository = createRepository({
  storageKey: storageKeys.recursos,
  table: "recursos",
  select: "*",
  order: "created_at.desc",
  fallbackValue: baseResources,
  normalize: normalizeResourceCollection,
  fromRows: (rows) => rows.map(resourceFromRow),
  toRows: (resources) => resources.map(resourceToRow),
});

export const RecursoService = {
  storageKey: storageKeys.recursos,
  fallbackUrl: resourceFallbackUrl,
  categoryLabels: resourceCategoryLabels,
  provinceLabels: resourceProvinceLabels,
  createId: createEntityId,
  normalize: normalizeResource,
  normalizeUrl: normalizeResourceUrl,
  parseTags: parseResourceTags,
  async list() {
    return repository.read();
  },
  async listPublished() {
    const resources = await this.list();
    return resources.filter((resource) => resource.published);
  },
  async getViewModel() {
    const resources = await this.list();
    const stats = createStats(resources);

    return {
      resources,
      publishedResources: resources.filter((resource) => resource.published),
      featuredResources: resources.filter((resource) => resource.featured),
      categories: createCategoryViewModel(resources),
      collaborators: resourceCollaborators,
      stats,
      summaryCards: createSummaryCards(stats),
      repositoryReady: true,
      publicSync: {
        route: "/recursos",
        storageKey: this.storageKey,
      },
    };
  },
  async saveAll(resources) {
    return repository.write(resources);
  },
  async findById(resourceId) {
    const resources = await this.list();
    return resources.find((resource) => resource.id === resourceId) || null;
  },
};
