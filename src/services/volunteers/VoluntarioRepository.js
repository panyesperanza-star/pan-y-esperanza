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

  async createDocument(payload) {
    return this.repository.create('volunteer_documents', payload);
  }

  async updateDocument(id, payload) {
    return this.repository.update('volunteer_documents', id, payload);
  }

  async removeDocument(id) {
    return this.repository.remove('volunteer_documents', id);
  }

  async createTraining(payload) {
    return this.repository.create('volunteer_training', payload);
  }

  async updateTraining(id, payload) {
    return this.repository.update('volunteer_training', id, payload);
  }

  async removeTraining(id) {
    return this.repository.remove('volunteer_training', id);
  }

  async createTimeEntry(payload) {
    return this.repository.create('volunteer_time_entries', payload);
  }

  async updateTimeEntry(id, payload) {
    return this.repository.update('volunteer_time_entries', id, payload);
  }

  async createTimeEntryCorrection(payload) {
    return this.repository.create('volunteer_time_entry_corrections', payload);
  }
}
