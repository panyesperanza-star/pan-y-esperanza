import { BaseAIProvider } from './BaseAIProvider';

export class NoopAIProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.id = 'noop';
    this.label = 'IA sin proveedor configurado';
  }

  isConfigured() {
    return true;
  }

  async complete(request) {
    return this.preparedResponse(request, 'prepared');
  }
}
