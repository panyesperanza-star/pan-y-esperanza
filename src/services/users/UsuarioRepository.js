import { getApiHeaders } from '../../lib/apiAuth';
import { fetchEdgeFunction } from '../../lib/edgeFunctions';
import { hasSupabaseConfig } from '../../lib/supabase';
import { createRepositoryAdapter } from '../repositories/RepositoryProvider';

async function readApiJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}

function formatApiError(result, fallback) {
  const base = result.error || fallback;
  if (!result.step) return base;
  const details = result.details ? ` Detalles: ${JSON.stringify(result.details)}` : '';
  return `${base} Paso: ${result.step}.${details}`;
}

export class UsuarioRepository {
  constructor({ dataStore, repository = null, fetchClient = globalThis.fetch?.bind(globalThis) } = {}) {
    this.repository = repository || createRepositoryAdapter({ dataStore });
    this.fetchClient = fetchClient;
  }

  async create(user) {
    if (hasSupabaseConfig) {
      const response = await fetchEdgeFunction('create-user', {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({ user })
      });
      const result = await readApiJson(response);
      if (!response.ok) {
        if (result.code === 'SUPABASE_ADMIN_NOT_CONFIGURED') {
          throw new Error(formatApiError(result, 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Supabase Edge Functions.'));
        }
        throw new Error(formatApiError(result, 'No se pudo crear el usuario.'));
      }
      return result;
    }

    return this.repository.create('app_users', user);
  }

  async update(id, user) {
    if (hasSupabaseConfig) return this.adminRequest('update', { id, user });
    return this.repository.update('app_users', id, user);
  }

  async deactivate(id) {
    if (hasSupabaseConfig) return this.adminRequest('deactivate', { id });
    return this.repository.update('app_users', id, { is_active: false, status: 'Inactivo' });
  }

  async reactivate(id) {
    if (hasSupabaseConfig) return this.adminRequest('reactivate', { id });
    return this.repository.update('app_users', id, { is_active: true, status: 'Activo' });
  }

  async block(id) {
    if (hasSupabaseConfig) return this.adminRequest('block', { id });
    return this.repository.update('app_users', id, { is_active: false, status: 'Bloqueado' });
  }

  async remove(id) {
    if (hasSupabaseConfig) return this.adminRequest('delete', { id });
    return this.repository.remove('app_users', id);
  }

  async resetPassword(id, password) {
    if (hasSupabaseConfig) return this.adminRequest('reset-password', { id, password });
    return this.repository.update('app_users', id, { password });
  }

  async updateLastAccess(id) {
    return this.repository.update('app_users', id, { last_access_at: new Date().toISOString() });
  }

  async createAuditLog(payload) {
    return this.repository.create('audit_logs', payload);
  }

  async sendWelcomeEmail({ user, organization, logoUrl }) {
    return fetchEdgeFunction('send-justificantes', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({
        testMode: true,
        to: user.email,
        subject: 'Bienvenida a Pan y Esperanza',
        message: `Hola ${user.first_name}, tu usuario se ha creado correctamente. Contrasena temporal: ${user.password}`,
        logoUrl,
        organization
      })
    });
  }

  async adminRequest(action, payload = {}) {
    const response = await fetchEdgeFunction('admin-user', {
      method: 'POST',
      headers: await getApiHeaders(),
      body: JSON.stringify({ action, ...payload })
    });
    const result = await readApiJson(response);
    if (!response.ok) throw new Error(formatApiError(result, 'No se pudo completar la operacion de usuarios.'));
    return result;
  }
}
