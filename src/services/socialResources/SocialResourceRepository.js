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

  async upsertLink(payload) {
    if (this.repository.supabase) {
      const { data, error } = await this.repository.supabase
        .from('beneficiary_social_resources')
        .upsert(payload, { onConflict: 'beneficiary_id,resource_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const links = await this.repository.list('beneficiary_social_resources');
    const current = links.find((item) => item.beneficiary_id === payload.beneficiary_id && item.resource_id === payload.resource_id);
    return current
      ? this.repository.update('beneficiary_social_resources', current.id, payload)
      : this.repository.create('beneficiary_social_resources', payload);
  }

  async updateLink(id, payload) {
    return this.repository.update('beneficiary_social_resources', id, payload);
  }

  async deleteLink(id) {
    return this.repository.remove('beneficiary_social_resources', id);
  }

  async replacePortalAudience(resourceId, beneficiaryIds = [], context = {}) {
    const rows = [...new Set((beneficiaryIds || []).filter(Boolean))].map((beneficiaryId) => ({
      resource_id: resourceId,
      beneficiary_id: beneficiaryId,
      created_by: context.userId || null,
      created_at: context.now || new Date().toISOString()
    }));

    if (this.repository.supabase) {
      const deleteResult = await this.repository.supabase
        .from('social_resource_portal_beneficiaries')
        .delete()
        .eq('resource_id', resourceId);
      if (deleteResult.error) throw deleteResult.error;
      if (!rows.length) return [];
      const { data, error } = await this.repository.supabase
        .from('social_resource_portal_beneficiaries')
        .insert(rows)
        .select();
      if (error) throw error;
      return data || [];
    }

    const currentRows = await this.repository.list('social_resource_portal_beneficiaries');
    const resourceRows = currentRows.filter((item) => item.resource_id === resourceId);
    await Promise.all(resourceRows.map((item) => this.repository.remove('social_resource_portal_beneficiaries', item.id)));
    const created = [];
    for (const row of rows) {
      created.push(await this.repository.create('social_resource_portal_beneficiaries', row));
    }
    return created;
  }

  async createFollowup(payload) {
    return this.repository.create('social_resource_followups', payload);
  }

  async createHistory(payload) {
    return this.repository.create('social_resource_history', payload);
  }

  async createSource(payload) {
    return this.repository.create('social_resource_sources', payload);
  }

  async updateSource(id, payload) {
    return this.repository.update('social_resource_sources', id, payload);
  }

  async deleteSource(id) {
    return this.repository.remove('social_resource_sources', id);
  }

  async createDetection(payload) {
    return this.repository.create('social_resource_detections', payload);
  }

  async updateDetection(id, payload) {
    return this.repository.update('social_resource_detections', id, payload);
  }
}
