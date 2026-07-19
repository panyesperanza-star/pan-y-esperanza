import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class VoluntarioRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listVolunteers() {
    return this.repository.list('volunteers');
  }

  async createVolunteer(payload) {
    return this.repository.create('volunteers', payload);
  }

  async updateVolunteer(id, payload) {
    return this.repository.update('volunteers', id, payload);
  }

  async removeVolunteer(id) {
    return this.repository.remove('volunteers', id);
  }

  async listHistory() {
    return this.repository.list('volunteer_history');
  }

  async createHistory(payload) {
    return this.repository.create('volunteer_history', payload);
  }

  async updateHistory(id, payload) {
    return this.repository.update('volunteer_history', id, payload);
  }

  async removeHistory(id) {
    return this.repository.remove('volunteer_history', id);
  }
}
