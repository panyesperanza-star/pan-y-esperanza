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
 * Adapter for resources published by the official ERP through Supabase.
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

    const rows = await this.client.rest("recursos", {
      query: "?select=*&publicado=eq.true&status=eq.published&order=sort_order.asc,created_at.desc",
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

const normalizeResource = (resource) => {
  const category = resourceCategoryLabels[resource?.category] ? resource.category : "ayudas";
  const province = resourceProvinceLabels[resource?.province] ? resource.province : "madrid";
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
    createdAt,
    updatedAt,
  };
};

const normalizeResourceCollection = (resources) =>
  (Array.isArray(resources) ? resources : [])
    .map(normalizeResource)
    .filter((resource) => resource.id && resource.title && resource.description);

const mapSupabaseResourceRow = (row) => ({
  id: row.id,
  title: row.titulo,
  description: row.descripcion,
  category: row.categoria_slug,
  categoryLabel: row.categoria_nombre,
  province: row.provincia_slug || row.provincia,
  provinceLabel: row.provincia_nombre,
  typeLabel: row.tipo,
  tags: row.etiquetas || [],
  url: row.url,
  published: row.publicado && row.status === "published",
  featured: row.destacado || row.es_destacado,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
