import { isRoleActionAllowed, LEGACY_ROLE_PERMISSIONS, MODULES, ROLE_PERMISSION_MATRIX, ROLE_PERMISSIONS } from './constants';
import { hasSupabaseConfig, supabase } from './supabase';

const SESSION_KEY = 'pye-current-user';
const JUST_SIGNED_IN_KEY = 'pye-just-signed-in';
export const SYSTEM_SUPERADMIN_ROLE = 'Superadministrador del sistema';
export const PLATFORM_OWNER_ROLE = 'Platform Owner';
export const PLATFORM_OWNER_PROVIDER = 'ALTHEMON';

export function getStoredUser() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return withPermissions(JSON.parse(raw));
  } catch {
    clearStoredUser();
    return null;
  }
}

export function storeUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(withPermissions(user)));
}

export function clearStoredUser() {
  localStorage.removeItem(SESSION_KEY);
}

export function consumeJustSignedIn() {
  try {
    const value = sessionStorage.getItem(JUST_SIGNED_IN_KEY) === '1';
    sessionStorage.removeItem(JUST_SIGNED_IN_KEY);
    return value;
  } catch {
    return false;
  }
}

function markJustSignedIn() {
  try {
    sessionStorage.setItem(JUST_SIGNED_IN_KEY, '1');
  } catch {
    // Session storage can be unavailable in strict browser modes.
  }
}

export async function signIn({ email, password }, users = []) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Email o contraseña no válidos.');
    const current = await loadDatabaseProfile(data.user);
    await supabase.from('app_users').update({ last_access_at: new Date().toISOString() }).eq('id', current.id);
    storeUser(current);
    markJustSignedIn();
    return current;
  }

  const user = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password || !isUserActive(user)) {
    throw new Error('Email o contraseña no válidos.');
  }
  const current = withPermissions(user);
  storeUser(current);
  markJustSignedIn();
  return current;
}

export async function signOut() {
  if (hasSupabaseConfig) await supabase.auth.signOut();
  clearStoredUser();
}

export async function verifyCurrentUserPassword(password, currentUser) {
  const cleanPassword = String(password || '');
  if (!cleanPassword) throw new Error('Introduce la contraseña del Platform Owner.');
  if (!currentUser?.email) throw new Error('No se ha podido verificar la identidad del usuario.');

  if (hasSupabaseConfig) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: cleanPassword
    });
    if (error || data?.user?.email?.toLowerCase() !== currentUser.email.toLowerCase()) {
      throw new Error('La contraseña del Platform Owner no es válida.');
    }
    return true;
  }

  if (currentUser.password && currentUser.password === cleanPassword) return true;
  throw new Error('La verificación de contraseña solo está disponible con una sesión real de Supabase.');
}

export async function refreshCurrentUser() {
  if (!hasSupabaseConfig || !supabase) return getStoredUser();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user) throw new Error('La sesión ha caducado.');
  const current = await loadDatabaseProfile(data.session.user);
  storeUser(current);
  return current;
}

async function loadDatabaseProfile(authUser) {
  let { data: profile, error: profileError } = await supabase
    .from('app_users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  if (!profile && !profileError) {
    const byEmail = await supabase
      .from('app_users')
      .select('*')
      .ilike('email', authUser.email)
      .maybeSingle();
    profile = byEmail.data;
    profileError = byEmail.error;
  }
  if (profileError || !profile) throw new Error('Usuario autenticado sin perfil activo en Pan y Esperanza.');
  if (!isUserActive(profile)) {
    await supabase.auth.signOut();
    throw new Error('Usuario inactivo o bloqueado. Contacte con administración.');
  }
  if (!profile.auth_user_id) {
    await supabase.from('app_users').update({ auth_user_id: authUser.id }).eq('id', profile.id);
    profile = { ...profile, auth_user_id: authUser.id };
  }
  return withPermissions(profile);
}

export function withPermissions(user) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const permissionMatrix = user?.permission_matrix && typeof user.permission_matrix === 'object' && !Array.isArray(user.permission_matrix)
    ? user.permission_matrix
    : {};
  return { ...user, permissions, permission_matrix: permissionMatrix };
}

export function getUserStatus(user) {
  return user?.status || (user?.is_active ? 'Activo' : 'Inactivo');
}

export function isUserActive(user) {
  return Boolean(user && user.is_active !== false && getUserStatus(user) === 'Activo');
}

