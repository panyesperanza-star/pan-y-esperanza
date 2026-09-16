export class LocalStorageRepository {
  constructor({ dataStore } = {}) {
    if (!dataStore) throw new Error('LocalStorageRepository necesita dataStore.');
    this.dataStore = dataStore;
    this.mode = 'local';
  }

  async list(table) {
    return this.dataStore.list(table);
  }

  async get(table, id) {
    const rows = await this.list(table);
    return rows.find((row) => row.id === id) || null;
  }

  async loadAll() {
    return this.dataStore.loadAll();
  }

  async loadPartial(tables = []) {
    const startedAt = Date.now();
    const allData = await this.dataStore.loadAll();
    const data = Object.fromEntries((tables || []).map((table) => [table, allData[table] || []]));
    return {
      data,
      diagnostics: Object.entries(data).map(([table, rows]) => ({
        table,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        status: 'success',
        row_count: rows.length
      }))
    };
  }

  async create(table, payload) {
    return this.dataStore.create(table, payload);
  }

  async update(table, id, payload) {
    return this.dataStore.update(table, id, payload);
  }

  async remove(table, id) {
    return this.dataStore.remove(table, id);
  }

  async replaceLocalData(payload) {
    return this.dataStore.replaceLocalData(payload);
  }

  async resetLocalDemo() {
    return this.dataStore.resetLocalDemo();
  }

  async rpc() {
    throw new Error('RPC no disponible sin Supabase.');
  }
}
