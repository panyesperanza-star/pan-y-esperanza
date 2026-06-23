import {
  createAuthUser,
  findAuthUserByEmail,
  getEmergencyAdmin,
  normalizeUserPayload,
  parseBody,
  requireRepairSecret,
  sendJson,
  upsertAppUser
} from './_emergencyRepair.js';

export default async function handler(request, response) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const logPrefix = '[emergency-create-user]';
  console.info(`${logPrefix} inicio`, { requestId, method: request.method });

  if (request.method !== 'POST') {
    return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido.' });
  }

  const secret = requireRepairSecret(request, requestId, logPrefix);
  if (!secret.ok) return sendJson(response, secret.status, secret.payload);

  const adminConfig = getEmergencyAdmin(requestId, logPrefix);
  if (!adminConfig.ok) return sendJson(response, adminConfig.status, adminConfig.payload);
  const { admin } = adminConfig;

  try {
    const body = parseBody(request.body);
    const user = body.user || body;
    const email = String(user.email || '').toLowerCase().trim();
    const password = String(user.password || '').trim();

    if (!email || !password) {
      return sendJson(response, 400, {
        ok: false,
        code: 'INVALID_USER',
        error: 'Email y contrasena son obligatorios.'
      });
    }

    if (password.length < 8) {
      return sendJson(response, 400, {
        ok: false,
        code: 'WEAK_PASSWORD',
        error: 'La contrasena debe tener al menos 8 caracteres.'
      });
    }

    let authUser = await findAuthUserByEmail(admin, email);
    if (!authUser) {
      authUser = await createAuthUser(admin, {
        ...user,
        email,
        password,
        role: user.role || 'Voluntario'
      });
      console.info(`${logPrefix} usuario creado en auth.users`, { requestId, authUserId: authUser.id, email });
    } else {
      console.info(`${logPrefix} usuario existente en auth.users`, { requestId, authUserId: authUser.id, email });
      const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          role: user.role || 'Voluntario'
        }
      });
      if (updateError) throw updateError;
    }

    const profile = await upsertAppUser(admin, normalizeUserPayload({
      ...user,
      email,
      role: user.role || 'Voluntario',
      status: user.status || 'Activo',
      created_by: user.created_by || 'emergency-create-user'
    }, authUser.id));

    console.info(`${logPrefix} perfil app_users creado/actualizado`, {
      requestId,
      appUserId: profile.id,
      authUserId: profile.auth_user_id,
      email: profile.email,
      role: profile.role,
      status: profile.status
    });

    return sendJson(response, 200, {
      ok: true,
      authUserId: authUser.id,
      appUserId: profile.id,
      email: profile.email,
      role: profile.role,
      status: profile.status
    });
  } catch (error) {
    console.error(`${logPrefix} excepcion`, { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, {
      ok: false,
      code: 'EMERGENCY_CREATE_USER_FAILED',
      error: error.message || 'No se pudo crear el usuario de emergencia.'
    });
  }
}
