import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export const DONOR_PORTAL_TABLES = Object.freeze({
  donors: 'donors',
  otps: 'donor_portal_otps',
  profileUpdates: 'donor_portal_profile_updates',
  certificates: 'donor_certificates',
  sessions: 'portal_sessions'
});

export class DonanteRepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async listDonors() {
    return this.repository.list(DONOR_PORTAL_TABLES.donors);
  }

  async createDonor(payload) {
    return this.repository.create(DONOR_PORTAL_TABLES.donors, payload);
  }

  async updateDonor(id, payload) {
    return this.repository.update(DONOR_PORTAL_TABLES.donors, id, payload);
  }

  async listOtps() {
    return this.repository.list(DONOR_PORTAL_TABLES.otps);
  }

  async createOtp(payload) {
    return this.repository.create(DONOR_PORTAL_TABLES.otps, payload);
  }

  async updateOtp(id, payload) {
    return this.repository.update(DONOR_PORTAL_TABLES.otps, id, payload);
  }

  async listSessions() {
    return this.repository.list(DONOR_PORTAL_TABLES.sessions);
  }

  async createSession(payload) {
    return this.repository.create(DONOR_PORTAL_TABLES.sessions, payload);
  }

  async updateSession(id, payload) {
    return this.repository.update(DONOR_PORTAL_TABLES.sessions, id, payload);
  }

  async listDonations() {
    return this.repository.list('donations');
  }

  async createDonation(payload) {
    return this.repository.create('donations', payload);
  }

  async updateDonation(id, payload) {
    return this.repository.update('donations', id, payload);
  }

  async listCampaigns() {
    return this.repository.list('campanas');
  }

  async listProfileUpdates() {
    return this.repository.list(DONOR_PORTAL_TABLES.profileUpdates);
  }

  async createProfileUpdate(payload) {
    return this.repository.create(DONOR_PORTAL_TABLES.profileUpdates, payload);
  }

  async listCertificates() {
    return this.repository.list(DONOR_PORTAL_TABLES.certificates);
  }
}
