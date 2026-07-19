import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class DonacionRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async createDonation(payload) {
    return this.repository.create('donations', payload);
  }

  async updateDonation(id, payload) {
    return this.repository.update('donations', id, payload);
  }

  async removeDonation(id) {
    return this.repository.remove('donations', id);
  }

  async listDonorContacts() {
    return this.repository.list('accounting_contacts');
  }

  async createDonorContact(payload) {
    return this.repository.create('accounting_contacts', payload);
  }

  async updateDonorContact(id, payload) {
    return this.repository.update('accounting_contacts', id, payload);
  }

  async removeDonorContact(id) {
    return this.repository.remove('accounting_contacts', id);
  }
}
