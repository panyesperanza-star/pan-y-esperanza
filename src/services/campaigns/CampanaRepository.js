import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class CampanaRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listCampaigns() {
    return this.repository.list('campanas');
  }

  async createCampaign(payload) {
    return this.repository.create('campanas', payload);
  }

  async updateCampaign(id, payload) {
    return this.repository.update('campanas', id, payload);
  }

  async listRelations(table) {
    return this.repository.list(table).catch(() => []);
  }

  async replaceRelations(table, campaignId, relationKey, ids = []) {
    const current = await this.listRelations(table);
    for (const relation of current.filter((item) => item.campaign_id === campaignId)) {
      await this.repository.remove(table, relation.id);
    }
    for (const id of ids.filter(Boolean)) {
      await this.repository.create(table, {
        campaign_id: campaignId,
        [relationKey]: id
      });
    }
  }

  async replaceCampaignLinks(campaignId, links = {}) {
    await this.replaceRelations('campana_beneficiarios', campaignId, 'beneficiary_id', links.beneficiary_ids || []);
    await this.replaceRelations('campana_productos', campaignId, 'product_id', links.product_ids || []);
    await this.replaceRelations('campana_voluntarios', campaignId, 'volunteer_id', links.volunteer_ids || []);
    await this.replaceRelations('campana_entregas', campaignId, 'delivery_id', links.delivery_ids || []);
    await this.replaceRelations('campana_agenda_eventos', campaignId, 'agenda_event_id', links.agenda_event_ids || []);
  }
}
