import { RecursoService } from "../../../services/RecursoService.js";
import { RecursoRepository } from "../RecursoRepository.js";

export class StaticResourceAdapter extends RecursoRepository {
  async list() {
    return RecursoService.list();
  }

  async listPublished() {
    return RecursoService.listPublished();
  }

  async findById(resourceId) {
    return RecursoService.findById(resourceId);
  }

  normalizeUrl(url) {
    return RecursoService.normalizeUrl(url);
  }

  getFallbackUrl() {
    return RecursoService.fallbackUrl;
  }
}
