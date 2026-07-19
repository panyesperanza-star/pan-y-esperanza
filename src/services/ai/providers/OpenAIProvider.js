import { BaseAIProvider } from './BaseAIProvider';

export class OpenAIProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.id = 'openai';
    this.label = 'OpenAI';
  }
}
