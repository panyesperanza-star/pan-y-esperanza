export class BaseAIProvider {
  constructor(config = {}) {
    this.config = config || {};
    this.id = 'base';
    this.label = 'Base AI Provider';
  }

  isConfigured() {
    return false;
  }

  preparedResponse(request, status = 'not_connected') {
    return {
      provider: this.id,
      providerLabel: this.label,
      status,
      content: 'Proveedor de IA preparado, pendiente de configuracion y conexion segura.',
      request,
      created_at: new Date().toISOString()
    };
  }

  async complete(request) {
    return this.preparedResponse(request);
  }
}
