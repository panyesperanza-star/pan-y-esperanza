import { LEGACY_ROLE_PERMISSIONS, ROLE_PERMISSION_MATRIX, ROLE_PERMISSIONS } from './constants';
import { hasSupabaseConfig, supabase } from './supabase';

const SESSION_KEY = 'pye-current-user';

export function getStoredUser() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function storeUser(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(withPermissions(user)));
}

export function clearStoredUser() {
  localStorage.removeItem(SESSION_KEY);
}

export async function signIn({ email, password }, users = []) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Email o contrasena no validos.');
    const { data: profile, error: profileError } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', data.user.email)
      .single();
    if (profileError) throw new Error('Usuario autenticado sin perfil activo en Pan y Esperanza.');
    if (!profile || !profile.is_active) throw new Error('Usuario sin perfil activo en Pan y Esperanza.');
    await supabase.from('app_users').update({ last_access_at: new Date().toISOString() }).eq('id', profile.id);
    const current = withPermissions(profile);
    storeUser(current);
    return current;
  }

  const user = users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user || user.password !== password || !user.is_active) {
    throw new Error('Email o contrasena no validos.');
  }
  const current = withPermissions(user);
  storeUser(current);
  return current;
}

export async function signOut() {
  if (hasSupabaseConfig) await supabase.auth.signOut();
  clearStoredUser();
}

export function withPermissions(user) {
  const permissions = user.permissions?.length ? user.permissions : ROLE_PERMISSIONS[user.role] || LEGACY_ROLE_PERMISSIONS[user.role] || [];
  return {
    ...user,
    permissions,
    permission_matrix: user.permission_matrix || ROLE_PERMISSION_MATRIX[user.role]
  };
}

export function canAccess(user, moduleId) {
  if (!user) return false;
  if (user.permission_matrix?.[moduleId]?.view) return true;
  const permissions = user.permissions || ROLE_PERMISSIONS[user.role] || LEGACY_ROLE_PERMISSIONS[user.role] || [];
  return permissions.includes('*') || permissions.includes(moduleId);
}

export function canDo(user, moduleId, action = 'view') {
  if (!user) return false;
  if (user.permissions?.includes('*')) return true;
  if (user.permission_matrix?.[moduleId]) return Boolean(user.permission_matrix[moduleId][action]);
  return action === 'view' && canAccess(user, moduleId);
}
