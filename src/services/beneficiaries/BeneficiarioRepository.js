import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class BeneficiarioRepository {
  constructor({ dataStore, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore });
  }

  async create(payload) {
    return this.repository.create('beneficiaries', payload);
  }

  async update(id, payload) {
    return this.repository.update('beneficiaries', id, payload);
  }

  async updateLastHelpAt(id, lastHelpAt) {
    return this.repository.update('beneficiaries', id, { last_help_at: lastHelpAt });
  }

  async remove(id) {
    return this.repository.remove('beneficiaries', id);
  }

  async createDocument(payload) {
    return this.repository.create('beneficiary_documents', payload);
  }

  async removeDocument(id) {
    return this.repository.remove('beneficiary_documents', id);
  }

  async createSocialHistory(payload) {
    return this.repository.create('social_history', payload);
  }
}