export function canAccess(user, moduleId) {
  if (!user) return false;
  if (moduleId === 'platform-tools') return isPlatformOwner(user);
  if (isPlatformOwner(user)) return false;
  if (moduleId === 'provider') return isSystemSuperadmin(user);
  if (isSystemSuperadmin(user)) return false;
  if (user.role === 'Superadministrador') return true;
  if (hasPermissionMatrix(user)) {
    if (hasModulePermissionEntry(user, moduleId)) return Boolean(user.permission_matrix?.[moduleId]?.view);
    return roleCanAccess(user, moduleId);
  }
  return Array.isArray(user.permissions) && user.permissions.includes(moduleId);
}

export function getFirstAccessibleModule(user) {
  return MODULES.find((module) => canAccess(user, module.id))?.id || null;
}

export function canDo(user, moduleId, action = 'view') {
  if (!user) return false;
  if (moduleId === 'platform-tools') return isPlatformOwner(user);
  if (isPlatformOwner(user)) return false;
  if (moduleId === 'provider') return isSystemSuperadmin(user);
  if (isSystemSuperadmin(user)) return false;
  if (user.role === 'Superadministrador') return true;
  if (!isRoleActionAllowed(user.role, moduleId, action)) return false;
  if (hasPermissionMatrix(user)) {
    if (hasModulePermissionEntry(user, moduleId)) {
      const modulePermissions = user.permission_matrix?.[moduleId] || {};
      if (Object.prototype.hasOwnProperty.call(modulePermissions, action)) return Boolean(modulePermissions[action]);
      return roleCanDo(user, moduleId, action);
    }
    return roleCanDo(user, moduleId, action);
  }
  return action === 'view' && Array.isArray(user.permissions) && user.permissions.includes(moduleId);
}

export function canRequestDefinitiveDeletion(user, moduleId, organization = null) {
  if (!user || isSystemSuperadmin(user)) return false;
  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'superadministrador' && isOwnerAssociation(organization)) return false;
  if (role === 'superadministrador' || role === 'administrador') return true;
  return canDo(user, moduleId, 'delete');
}

export function canDeleteDefinitively(user, moduleId, organization = null) {
  if (!user || isSystemSuperadmin(user)) return false;
  return String(user.role || '').trim().toLowerCase() === 'superadministrador'
    && isOwnerAssociation(organization)
    && canDo(user, moduleId, 'delete');
}

export function isOwnerAssociation(organization = null) {
  const id = String(organization?.id || '').trim().toLowerCase();
  const slug = String(organization?.slug || organization?.association_slug || '').trim().toLowerCase();
  const name = normalizeOwnerName(organization?.name || organization?.association_name || '');
  return organization?.is_owner_association === true
    || organization?.is_provider_owner === true
    || organization?.owner_association === true
    || slug === 'pan-y-esperanza'
    || (id === 'main' && name === 'pan y esperanza')
    || name === 'pan y esperanza';
}

export function isSystemSuperadmin(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  return role === SYSTEM_SUPERADMIN_ROLE.toLowerCase()
    || role === 'superadministrador del sistema'
    || role === 'superadministrador sistema'
    || role === 'system superadmin';
}

export function isPlatformOwner(user) {
  const role = String(user?.role || '').trim().toLowerCase();
  const provider = String(user?.platform_owner_provider || user?.platform_provider || user?.provider || '').trim().toUpperCase();
  const scope = String(user?.organization_scope || user?.scope || '').trim().toLowerCase();
  return role === PLATFORM_OWNER_ROLE.toLowerCase()
    && provider === PLATFORM_OWNER_PROVIDER
    && scope === 'platform'
    && isUserActive(user);
}

function normalizeOwnerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hasPermissionMatrix(user) {
  return Boolean(user?.permission_matrix && Object.keys(user.permission_matrix).length);
}

function hasModulePermissionEntry(user, moduleId) {
  return Object.prototype.hasOwnProperty.call(user?.permission_matrix || {}, moduleId);
}

function roleCanAccess(user, moduleId) {
  const permissions = ROLE_PERMISSIONS[user?.role] || LEGACY_ROLE_PERMISSIONS[user?.role] || [];
  return permissions.includes('*') || permissions.includes(moduleId);
}

function roleCanDo(user, moduleId, action) {
  const matrix = ROLE_PERMISSION_MATRIX[user?.role] || {};
  return Boolean(matrix?.[moduleId]?.[action]) || (action === 'view' && roleCanAccess(user, moduleId));
}
