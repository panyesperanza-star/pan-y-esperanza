import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Administrador'];

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[create-user] Inicio', { requestId });

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const body = parseBody(request.body);
    const user = body.user || body;

    if (!url || !serviceRoleKey) {
      console.error('[create-user] Servicio no configurado', { requestId, hasUrl: Boolean(url), hasServiceRoleKey: Boolean(serviceRoleKey) });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.'
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

    const requester = await requireAdmin(request, admin, requestId);
    if (!requester.ok) {
      return sendJson(response, requester.status, { ok: false, code: requester.code, error: requester.error });
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
    password,
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

async function requireAdmin(request, admin, requestId) {
  const { token, diagnostics } = getBearerToken(request);
  console.info('[create-user] Authorization recibida', { requestId, ...diagnostics });
  if (!token) {
    console.error('[create-user] Validacion admin fallida: falta Authorization Bearer', { requestId });
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sesion de administrador requerida.' };
  }

  if (diagnostics.tokenHasNonAscii || !isJwtLike(token)) {
    console.error('[create-user] Validacion admin fallida: token no es JWT ASCII valido', { requestId, ...diagnostics });
    return { ok: false, status: 401, code: 'INVALID_TOKEN_FORMAT', error: 'Sesion no valida o caducada.' };
  }

  let authData;
  let authError;
  try {
    const result = await admin.auth.getUser(token);
    authData = result.data;
    authError = result.error;
  } catch (error) {
    console.error('[create-user] Validacion admin fallida: excepcion en supabase.auth.getUser', {
      requestId,
      message: error.message,
      ...diagnostics
    });
    return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesion no valida o caducada.' };
  }
  if (authError || !authData?.user?.email) {
    console.error('[create-user] Validacion admin fallida: token invalido', { requestId, error: authError?.message, hasUser: Boolean(authData?.user), ...diagnostics });
    return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesion no valida o caducada.' };
  }

  const authUser = authData.user;
  const authEmail = authUser.email.toLowerCase();
  console.info('[create-user] Validando administrador', { requestId, authUserId: authUser.id, authEmail });

  let { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('id,email,auth_user_id,role,is_active,status,permissions,permission_matrix')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (profileError) {
    console.error('[create-user] Validacion admin fallida: error buscando por auth_user_id', { requestId, error: profileError });
    return { ok: false, status: 403, code: 'PROFILE_LOOKUP_FAILED', error: 'No se pudo validar el perfil administrador.' };
  }

  if (!profile) {
    const byEmail = await admin
      .from('app_users')
      .select('id,email,auth_user_id,role,is_active,status,permissions,permission_matrix')
      .ilike('email', authEmail)
      .maybeSingle();
    if (byEmail.error) {
      console.error('[create-user] Validacion admin fallida: error buscando por email', { requestId, authEmail, error: byEmail.error });
      return { ok: false, status: 403, code: 'PROFILE_LOOKUP_FAILED', error: 'No se pudo validar el perfil administrador.' };
    }
    profile = byEmail.data;
  }

  if (!profile) {
    console.error('[create-user] Validacion admin fallida: no existe perfil app_users', { requestId, authUserId: authUser.id, authEmail });
    return { ok: false, status: 403, code: 'PROFILE_NOT_FOUND', error: 'Usuario sin perfil administrativo.' };
  }

  if (!profile.auth_user_id || profile.auth_user_id !== authUser.id) {
    console.warn('[create-user] Perfil administrador con auth_user_id desincronizado. Sincronizando.', {
      requestId,
      profileId: profile.id,
      previousAuthUserId: profile.auth_user_id,
      nextAuthUserId: authUser.id
    });
    const { data: syncedProfile, error: syncError } = await admin
      .from('app_users')
      .update({ auth_user_id: authUser.id })
      .eq('id', profile.id)
      .select('id,email,auth_user_id,role,is_active,status,permissions,permission_matrix')
      .single();
    if (syncError) {
      console.error('[create-user] Validacion admin fallida: no se pudo sincronizar auth_user_id', { requestId, error: syncError });
      return { ok: false, status: 403, code: 'PROFILE_SYNC_FAILED', error: 'No se pudo sincronizar el perfil administrador con Supabase Auth.' };
    }
    profile = syncedProfile;
  }

  const active = isActive(profile);
  const allowed = canManageUsers(profile);
  console.info('[create-user] Resultado validacion admin', {
    requestId,
    profileId: profile.id,
    email: profile.email,
    role: profile.role,
    isActive: active,
    canManageUsers: allowed
  });

  if (!active) {
    console.error('[create-user] Validacion admin fallida: perfil inactivo o bloqueado', { requestId, profileId: profile.id, status: profile.status, is_active: profile.is_active });
    return { ok: false, status: 403, code: 'ADMIN_INACTIVE', error: 'Usuario administrador inactivo o bloqueado.' };
  }

  if (!allowed) {
    console.error('[create-user] Validacion admin fallida: sin permisos de usuarios', { requestId, profileId: profile.id, role: profile.role, permissions: profile.permissions, permission_matrix: profile.permission_matrix });
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'No tiene permisos para administrar usuarios.' };
  }

  return { ok: true, profile };
}

function getBearerToken(request) {
  const rawHeaderValue = request.headers.authorization || request.headers.Authorization || '';
  const rawHeader = Array.isArray(rawHeaderValue) ? rawHeaderValue[0] || '' : String(rawHeaderValue || '');
  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  const token = typeof match?.[1] === 'string' ? match[1].trim() : '';
  return {
    token,
    diagnostics: {
      authorizationHeaderReceived: rawHeader ? `${rawHeader.slice(0, 28)}...` : '',
      authorizationHeaderLength: rawHeader.length,
      tokenLength: token.length,
      tokenPrefix: token.slice(0, 20),
      tokenHasNonAscii: /[^\x00-\x7F]/.test(token),
      headerHasNonAscii: /[^\x00-\x7F]/.test(rawHeader)
    }
  };
}

function isJwtLike(token) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function isActive(user) {
  return user?.is_active !== false && (user?.status || 'Activo') === 'Activo';
}

function canManageUsers(user) {
  if (ADMIN_ROLES.includes(user.role)) return true;
  if (Array.isArray(user.permissions) && (user.permissions.includes('*') || user.permissions.includes('users'))) return true;
  const matrix = user.permission_matrix || {};
  return Boolean(matrix.users?.create || matrix.users?.edit || matrix.users?.delete);
}
