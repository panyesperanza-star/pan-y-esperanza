import { BaseAIProvider } from './BaseAIProvider';

export class GeminiProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.id = 'gemini';
    this.label = 'Gemini';
  }
}
