import { BaseAIProvider } from './BaseAIProvider';

export class AzureOpenAIProvider extends BaseAIProvider {
  constructor(config = {}) {
    super(config);
    this.id = 'azure-openai';
    this.label = 'Azure OpenAI';
  }
}
