import { RecursoRepository } from "../RecursoRepository.js";
import {
  createSupabaseRestClient,
  hasSupabaseConfig,
} from "../../../services/supabase/client.js";
import {
  resourceCategoryLabels,
  resourceFallbackUrl,
  resourceProvinceLabels,
} from "../../../services/coreData.js";
import { isValidDateString } from "../../../services/utils.js";

/**
 * Adapter for resources published by the ERP Social Resources Center.
 * It reads a sanitized public view, never beneficiary compatibility or follow-up data.
 */
export class ErpSupabaseResourceAdapter extends RecursoRepository {
  constructor({ client = null, mapper = null } = {}) {
    super();
    this.client = client || (hasSupabaseConfig() ? createSupabaseRestClient() : null);
    this.mapper = mapper || mapSupabaseResourceRow;
  }

  async list() {
    if (!this.client) {
      return [];
    }

    const rows = await this.client.rest("public_social_resources", {
      query: "?select=*&order=public_web_featured.desc.nullslast,deadline_at.asc.nullslast,created_at.desc",
    });

    return normalizeResourceCollection((rows || []).map(this.mapper));
  }

  async listPublished() {
    return this.list();
  }

  normalizeUrl(url) {
    const trimmedUrl = typeof url === "string" ? url.trim() : "";

    if (!trimmedUrl) {
      return this.getFallbackUrl();
    }

    if (trimmedUrl.startsWith("/") || trimmedUrl.startsWith("#")) {
      return trimmedUrl;
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      const allowedProtocols = ["http:", "https:", "mailto:", "tel:"];

      return allowedProtocols.includes(parsedUrl.protocol) ? parsedUrl.href : "";
    } catch {
      return "";
    }
  }

  getFallbackUrl() {
    return resourceFallbackUrl;
  }
}

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

    return allowedProtocols.includes(parsedUrl.protocol) ? parsedUrl.href : "";
  } catch {
    return "";
  }
};

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const categoryAliases = {
  ayuda: "ayudas",
  "ayuda-social": "ayudas",
  "ayudas-economicas": "ayudas-economicas",
  "infancia-y-familia": "infancia-familia",
  "personas-mayores": "personas-mayores",
  "asesoramiento-juridico": "asesoramiento-juridico",
  "recursos-municipales": "recursos-municipales",
};

const normalizeCategorySlug = (value) => {
  const slug = slugify(value);
  return categoryAliases[slug] || slug;
};

const scopeLabels = {
  municipal: "Municipal",
  autonomico: "Autonomico",
  estatal: "Estatal",
  privado: "Privado",
};

const statusLabels = {
  Activo: "Convocatoria abierta",
  Proximamente: "Proximamente",
  Cerrado: "Cerrado",
  "Pendiente de verificar": "Pendiente de verificar",
};

const formatPublicDate = (value) => {
  if (!isValidDateString(value)) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
  } catch {
    return String(value).slice(0, 10);
  }
};

const daysUntil = (value) => {
  if (!isValidDateString(value)) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
};

const normalizeResource = (resource) => {
  const categorySlug = normalizeCategorySlug(resource?.category);
  const category = resourceCategoryLabels[categorySlug] ? categorySlug : "otros";
  const province = resourceProvinceLabels[resource?.province] ? resource.province : "madrid";
  const rawOfficialUrl = typeof resource?.officialUrl === "string" ? resource.officialUrl.trim() : "";
  const createdAt = isValidDateString(resource?.createdAt)
    ? resource.createdAt
    : new Date().toISOString();
  const updatedAt = isValidDateString(resource?.updatedAt) ? resource.updatedAt : createdAt;

  return {
    id: typeof resource?.id === "string" && resource.id ? resource.id : "",
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
    organization: typeof resource?.organization === "string" ? resource.organization.trim() : "",
    requirements: typeof resource?.requirements === "string" ? resource.requirements.trim() : "",
    deadlineAt: resource?.deadlineAt || "",
    opensAt: resource?.opensAt || "",
    deadlineLabel: resource?.deadlineLabel || "",
    opensLabel: resource?.opensLabel || "",
    applicationMethod:
      typeof resource?.applicationMethod === "string" ? resource.applicationMethod.trim() : "",
    officialUrl: rawOfficialUrl ? normalizeResourceUrl(rawOfficialUrl) : "",
    status: resource?.status || "Activo",
    statusLabel: resource?.statusLabel || statusLabels[resource?.status] || "Activo",
    scope: resource?.scope || "",
    scopeLabel: resource?.scopeLabel || scopeLabels[resource?.scope] || resource?.scope || "",
    isNew: Boolean(resource?.isNew),
    isClosingSoon: Boolean(resource?.isClosingSoon),
    createdAt,
    updatedAt,
  };
};

const normalizeResourceCollection = (resources) =>
  (Array.isArray(resources) ? resources : [])
    .map(normalizeResource)
    .filter((resource) => resource.id && resource.title && resource.description);

const mapSupabaseResourceRow = (row) => {
  const createdDays = daysUntil(row.created_at);
  const deadlineDays = daysUntil(row.deadline_at);
  const isNew = createdDays !== null && createdDays >= -30;
  const isClosingSoon = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 15;
  const status = row.status || "Activo";
  const category = normalizeCategorySlug(row.category);
  const scopeLabel = scopeLabels[row.scope] || row.scope || "";
  const tags = [
    statusLabels[status] || status,
    scopeLabel,
    row.municipality,
    isNew ? "Nueva convocatoria" : "",
    isClosingSoon ? "Proxima a cerrar" : "",
    row.public_web_featured ? "Destacado" : "",
  ].filter(Boolean);

  return {
    id: row.id,
    title: row.name,
    description: row.description,
    category,
    categoryLabel: row.category,
    province: row.scope === "estatal" ? "nacional" : "madrid",
    provinceLabel: scopeLabel || row.municipality,
    typeLabel: row.organization_name || "Recurso",
    tags,
    url: row.official_url || row.web_url || resourceFallbackUrl,
    published: true,
    featured: row.public_web_featured,
    organization: row.organization_name,
    requirements: row.requirements,
    deadlineAt: row.deadline_at,
    opensAt: row.opens_at,
    deadlineLabel: row.deadline_at ? formatPublicDate(row.deadline_at) : "Sin fecha limite",
    opensLabel: row.opens_at ? formatPublicDate(row.opens_at) : "",
    applicationMethod: row.application_method,
    officialUrl: row.official_url || row.web_url || "",
    status,
    statusLabel: statusLabels[status] || status,
    scope: row.scope,
    scopeLabel,
    isNew,
    isClosingSoon,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
};
