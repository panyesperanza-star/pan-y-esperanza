import { AnthropicProvider } from './AnthropicProvider';
import { AzureOpenAIProvider } from './AzureOpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { NoopAIProvider } from './NoopAIProvider';
import { OpenAIProvider } from './OpenAIProvider';

export const NOOP_AI_PROVIDER = 'noop';

export const SUPPORTED_AI_PROVIDERS = Object.freeze([
  { id: NOOP_AI_PROVIDER, label: 'Sin proveedor configurado' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'azure-openai', label: 'Azure OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' }
]);

export function createAIProvider(providerId = NOOP_AI_PROVIDER, config = {}) {
  if (providerId === 'openai') return new OpenAIProvider(config.openai || config);
  if (providerId === 'azure-openai') return new AzureOpenAIProvider(config.azureOpenAI || config.azure_openai || config);
  if (providerId === 'anthropic') return new AnthropicProvider(config.anthropic || config);
  if (providerId === 'gemini') return new GeminiProvider(config.gemini || config);
  return new NoopAIProvider(config.noop || config);
}
