import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

const TABLE = 'system_priorities';

function isMissingPriorityTable(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('relation')
    || message.includes('tabla');
}

export class PriorityRepository {
  constructor({ dataStore, supabase, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async list() {
    try {
      return await this.repository.list(TABLE);
    } catch (error) {
      if (isMissingPriorityTable(error)) return [];
      throw error;
    }
  }

  async create(payload) {
    return this.repository.create(TABLE, payload);
  }

  async update(id, payload) {
    return this.repository.update(TABLE, id, payload);
  }

  async archive(id, payload = {}) {
    return this.update(id, {
      ...payload,
      estado: 'Archivada',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
}
