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

  async createDonationProduct(payload) {
    return this.repository.create('donation_products', payload);
  }

  async updateDonationProduct(id, payload) {
    return this.repository.update('donation_products', id, payload);
  }

  async listDonorContacts() {
    return this.repository.list('accounting_contacts');
  }

  async listDonors() {
    return this.repository.list('donors');
  }

  async createDonor(payload) {
    return this.repository.create('donors', payload);
  }

  async updateDonor(id, payload) {
    return this.repository.update('donors', id, payload);
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

  async listCollaborators() {
    return this.repository.list('collaborators');
  }

  async createCollaborator(payload) {
    return this.repository.create('collaborators', payload);
  }

  async updateCollaborator(id, payload) {
    return this.repository.update('collaborators', id, payload);
  }
}
