import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export const BENEFICIARIO_PORTAL_TABLES = Object.freeze({
  accounts: 'beneficiary_portal_accounts',
  otps: 'beneficiary_portal_otps',
  notices: 'beneficiary_portal_notices',
  renewals: 'beneficiary_portal_renewals',
  profileUpdates: 'beneficiary_portal_profile_updates',
  communityPosts: 'community_posts',
  communityInterests: 'community_interests',
  communityReports: 'community_post_reports',
  communityConversations: 'community_conversations',
  communityMessages: 'community_messages',
  communityPostRecommendations: 'community_post_recommendations',
  sessions: 'portal_sessions'
});

export class BeneficiarioPortalRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listBeneficiaries() {
    return this.repository.list('beneficiaries');
  }

  async listDeliveries() {
    return this.repository.list('deliveries');
  }

  async listDocuments() {
    return this.repository.list('beneficiary_documents');
  }

  async listSocialHistory() {
    return this.repository.list('social_history');
  }

  async listResources() {
    return this.repository.list('recursos');
  }

  async listAccounts() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.accounts);
  }

  async createAccount(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.accounts, payload);
  }

  async updateAccount(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.accounts, id, payload);
  }

  async listOtps() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.otps);
  }

  async createOtp(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.otps, payload);
  }

  async updateOtp(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.otps, id, payload);
  }

  async listSessions() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.sessions);
  }

  async createSession(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.sessions, payload);
  }

  async updateSession(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.sessions, id, payload);
  }

  async listNotices() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.notices);
  }

  async createNotice(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.notices, payload);
  }

  async updateNotice(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.notices, id, payload);
  }

  async listRenewals() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.renewals);
  }

  async createRenewal(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.renewals, payload);
  }

  async updateRenewal(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.renewals, id, payload);
  }

  async listProfileUpdates() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.profileUpdates);
  }

  async createProfileUpdate(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.profileUpdates, payload);
  }

  async updateProfileUpdate(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.profileUpdates, id, payload);
  }

  async listCommunityPosts() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityPosts);
  }

  async createCommunityPost(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.communityPosts, payload);
  }

  async updateCommunityPost(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.communityPosts, id, payload);
  }

  async listCommunityInterests() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityInterests);
  }

  async createCommunityInterest(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.communityInterests, payload);
  }

  async updateCommunityInterest(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.communityInterests, id, payload);
  }

  async listCommunityReports() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityReports);
  }

  async createCommunityReport(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.communityReports, payload);
  }

  async updateCommunityReport(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.communityReports, id, payload);
  }

  async listCommunityConversations() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityConversations);
  }

  async createCommunityConversation(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.communityConversations, payload);
  }

  async updateCommunityConversation(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.communityConversations, id, payload);
  }

  async listCommunityMessages() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityMessages);
  }

  async createCommunityMessage(payload) {
    return this.repository.create(BENEFICIARIO_PORTAL_TABLES.communityMessages, payload);
  }

  async updateCommunityMessage(id, payload) {
    return this.repository.update(BENEFICIARIO_PORTAL_TABLES.communityMessages, id, payload);
  }

  async listCommunityPostRecommendations() {
    return this.repository.list(BENEFICIARIO_PORTAL_TABLES.communityPostRecommendations);
  }
}
