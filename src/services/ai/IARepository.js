import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

export const DEFAULT_IA_CONFIGURATION = Object.freeze({
  enabled: false,
  provider: 'noop',
  auditEnabled: true,
  model: '',
  temperature: 0.2,
  providers: Object.freeze({
    openai: Object.freeze({ model: '', apiKeyReference: '' }),
    azureOpenAI: Object.freeze({ deployment: '', endpointReference: '', apiKeyReference: '' }),
    anthropic: Object.freeze({ model: '', apiKeyReference: '' }),
    gemini: Object.freeze({ model: '', apiKeyReference: '' })
  })
});

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(base, value) {
  return {
    ...base,
    ...(isPlainObject(value) ? value : {})
  };
}

export function normalizeIAConfiguration(value = {}) {
  const payload = isPlainObject(value) ? value : {};
  return {
    ...DEFAULT_IA_CONFIGURATION,
    ...payload,
    enabled: payload.enabled === true,
    auditEnabled: payload.auditEnabled !== false,
    provider: payload.provider || DEFAULT_IA_CONFIGURATION.provider,
    providers: {
      openai: mergeObjects(DEFAULT_IA_CONFIGURATION.providers.openai, payload.providers?.openai),
      azureOpenAI: mergeObjects(
        DEFAULT_IA_CONFIGURATION.providers.azureOpenAI,
        payload.providers?.azureOpenAI || payload.providers?.azure_openai
      ),
      anthropic: mergeObjects(DEFAULT_IA_CONFIGURATION.providers.anthropic, payload.providers?.anthropic),
      gemini: mergeObjects(DEFAULT_IA_CONFIGURATION.providers.gemini, payload.providers?.gemini)
    }
  };
}

export class IARepository {
  constructor({ dataStore, supabase = null, hasSupabaseConfig = false, repository = null } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
  }

  async getSettings() {
    const rows = await this.repository.list('organization_settings');
    return rows[0] || null;
  }

  async getConfiguration() {
    const settings = await this.getSettings();
    const preferences = settings?.erp_preferences || {};
    return normalizeIAConfiguration(preferences.ai || preferences.ia || settings?.ai_settings || settings?.ia_settings);
  }

  async saveConfiguration(payload) {
    const current = await this.getSettings();
    const erpPreferences = {
      ...(current?.erp_preferences || {}),
      ai: normalizeIAConfiguration(payload)
    };
    const settingsPayload = {
      ...(current || {}),
      id: current?.id || 'main',
      erp_preferences: erpPreferences,
      updated_at: new Date().toISOString()
    };

    if (current?.id) return this.repository.update('organization_settings', current.id, settingsPayload);
    return this.repository.create('organization_settings', settingsPayload);
  }

  async createAuditLog({ userName = 'Sistema', userEmail = '', action, happenedAt = new Date().toISOString() } = {}) {
    if (!action) return null;
    return this.repository.create('audit_logs', {
      user_name: userName,
      user_email: userEmail,
      action,
      happened_at: happenedAt
    });
  }
}
