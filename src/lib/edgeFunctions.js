import { supabaseAnonKey, supabaseUrl } from './supabase';

export function getEdgeFunctionUrl(functionName) {
  if (!supabaseUrl) {
    throw new Error('Supabase no esta configurado para ejecutar funciones backend.');
  }

  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

export function getEdgeFunctionHeaders(headers = {}, { contentType = 'application/json' } = {}) {
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(supabaseAnonKey ? { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` } : {}),
    ...headers
  };
}

export async function fetchEdgeFunction(functionName, options = {}) {
  const { headers = {}, contentType = 'application/json', ...rest } = options;
  return fetch(getEdgeFunctionUrl(functionName), {
    ...rest,
    headers: getEdgeFunctionHeaders(headers, { contentType })
  });
}

export async function callEdgeJson(functionName, payload = {}, options = {}) {
  const response = await fetchEdgeFunction(functionName, {
    method: 'POST',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: JSON.stringify(payload)
  });
  const data = await readEdgeJson(response);
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'No se pudo completar la solicitud.');
    error.code = data.code || 'EDGE_FUNCTION_FAILED';
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export async function readEdgeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Respuesta no valida del servidor.' };
  }
}
