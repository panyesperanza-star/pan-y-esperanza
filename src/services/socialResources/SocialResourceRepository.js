import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class SocialResourceRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async createResource(payload) {
    return this.repository.create('social_resources', payload);
  }

  async updateResource(id, payload) {
    return this.repository.update('social_resources', id, payload);
  }

  async deleteResource(id) {
    return this.repository.remove('social_resources', id);
  }

  async createLink(payload) {
    return this.repository.create('beneficiary_social_resources', payload);
  }

  async updateLink(id, payload) {
    return this.repository.update('beneficiary_social_resources', id, payload);
  }

  async deleteLink(id) {
    return this.repository.remove('beneficiary_social_resources', id);
  }

  async createFollowup(payload) {
    return this.repository.create('social_resource_followups', payload);
  }

  async createHistory(payload) {
    return this.repository.create('social_resource_history', payload);
  }
}
