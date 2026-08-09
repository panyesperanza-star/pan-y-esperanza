import { getApiHeaders } from './apiAuth';
import { getEdgeFunctionUrl, readEdgeJson } from './edgeFunctions';

export async function runSocialResourceWatchdog(payload = {}) {
  const headers = await getApiHeaders();
  const response = await fetch(getEdgeFunctionUrl('social-resource-watchdog'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const data = await readEdgeJson(response);
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo comprobar la fuente vigilada.');
    error.code = data.code || 'SOCIAL_RESOURCE_WATCHDOG_FAILED';
    error.payload = data;
    throw error;
  }
  return data;
}
