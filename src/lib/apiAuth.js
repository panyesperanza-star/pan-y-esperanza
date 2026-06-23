import { hasSupabaseConfig, supabase } from './supabase';

export async function getApiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (!hasSupabaseConfig || !supabase) return headers;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[api-auth] No se pudo obtener la sesion de Supabase', { message: error.message });
    throw new Error('Sesion de administrador no valida. Cierre sesion y vuelva a entrar.');
  }

  const token = cleanJwt(data?.session?.access_token);
  const diagnostics = {
    hasSession: Boolean(data?.session),
    hasAccessToken: Boolean(token),
    tokenLength: token.length,
    tokenStartsWith: token.slice(0, 20),
    tokenHasNonAscii: /[^\x00-\x7F]/.test(token),
    tokenLooksJwt: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  };
  console.info('[api-auth] Preparando Authorization Bearer', diagnostics);

  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    console.error('[api-auth] Token de sesion ausente o con formato invalido', diagnostics);
    throw new Error('Sesion de administrador no valida. Cierre sesion y vuelva a entrar.');
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
}

function cleanJwt(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[\r\n\t ]+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}
