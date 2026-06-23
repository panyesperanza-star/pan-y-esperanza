export const ADMIN_ROLES = ['Superadministrador', 'Presidenta', 'Secretaria', 'Administrador'];

export function cleanJwtCredential(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[\r\n\t ]+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

export function getServerConfig() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = cleanJwtCredential(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    url,
    serviceRoleKey,
    diagnostics: {
      hasUrl: Boolean(url),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      serviceRoleKeyLength: serviceRoleKey.length,
      serviceRoleKeyStartsWith: serviceRoleKey.slice(0, 20),
      serviceRoleKeyHasNonAscii: hasNonAscii(serviceRoleKey),
      serviceRoleKeyLooksJwt: isJwtLike(serviceRoleKey)
    }
  };
}

export async function requireAdmin(request, admin, requestId, logPrefix) {
  const { token, diagnostics } = getBearerToken(request);
  console.info(`${logPrefix} Authorization recibida`, { requestId, ...diagnostics });

  if (!token) {
    return rejectAdmin(logPrefix, requestId, 401, 'AUTH_REQUIRED', 'authorization_missing', 'Sesion de administrador requerida.', {
      motivo: 'No ha llegado cabecera Authorization con formato Bearer.',
      ...diagnostics
    });
  }

  if (diagnostics.tokenHasNonAscii || !isJwtLike(token)) {
    return rejectAdmin(logPrefix, requestId, 401, 'INVALID_TOKEN_FORMAT', 'authorization_token_format', 'Sesion no valida o caducada.', {
      motivo: 'La cabecera Authorization llega, pero el token no tiene formato JWT ASCII valido.',
      ...diagnostics
    });
  }

  let authData;
  let authError;
  try {
    const result = await admin.auth.getUser(token);
    authData = result.data;
    authError = result.error;
  } catch (error) {
    return rejectAdmin(logPrefix, requestId, 401, 'INVALID_SESSION', 'supabase_get_user_exception', 'Sesion no valida o caducada.', {
      motivo: 'Supabase lanzo una excepcion al validar el access_token con auth.getUser(token).',
      message: error.message,
      stack: error.stack,
      ...diagnostics
    });
  }

  if (authError || !authData?.user?.email) {
    return rejectAdmin(logPrefix, requestId, 401, 'INVALID_SESSION', 'supabase_get_user_invalid', 'Sesion no valida o caducada.', {
      motivo: 'Supabase auth.getUser(token) no devolvio un usuario autenticado.',
      error: authError?.message,
      hasUser: Boolean(authData?.user),
      ...diagnostics
    });
  }

  const authUser = authData.user;
  const authEmail = authUser.email.toLowerCase();
  const authUid = authUser.id;

  console.info(`${logPrefix} Usuario obtenido desde getUser`, {
    requestId,
    authUid,
    email: authUser.email,
    emailNormalizado: authEmail,
    isElizabethAuthEmail: authEmail === 'elizabeth@panyesperanza.org'
  });

  let { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('id,email,auth_user_id,first_name,last_name,role,is_active,status,permissions,permission_matrix')
    .eq('auth_user_id', authUid)
    .maybeSingle();

  if (profileError) {
    return rejectAdmin(logPrefix, requestId, 403, 'PROFILE_LOOKUP_FAILED', 'app_users_lookup_by_auth_user_id', 'No se pudo validar el perfil administrador.', {
      motivo: 'Fallo la consulta a app_users por auth_user_id.',
      authUid,
      emailDetectado: authEmail,
      error: profileError
    });
  }

  console.info(`${logPrefix} Resultado app_users por auth_user_id`, {
    requestId,
    authUid,
    encontrado: Boolean(profile),
    profile: profile ? summarizeProfile(profile) : null
  });

  if (!profile) {
    const byEmail = await admin
      .from('app_users')
      .select('id,email,auth_user_id,first_name,last_name,role,is_active,status,permissions,permission_matrix')
      .ilike('email', authEmail)
      .maybeSingle();
    if (byEmail.error) {
      return rejectAdmin(logPrefix, requestId, 403, 'PROFILE_LOOKUP_FAILED', 'app_users_lookup_by_email', 'No se pudo validar el perfil administrador.', {
        motivo: 'Fallo la consulta a app_users por email.',
        authUid,
        emailDetectado: authEmail,
        error: byEmail.error
      });
    }
    profile = byEmail.data;
    console.info(`${logPrefix} Resultado app_users por email`, {
      requestId,
      authUid,
      emailDetectado: authEmail,
      encontrado: Boolean(profile),
      profile: profile ? summarizeProfile(profile) : null,
      elizabethEmailMatch: profile ? compareElizabeth(profile, authEmail) : null
    });
  }

  if (!profile) {
    return rejectAdmin(logPrefix, requestId, 403, 'PROFILE_NOT_FOUND', 'app_users_profile_not_found', 'Usuario sin perfil administrativo.', {
      motivo: 'El usuario autenticado existe en Supabase Auth, pero no se encontro registro correspondiente en app_users por auth_user_id ni por email.',
      authUid,
      emailDetectado: authEmail,
      isElizabethAuthEmail: authEmail === 'elizabeth@panyesperanza.org'
    });
  }

  console.info(`${logPrefix} Registro encontrado en app_users`, {
    requestId,
    authUid,
    emailDetectado: authEmail,
    profile: summarizeProfile(profile),
    elizabethEmailMatch: compareElizabeth(profile, authEmail)
  });

  if (!profile.auth_user_id || profile.auth_user_id !== authUid) {
    console.warn(`${logPrefix} Perfil administrador con auth_user_id desincronizado. Sincronizando.`, {
      requestId,
      profileId: profile.id,
      previousAuthUserId: profile.auth_user_id,
      nextAuthUserId: authUid
    });
    const { data: syncedProfile, error: syncError } = await admin
      .from('app_users')
      .update({ auth_user_id: authUid })
      .eq('id', profile.id)
      .select('id,email,auth_user_id,first_name,last_name,role,is_active,status,permissions,permission_matrix')
      .single();
    if (syncError) {
      return rejectAdmin(logPrefix, requestId, 403, 'PROFILE_SYNC_FAILED', 'app_users_auth_user_id_sync', 'No se pudo sincronizar el perfil administrador con Supabase Auth.', {
        motivo: 'Se encontro app_users por email, pero auth_user_id no coincidia y la sincronizacion fallo.',
        authUid,
        emailDetectado: authEmail,
        profile: summarizeProfile(profile),
        error: syncError
      });
    }
    profile = syncedProfile;
    console.info(`${logPrefix} auth_user_id sincronizado en app_users`, {
      requestId,
      authUid,
      profile: summarizeProfile(profile)
    });
  }

  if (!isActive(profile)) {
    return rejectAdmin(logPrefix, requestId, 403, 'ADMIN_INACTIVE', 'app_users_status_inactive', 'Usuario administrador inactivo o bloqueado.', {
      motivo: 'El registro app_users existe, pero su estado no permite administrar usuarios.',
      authUid,
      emailDetectado: authEmail,
      profile: summarizeProfile(profile)
    });
  }

  if (!canManageUsers(profile)) {
    return rejectAdmin(logPrefix, requestId, 403, 'FORBIDDEN', 'app_users_permissions_denied', 'No tiene permisos para administrar usuarios.', {
      motivo: 'El registro app_users existe y esta activo, pero el rol/permisos no autorizan gestion de usuarios.',
      authUid,
      emailDetectado: authEmail,
      profile: summarizeProfile(profile),
      adminRolesPermitidos: ADMIN_ROLES
    });
  }

  console.info(`${logPrefix} Validacion admin correcta`, {
    requestId,
    authUid,
    emailDetectado: authEmail,
    profile: summarizeProfile(profile)
  });
  return { ok: true, profile };
}

function rejectAdmin(logPrefix, requestId, status, code, step, error, details) {
  const payload = { ok: false, status, code, step, error, details };
  console.error(`${logPrefix} Validacion admin fallida`, { requestId, ...payload });
  return payload;
}

function summarizeProfile(profile) {
  return {
    id: profile.id,
    email: profile.email,
    emailNormalizado: String(profile.email || '').toLowerCase(),
    auth_user_id: profile.auth_user_id,
    first_name: profile.first_name,
    last_name: profile.last_name,
    role: profile.role,
    status: profile.status,
    is_active: profile.is_active,
    permissions: profile.permissions,
    permission_matrix: profile.permission_matrix
  };
}

function compareElizabeth(profile, authEmail) {
  const expected = 'elizabeth@panyesperanza.org';
  return {
    authEmailIsElizabeth: authEmail === expected,
    appUserEmailIsElizabeth: String(profile.email || '').toLowerCase() === expected,
    exactAppUserEmail: profile.email,
    exactEmailMatchWithAuth: String(profile.email || '') === authEmail,
    normalizedEmailMatchWithAuth: String(profile.email || '').toLowerCase() === authEmail
  };
}

function getBearerToken(request) {
  const rawHeader = getHeader(request, 'authorization');
  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  const token = typeof match?.[1] === 'string' ? cleanJwtCredential(match[1]) : '';
  return {
    token,
    diagnostics: {
      hasAuthorization: Boolean(rawHeader),
      startsWithBearer: /^Bearer\s+/i.test(rawHeader),
      authorizationHeaderLength: rawHeader.length,
      authorizationHeaderStartsWith: rawHeader.slice(0, 32),
      tokenLength: token.length,
      tokenStartsWith: token.slice(0, 20),
      tokenHasNonAscii: hasNonAscii(token),
      headerHasNonAscii: hasNonAscii(rawHeader),
      tokenLooksJwt: isJwtLike(token)
    }
  };
}

function getHeader(request, name) {
  if (typeof request.headers?.get === 'function') {
    return String(request.headers.get(name) || '');
  }
  const value = request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.[name.toUpperCase()] || '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function hasNonAscii(value) {
  return /[^\x00-\x7F]/.test(value);
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
