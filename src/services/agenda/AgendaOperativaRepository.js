import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export class AgendaOperativaRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listEvents() {
    return this.repository.list('agenda_operativa');
  }

  async createEvent(payload) {
    return this.repository.create('agenda_operativa', payload);
  }

  async updateEvent(id, payload) {
    return this.repository.update('agenda_operativa', id, payload);
  }

  async removeEvent(id) {
    return this.repository.remove('agenda_operativa', id);
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

  async listCampaignBeneficiaries() {
    return this.repository.list('campana_beneficiarios');
  }

  async listCampaignProducts() {
    return this.repository.list('campana_productos');
  }

  async replaceCampaignRelations(campaignId, beneficiaryIds = [], productIds = []) {
    const currentBeneficiaries = await this.listCampaignBeneficiaries().catch(() => []);
    const currentProducts = await this.listCampaignProducts().catch(() => []);

    for (const relation of currentBeneficiaries.filter((item) => item.campaign_id === campaignId)) {
      await this.repository.remove('campana_beneficiarios', relation.id);
    }
    for (const relation of currentProducts.filter((item) => item.campaign_id === campaignId)) {
      await this.repository.remove('campana_productos', relation.id);
    }

    for (const beneficiaryId of beneficiaryIds.filter(Boolean)) {
      await this.repository.create('campana_beneficiarios', {
        campaign_id: campaignId,
        beneficiary_id: beneficiaryId
      });
    }
    for (const productId of productIds.filter(Boolean)) {
      await this.repository.create('campana_productos', {
        campaign_id: campaignId,
        product_id: productId
      });
    }
  }
}
