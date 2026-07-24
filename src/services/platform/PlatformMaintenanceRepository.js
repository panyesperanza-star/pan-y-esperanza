export class PlatformMaintenanceRepository {
  constructor({ repository } = {}) {
    if (!repository) throw new Error('PlatformMaintenanceRepository necesita un repository.');
    this.repository = repository;
  }

  async listLogs() {
    return this.repository.list('platform_maintenance_logs');
  }

  async createLog(payload) {
    return this.repository.create('platform_maintenance_logs', payload);
  }
}
