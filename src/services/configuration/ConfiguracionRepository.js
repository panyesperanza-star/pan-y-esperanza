import { getApiHeaders } from '../../lib/apiAuth';
import { checkSupabaseStorage, getSystemConfigStatus } from '../../lib/supabase';
import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

async function readApiJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}

export class ConfiguracionRepository {
  constructor({
    dataStore,
    supabase = null,
    hasSupabaseConfig = false,
    repository = null,
    fetchClient = globalThis.fetch?.bind(globalThis),
    storage = globalThis.localStorage
  } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore, supabase, hasSupabaseConfig });
    this.fetchClient = fetchClient;
    this.storage = storage;
  }

  async getSettings() {
    const rows = await this.repository.list('organization_settings');
    return rows[0] || null;
  }

  async saveSettings(payload) {
    const current = await this.getSettings();
    if (current?.id) return this.repository.update('organization_settings', current.id, payload);
    return this.repository.create('organization_settings', { id: 'main', ...payload });
  }

  getSystemStatus() {
    return getSystemConfigStatus();
  }

  getLastBackupAt() {
    return this.storage?.getItem('pye-last-backup-at') || '';
  }

  async checkStorage() {
    return checkSupabaseStorage();
  }

  async sendTestEmail(settings) {
    const response = await this.fetchClient('/api/send-justificantes', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({
        testMode: true,
        to: settings.mail_sender_email || settings.email,
        subject: 'Prueba de correo - Pan y Esperanza',
        message: 'Este es un correo de prueba de la configuracion corporativa.',
        organization: settings
      })
    });
    const payload = await readApiJson(response);
    if (!response.ok) throw new Error(payload.error || 'Error al enviar el correo.');
    return payload;
  }
}
