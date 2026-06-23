import { hasSupabaseConfig, supabase } from './supabase';

export async function getApiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (!hasSupabaseConfig || !supabase) return headers;

  const { data } = await supabase.auth.getSession();
  const token = typeof data?.session?.access_token === 'string' ? data.session.access_token.trim() : '';
  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('Sesion de administrador no valida. Cierre sesion y vuelva a entrar.');
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
}
