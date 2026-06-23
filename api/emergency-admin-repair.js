import {
  ELIZABETH_EMAIL,
  findAuthUserByEmail,
  fullPermissionMatrix,
  fullPermissions,
  getEmergencyAdmin,
  parseBody,
  requireRepairSecret,
  sendJson,
  upsertAppUser
} from './_emergencyRepair.js';

export default async function handler(request, response) {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const logPrefix = '[emergency-admin-repair]';
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
    const email = String(body.email || ELIZABETH_EMAIL).toLowerCase();
    if (email !== ELIZABETH_EMAIL) {
      return sendJson(response, 400, {
        ok: false,
        code: 'ONLY_ELIZABETH_ALLOWED',
        error: 'Este endpoint solo puede reparar el usuario elizabeth@panyesperanza.org.'
      });
    }

    const authUser = await findAuthUserByEmail(admin, ELIZABETH_EMAIL);
    if (!authUser) {
      console.error(`${logPrefix} Elizabeth no existe en auth.users`, { requestId, email: ELIZABETH_EMAIL });
      return sendJson(response, 404, {
        ok: false,
        code: 'AUTH_USER_NOT_FOUND',
        error: 'No existe elizabeth@panyesperanza.org en Supabase Auth. Cree primero el usuario en Authentication.'
      });
    }

    console.info(`${logPrefix} auth.users encontrado`, {
      requestId,
      authUserId: authUser.id,
      email: authUser.email
    });

    const { data: existingByEmail, error: lookupError } = await admin
      .from('app_users')
      .select('id,email,auth_user_id,role,status,is_active,permissions,permission_matrix')
      .ilike('email', ELIZABETH_EMAIL)
      .maybeSingle();
    if (lookupError) throw lookupError;

    console.info(`${logPrefix} app_users previo`, {
      requestId,
      found: Boolean(existingByEmail),
      appUser: existingByEmail
    });

    const repaired = await upsertAppUser(admin, {
      id: existingByEmail?.id,
      auth_user_id: authUser.id,
      first_name: 'Elizabeth',
      last_name: existingByEmail?.last_name || '',
      email: ELIZABETH_EMAIL,
      phone: existingByEmail?.phone || '',
      role: 'Superadministrador',
      position: 'Superadministradora',
      status: 'Activo',
      is_active: true,
      permissions: fullPermissions(),
      permission_matrix: fullPermissionMatrix(),
      profile_photo: existingByEmail?.profile_photo || '',
      created_by: existingByEmail?.created_by || 'emergency-admin-repair'
    });

    console.info(`${logPrefix} app_users reparado`, {
      requestId,
      appUserId: repaired.id,
      authUserId: repaired.auth_user_id,
      email: repaired.email,
      role: repaired.role,
      status: repaired.status,
      is_active: repaired.is_active
    });

    return sendJson(response, 200, {
      ok: true,
      authUserId: authUser.id,
      appUserId: repaired.id,
      email: repaired.email,
      role: repaired.role,
      status: repaired.status
    });
  } catch (error) {
    console.error(`${logPrefix} excepcion`, { requestId, message: error.message, stack: error.stack });
    return sendJson(response, 500, {
      ok: false,
      code: 'EMERGENCY_REPAIR_FAILED',
      error: error.message || 'No se pudo reparar el administrador.'
    });
  }
}
