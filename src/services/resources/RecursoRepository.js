import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class RecursoRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listResources() {
    return this.repository.list('recursos');
  }

  async listCategories() {
    return this.repository.list('categorias_recursos');
  }

  async createResource(payload) {
    return this.repository.create('recursos', payload);
  }

  async updateResource(id, payload) {
    return this.repository.update('recursos', id, payload);
  }
}
