export class LocalStorageRepository {
  constructor({ dataStore } = {}) {
    if (!dataStore) throw new Error('LocalStorageRepository necesita dataStore.');
    this.dataStore = dataStore;
    this.mode = 'local';
  }

  async list(table) {
    return this.dataStore.list(table);
  }

  async loadAll() {
    return this.dataStore.loadAll();
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
