import { normalize } from './formatters';

export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;
export const DOCUMENT_AUTOMATION_META_START = '[ALTHEMON_DOCUMENT_META]';
export const DOCUMENT_AUTOMATION_META_END = '[/ALTHEMON_DOCUMENT_META]';

export function documentExpiryWarningDays(data = {}) {
  const settings = Array.isArray(data.organization_settings) ? data.organization_settings[0] : data.organization_settings;
  const value = Number(settings?.document_expiry_warning_days || settings?.document_renewal_warning_days || DOCUMENT_EXPIRY_WARNING_DAYS);
  return Number.isFinite(value) && value > 0 ? value : DOCUMENT_EXPIRY_WARNING_DAYS;
}

export function readDocumentAutomationMeta(doc) {
  const notes = String(doc?.notes || '');
  const start = notes.indexOf(DOCUMENT_AUTOMATION_META_START);
  const end = notes.indexOf(DOCUMENT_AUTOMATION_META_END);
  if (start === -1 || end === -1 || end <= start) return {};
  const raw = notes.slice(start + DOCUMENT_AUTOMATION_META_START.length, end).trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function documentVisibleNotes(doc) {
  const notes = String(doc?.notes || '');
  const start = notes.indexOf(DOCUMENT_AUTOMATION_META_START);
  const end = notes.indexOf(DOCUMENT_AUTOMATION_META_END);
  if (start === -1 || end === -1 || end <= start) return notes.trim();
  return `${notes.slice(0, start)}${notes.slice(end + DOCUMENT_AUTOMATION_META_END.length)}`.trim();
}

export function buildNextDocumentAutomationMeta(doc, action, observations = '') {
  const current = readDocumentAutomationMeta(doc);
  const now = new Date().toISOString();
  const entry = {
    id: `${action.id}-${now}`,
    type: action.id,
    title: action.historyTitle,
    date: now,
    observations
  };
  return {
    ...current,
    version: 1,
    status: action.status,
    updatedAt: now,
    lastAction: action.id,
    observations: observations || current.observations || '',
    history: [entry, ...(Array.isArray(current.history) ? current.history : [])].slice(0, 30)
  };
}

export function buildDocumentNotesWithAutomationMeta(doc, meta) {
  const visibleNotes = documentVisibleNotes(doc);
  const metaBlock = `${DOCUMENT_AUTOMATION_META_START}${JSON.stringify(meta)}${DOCUMENT_AUTOMATION_META_END}`;
  return [visibleNotes, metaBlock].filter(Boolean).join('\n\n');
}

export function documentDisplayName(doc) {
  return doc?.document_type || doc?.file_name || 'documento';
}

export function documentExpiryValue(doc) {
  return doc?.expires_at || doc?.expiration_date || doc?.expiry_date || doc?.expires_on || doc?.valid_until || doc?.valid_to || '';
}

export function documentUpdatedValue(doc) {
  const meta = readDocumentAutomationMeta(doc);
  return meta.updatedAt || doc?.updated_at || doc?.reviewed_at || doc?.uploaded_at || doc?.created_at || '';
}

export function daysUntilDocumentExpiry(doc) {
  const value = documentExpiryValue(doc);
  if (!value) return null;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
}

export function intelligentDocumentStatus(doc, warningDays = DOCUMENT_EXPIRY_WARNING_DAYS) {
  const meta = readDocumentAutomationMeta(doc);
  const metaStatus = normalize(meta.status);
  const statusText = normalize([doc?.status, doc?.review_status, doc?.portal_status, doc?.notes].filter(Boolean).join(' '));
  const daysUntilExpiry = daysUntilDocumentExpiry(doc);
  if (metaStatus === 'no requerido') return 'No requerido';
  if (metaStatus === 'rechazado') return 'Rechazado';
  if (metaStatus === 'renovacion solicitada') return 'Renovación solicitada';
  if (metaStatus === 'pendiente de revision') return 'Pendiente de revisión';
  if (metaStatus === 'vigente') {
    if (daysUntilExpiry !== null && daysUntilExpiry < 0) return 'Caducado';
    if (daysUntilExpiry !== null && daysUntilExpiry <= warningDays) return 'Próximo a caducar';
    return 'Vigente';
  }
  if (statusText.includes('no requerido') || statusText.includes('no aplica')) return 'No requerido';
  if (daysUntilExpiry !== null && daysUntilExpiry < 0) return 'Caducado';
  if (statusText.includes('caduc')) return 'Caducado';
  if (!doc?.file_data_url || statusText.includes('pendiente') || statusText.includes('revision')) return 'Pendiente de revisión';
  if (daysUntilExpiry !== null && daysUntilExpiry <= warningDays) return 'Próximo a caducar';
  return 'Vigente';
}

export function isDocumentAttentionStatus(status) {
  return ['Caducado', 'Rechazado', 'Renovación solicitada', 'Próximo a caducar'].includes(status);
}

export function documentAttentionItems(data = {}) {
  const warningDays = documentExpiryWarningDays(data);
  return (data.beneficiary_documents || [])
    .map((document) => ({
      document,
      status: intelligentDocumentStatus(document, warningDays),
      meta: readDocumentAutomationMeta(document),
      daysUntilExpiry: daysUntilDocumentExpiry(document)
    }))
    .filter((item) => isDocumentAttentionStatus(item.status));
}
