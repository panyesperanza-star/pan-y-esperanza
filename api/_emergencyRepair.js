import { createClient } from '@supabase/supabase-js';
import { cleanJwtCredential, getServerConfig } from './_adminAuth.js';

export const ELIZABETH_EMAIL = 'elizabeth@panyesperanza.org';

const PERMISSION_MODULES = [
  'beneficiaries',
  'communications',
  'families',
  'deliveries',
  'receipts',
  'inventory',
  'donations',
  'treasury',
  'reports',
  'users',
  'settings',
  'backup'
];

const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete'];

export function sendJson(response, status, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.status(status).send(JSON.stringify(payload));
}

export function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export function requireRepairSecret(request, requestId, logPrefix) {
  const configured = cleanJwtCredential(process.env.EMERGENCY_REPAIR_SECRET);
  const received = cleanJwtCredential(getHeader(request, 'x-repair-secret'));

  const diagnostics = {
    hasConfiguredSecret: Boolean(configured),
    hasReceivedSecret: Boolean(received),
    configuredSecretLength: configured.length,
    receivedSecretLength: received.length
  };

  if (!configured) {
    console.error(`${logPrefix} EMERGENCY_REPAIR_SECRET no configurado`, { requestId, ...diagnostics });
    return {
      ok: false,
      status: 503,
      payload: {
        ok: false,
        code: 'REPAIR_SECRET_NOT_CONFIGURED',
        error: 'Modo reparacion no configurado. Anada EMERGENCY_REPAIR_SECRET en Vercel.',
        details: diagnostics
      }
    };
  }

  if (!received || received !== configured) {
    console.error(`${logPrefix} secreto de reparacion invalido`, { requestId, ...diagnostics });
    return {
      ok: false,
      status: 401,
      payload: {
        ok: false,
        code: 'INVALID_REPAIR_SECRET',
        error: 'Secreto de reparacion invalido.',
        details: diagnostics
      }
    };
  }

  return { ok: true };
}

export function getEmergencyAdmin(requestId, logPrefix) {
  const { url, serviceRoleKey, diagnostics } = getServerConfig();
  if (!url || !serviceRoleKey) {
    console.error(`${logPrefix} Supabase admin no configurado`, { requestId, ...diagnostics });
    return {
      ok: false,
      status: 503,
      payload: {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        error: 'Servicio de usuarios no configurado.',
        details: diagnostics
      }
    };
  }

  if (diagnostics.serviceRoleKeyHasNonAscii || !diagnostics.serviceRoleKeyLooksJwt) {
    console.error(`${logPrefix} SUPABASE_SERVICE_ROLE_KEY invalida`, { requestId, ...diagnostics });
    return {
      ok: false,
      status: 503,
      payload: {
        ok: false,
        code: 'SUPABASE_SERVICE_ROLE_INVALID',
        error: 'SUPABASE_SERVICE_ROLE_KEY no tiene formato valido.',
        details: diagnostics
      }
    };
  }

  return {
    ok: true,
    admin: createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  };
}

export function fullPermissions() {
  return ['*'];
}

export function fullPermissionMatrix() {
  return Object.fromEntries(PERMISSION_MODULES.map((moduleId) => [
    moduleId,
    Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, true]))
  ]));
}

export async function findAuthUserByEmail(admin, email) {
  const normalized = String(email || '').toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

export async function createAuthUser(admin, user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: {
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || 'Voluntario'
    }
  });
  if (error) throw error;
  return data.user;
}

export async function upsertAppUser(admin, payload) {
  const { data, error } = await admin
    .from('app_users')
    .upsert(payload, { onConflict: 'email' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function normalizeUserPayload(user, authUserId) {
  const status = user.status || 'Activo';
  return {
    auth_user_id: authUserId,
    first_name: user.first_name || user.name || '',
    last_name: user.last_name || '',
    email: String(user.email || '').toLowerCase(),
    phone: user.phone || '',
    role: user.role || 'Voluntario',
    position: user.position || user.role || 'Voluntario',
    status,
    is_active: status === 'Activo',
    permissions: user.permissions || fullPermissions(),
    permission_matrix: user.permission_matrix || fullPermissionMatrix(),
    profile_photo: user.profile_photo || '',
    created_by: user.created_by || 'emergency-create-user'
  };
}

function getHeader(request, name) {
  if (typeof request.headers?.get === 'function') {
    return String(request.headers.get(name) || '');
  }
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.[name.toUpperCase()] || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}
