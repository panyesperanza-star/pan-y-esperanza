import { createClient } from '@supabase/supabase-js';

const ADMIN_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Administrador'];

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.info('[admin-user] Inicio', { requestId });

  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      console.error('[admin-user] Servicio no configurado', { requestId, hasUrl: Boolean(url), hasServiceRoleKey: Boolean(serviceRoleKey) });
      return sendJson(response, 503, {
        ok: false,
        code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
        error: 'Servicio de usuarios no configurado. Anada SUPABASE_SERVICE_ROLE_KEY en Vercel.'
      });
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const requester = await requireAdmin(request, admin);
    if (!requester.ok) {
      return sendJson(response, requester.status, { ok: false, code: requester.code, error: requester.error });
    }

    const body = parseBody(request.body);
    const action = body.action;
    const userId = body.id;

    if (!action || !userId) {
      return sendJson(response, 400, { ok: false, code: 'INVALID_REQUEST', error: 'Accion e identificador de usuario son obligatorios.' });
    }

    const { data: existing, error: existingError } = await admin.from('app_users').select('*').eq('id', userId).single();
    if (existingError || !existing) {
      return sendJson(response, 404, { ok: false, code: 'USER_NOT_FOUND', error: 'Usuario no encontrado.' });
    }

    if ((action === 'delete' || action === 'deactivate' || action === 'block') && await isLastActiveSuperadmin(admin, existing)) {
      return sendJson(response, 400, { ok: false, code: 'LAST_SUPERADMIN', error: 'No se puede bloquear, desactivar o eliminar al ultimo Superadministrador activo.' });
    }

    if (action === 'update') {
      const payload = sanitizeProfile(body.user || {});
      delete payload.id;
      delete payload.auth_user_id;
      const normalized = normalizeStatus(payload);
      const { data, error } = await admin.from('app_users').update(normalized).eq('id', userId).select().single();
      if (error) throw error;
      await syncAuthUser(admin, data);
      await writeAudit(admin, requester.profile, `Usuario editado: ${data.email}`);
      return sendJson(response, 200, { ok: true, user: data });
    }

    if (action === 'deactivate' || action === 'reactivate' || action === 'block') {
      const status = action === 'reactivate' ? 'Activo' : action === 'block' ? 'Bloqueado' : 'Inactivo';
      const { data, error } = await admin
        .from('app_users')
        .update({ status, is_active: status === 'Activo' })
        .eq('id', userId)
        .select()
        .single();
      if (error) throw error;
      await syncAuthUser(admin, data);
      await writeAudit(admin, requester.profile, `Usuario ${status.toLowerCase()}: ${data.email}`);
      return sendJson(response, 200, { ok: true, user: data });
    }

    if (action === 'reset-password') {
      const password = String(body.password || '').trim();
      if (password.length < 8) {
        return sendJson(response, 400, { ok: false, code: 'WEAK_PASSWORD', error: 'La contrasena debe tener al menos 8 caracteres.' });
      }
      if (!existing.auth_user_id) {
        return sendJson(response, 400, { ok: false, code: 'NO_AUTH_USER', error: 'Este usuario no esta vinculado a Supabase Auth.' });
      }
      const { error: authError } = await admin.auth.admin.updateUserById(existing.auth_user_id, { password });
      if (authError) throw authError;
      await admin.from('app_users').update({ password }).eq('id', userId);
      await writeAudit(admin, requester.profile, `Restablecio contrasena de usuario: ${existing.email}`);
      return sendJson(response, 200, { ok: true, message: 'Contrasena restablecida correctamente.' });
    }

    if (action === 'delete') {
      const { error } = await admin.from('app_users').delete().eq('id', userId);
      if (error) throw error;
      if (existing.auth_user_id) {
        const { error: authError } = await admin.auth.admin.deleteUser(existing.auth_user_id);
        if (authError) console.error('[admin-user] No se pudo eliminar auth.users', { requestId, authError });
      }
      await writeAudit(admin, requester.profile, `Usuario eliminado: ${existing.email}`);
      return sendJson(response, 200, { ok: true, message: 'Usuario eliminado correctamente.' });
    }

    return sendJson(response, 400, { ok: false, code: 'UNKNOWN_ACTION', error: 'Accion de usuario no reconocida.' });
  } catch (error) {
    console.error('[admin-user] Excepcion', { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, { ok: false, code: 'ADMIN_USER_FAILED', error: error.message || 'No se pudo completar la operacion de usuarios.' });
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

async function requireAdmin(request, admin) {
  const token = getBearerToken(request);
  if (!token) return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sesion de administrador requerida.' };
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.email) return { ok: false, status: 401, code: 'INVALID_SESSION', error: 'Sesion no valida o caducada.' };
  const { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('id,email,first_name,last_name,role,is_active,status,permissions,permission_matrix')
    .eq('email', authData.user.email)
    .single();
  if (profileError || !profile) return { ok: false, status: 403, code: 'PROFILE_NOT_FOUND', error: 'Usuario sin perfil administrativo.' };
  if (!isActive(profile) || !canManageUsers(profile)) return { ok: false, status: 403, code: 'FORBIDDEN', error: 'No tiene permisos para administrar usuarios.' };
  return { ok: true, profile };
}

function getBearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || '';
  return String(header).match(/^Bearer\s+(.+)$/i)?.[1] || '';
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

function sanitizeProfile(user) {
  const allowed = [
    'id',
    'auth_user_id',
    'first_name',
    'last_name',
    'email',
    'password',
    'phone',
    'role',
    'position',
    'status',
    'is_active',
    'permissions',
    'permission_matrix',
    'profile_photo',
    'last_access_at',
    'created_by',
    'created_at'
  ];
  return Object.fromEntries(allowed.filter((key) => Object.hasOwn(user, key)).map((key) => [key, user[key] === '' && key.endsWith('_at') ? null : user[key]]));
}

function normalizeStatus(payload) {
  const status = payload.status || (payload.is_active === false ? 'Inactivo' : 'Activo');
  return { ...payload, status, is_active: status === 'Activo' };
}

async function syncAuthUser(admin, user) {
  if (!user.auth_user_id) return;
  const bannedUntil = user.status === 'Activo' && user.is_active !== false ? null : '2999-12-31T23:59:59.000Z';
  const { error } = await admin.auth.admin.updateUserById(user.auth_user_id, {
    email: user.email,
    ban_duration: bannedUntil ? '876000h' : 'none',
    user_metadata: {
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || ''
    }
  });
  if (error) throw error;
}

async function isLastActiveSuperadmin(admin, user) {
  if (user.role !== 'Superadministrador') return false;
  const { count, error } = await admin
    .from('app_users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'Superadministrador')
    .eq('is_active', true)
    .eq('status', 'Activo')
    .neq('id', user.id);
  if (error) throw error;
  return count === 0;
}

async function writeAudit(admin, actor, action) {
  await admin.from('audit_logs').insert({
    user_name: `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email,
    user_email: actor.email,
    action,
    happened_at: new Date().toISOString()
  });
}
