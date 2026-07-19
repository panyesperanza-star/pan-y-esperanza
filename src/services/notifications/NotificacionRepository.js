import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class NotificacionRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async list() {
    return this.repository.list('notificaciones');
  }

  async create(payload) {
    return this.repository.create('notificaciones', payload);
  }

  async update(id, payload) {
    return this.repository.update('notificaciones', id, payload);
  }

  async markAsRead(id, payload) {
    return this.update(id, payload);
  }
}
