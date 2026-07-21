import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export const COLLABORATOR_PORTAL_TABLES = Object.freeze({
  collaborators: 'collaborators',
  otps: 'collaborator_portal_otps',
  profileUpdates: 'collaborator_portal_profile_updates',
  requests: 'collaborator_portal_requests',
  certificates: 'collaborator_certificates',
  sessions: 'portal_sessions'
});

export class ColaboradorRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listCollaborators() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.collaborators);
  }

  async createCollaborator(payload) {
    return this.repository.create(COLLABORATOR_PORTAL_TABLES.collaborators, payload);
  }

  async updateCollaborator(id, payload) {
    return this.repository.update(COLLABORATOR_PORTAL_TABLES.collaborators, id, payload);
  }

  async listOtps() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.otps);
  }

  async createOtp(payload) {
    return this.repository.create(COLLABORATOR_PORTAL_TABLES.otps, payload);
  }

  async updateOtp(id, payload) {
    return this.repository.update(COLLABORATOR_PORTAL_TABLES.otps, id, payload);
  }

  async listSessions() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.sessions);
  }

  async createSession(payload) {
    return this.repository.create(COLLABORATOR_PORTAL_TABLES.sessions, payload);
  }

  async updateSession(id, payload) {
    return this.repository.update(COLLABORATOR_PORTAL_TABLES.sessions, id, payload);
  }

  async listDonations() {
    return this.repository.list('donations');
  }

  async createDonation(payload) {
    return this.repository.create('donations', payload);
  }

  async listResources() {
    return this.repository.list('recursos');
  }

  async createResource(payload) {
    return this.repository.create('recursos', payload);
  }

  async listCampaigns() {
    return this.repository.list('campanas');
  }

  async listProfileUpdates() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.profileUpdates);
  }

  async createProfileUpdate(payload) {
    return this.repository.create(COLLABORATOR_PORTAL_TABLES.profileUpdates, payload);
  }

  async listRequests() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.requests);
  }

  async createRequest(payload) {
    return this.repository.create(COLLABORATOR_PORTAL_TABLES.requests, payload);
  }

  async listCertificates() {
    return this.repository.list(COLLABORATOR_PORTAL_TABLES.certificates);
  }
}
