import { createClient } from '@supabase/supabase-js';
import { getServerConfig, requireAdmin } from './_adminAuth.js';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[create-user] Inicio', { requestId });

  try {
    const { url, serviceRoleKey, diagnostics: serverDiagnostics } = getServerConfig();
    const body = parseBody(request.body);
    const user = body.user || body;

    if (!url || !serviceRoleKey) {
      console.error('[create-user] Servicio no configurado', { requestId, ...serverDiagnostics });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        step: 'server_config_missing',
        error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.',
        details: serverDiagnostics
      });
    }

    if (serverDiagnostics.serviceRoleKeyHasNonAscii || !serverDiagnostics.serviceRoleKeyLooksJwt) {
      console.error('[create-user] SUPABASE_SERVICE_ROLE_KEY invalida para cabeceras HTTP', { requestId, ...serverDiagnostics });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_SERVICE_ROLE_INVALID',
        step: 'server_config_service_role_format',
        error: 'SUPABASE_SERVICE_ROLE_KEY no tiene formato valido. Revise la variable en Vercel y elimine comillas, espacios o caracteres ocultos.',
        details: serverDiagnostics
      });
    }

    if (!user.email || !user.password) {
      return sendJson(response, 400, { ok: false, code: 'INVALID_USER', error: 'Email y contrasena son obligatorios.' });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const requester = await requireAdmin(request, admin, requestId, '[create-user]');
    if (!requester.ok) {
      return sendJson(response, requester.status, {
        ok: false,
        code: requester.code,
        error: requester.error,
        step: requester.step,
        details: requester.details
      });
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        role: user.role || 'Voluntario'
      }
    });

    if (authError) {
      const message = authError.message || 'No se pudo crear el usuario en Supabase Auth.';
      console.error('[create-user] Error Auth', { requestId, message });
      return sendJson(response, 400, { ok: false, code: 'AUTH_CREATE_FAILED', error: normalizeSupabaseAuthError(message) });
    }

    const profile = sanitizeProfile({
      ...user,
      auth_user_id: authData.user.id,
      is_active: user.status ? user.status === 'Activo' : user.is_active !== false,
      status: user.status || (user.is_active === false ? 'Inactivo' : 'Activo')
    });

    const { data: profileData, error: profileError } = await admin
      .from('app_users')
      .insert(profile)
      .select()
      .single();

    if (profileError) {
      console.error('[create-user] Error app_users', { requestId, error: profileError });
      await admin.auth.admin.deleteUser(authData.user.id);
      return sendJson(response, 400, {
        ok: false,
        code: 'APP_PROFILE_CREATE_FAILED',
        error: profileError.message || 'No se pudo crear el perfil del usuario.'
      });
    }

    console.info('[create-user] Usuario creado', { requestId, id: profileData.id, email: profileData.email });
    return sendJson(response, 200, { ok: true, user: profileData });
  } catch (error) {
    console.error('[create-user] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'CREATE_USER_FAILED', error: error.message || 'No se pudo crear el usuario.' });
  }
}

function sendJson(response, status, payload) {
  return response.status(status).send(JSON.stringify(payload));
}

function parseBody(body) {
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

function sanitizeProfile(user) {
  const {
    id,
    first_name,
    last_name,
    email,
    password,
    phone,
    role,
    position,
    status,
    is_active,
    permissions,
    permission_matrix,
    profile_photo,
    last_access_at,
    created_by,
    created_at,
    auth_user_id
  } = user;

  return {
    first_name,
    last_name,
    email,
    phone,
    role,
    position,
    status,
    is_active,
    permissions,
    permission_matrix,
    profile_photo,
    last_access_at: last_access_at || null,
    created_by,
    created_at,
    auth_user_id
  };
}

function normalizeSupabaseAuthError(message) {
  if (message.toLowerCase().includes('already registered') || message.toLowerCase().includes('already exists')) {
    return 'Ya existe un usuario registrado con ese email.';
  }
  return message;
}
