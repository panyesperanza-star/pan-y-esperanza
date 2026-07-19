/**
 * Interface contract for public resource repositories.
 *
 * Implementations must return resources using the public resource shape consumed
 * by the website, regardless of whether the origin is static data, ERP, or
 * Supabase.
 */
export class RecursoRepository {
  async list() {
    throw new Error("RecursoRepository.list must be implemented by an adapter.");
  }

  async listPublished() {
    const resources = await this.list();
    return resources.filter((resource) => resource.published);
  }

  async findById(resourceId) {
    const resources = await this.list();
    return resources.find((resource) => resource.id === resourceId) || null;
  }

  normalizeUrl(url) {
    return typeof url === "string" ? url.trim() : "";
  }

  getFallbackUrl() {
    return "/#contacto";
  }
}
