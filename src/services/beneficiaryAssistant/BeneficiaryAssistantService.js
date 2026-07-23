import { callEdgeJson } from '../../lib/edgeFunctions';

export async function askBeneficiaryAssistant(session, payload = {}) {
  const response = await callEdgeJson('beneficiary-assistant', {
    session,
    ...payload
  });
  return response.reply;
}
