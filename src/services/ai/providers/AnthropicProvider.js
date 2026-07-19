import { BaseAIProvider } from './BaseAIProvider';

export class AnthropicProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.id = 'anthropic';
    this.label = 'Anthropic';
  }
}
