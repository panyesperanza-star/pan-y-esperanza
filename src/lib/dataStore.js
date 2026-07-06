import { seedData } from '../data/seed';
import { normalizeDocument } from './formatters';
import { hasSupabaseConfig, supabase } from './supabase';

const TABLES = [
  'organization_settings',
  'families',
  'beneficiaries',
  'social_history',
  'beneficiary_documents',
  'deliveries',
  'email_logs',
  'inventory_items',
  'inventory_movements',
  'donations',
  'accounting_events',
  'financial_accounts',
  'cash_bank_movements',
  'accounting_contacts',
  'accounting_documents',
  'loan_records',
  'loan_movements',
  'debt_records',
  'debt_movements',
  'social_value_events',
  'deletion_requests',
  'accounting_audit_trail',
  'treasury_incomes',
  'treasury_expenses',
  'treasury_loans',
  'treasury_accounts',
  'volunteers',
  'volunteer_history',
  'roles',
  'audit_logs',
  'app_users'
];
const OPTIONAL_TABLES = new Set([
  'accounting_events',
  'financial_accounts',
  'cash_bank_movements',
  'accounting_contacts',
  'accounting_documents',
  'loan_records',
  'loan_movements',
  'debt_records',
  'debt_movements',
  'social_value_events',
  'deletion_requests',
  'accounting_audit_trail'
]);
const STORAGE_KEY = 'pan-y-esperanza-real-data';
const FAMILY_ARCHIVE_MARKER = '[FAMILIA_ARCHIVADA]';
const DATE_FIELDS = new Set([
  'birth_date',
  'first_attention_at',
  'joined_at',
  'last_help_at',
  'date',
  'uploaded_at',
  'expires_at',
  'delivered_at',
  'cancelled_at',
  'reception_at',
  'sent_at',
  'donated_at',
  'occurred_at',
  'movement_at',
  'document_at',
  'due_at',
  'paid_at',
  'payment_at',
  'repaid_at',
  'debt_at',
  'social_value_at',
  'voided_at',
  'income_at',
  'expense_at',
  'loan_at',
  'returned_at',
  'moved_at',
  'happened_at',
  'requested_at',
  'resolved_at',
  'archived_at',
  'last_access_at',
  'created_at',
  'updated_at'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return clone(seedData);
  }
  const db = JSON.parse(raw);
  let changed = false;
  TABLES.forEach((table) => {
    if (!Array.isArray(db[table])) {
      db[table] = clone(seedData[table] || []);
      changed = true;
    }
  });
  if (changed) writeLocal(db);
  return db;
}

function writeLocal(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function sanitizePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [
      key,
      DATE_FIELDS.has(key) && value === '' ? null : value
    ])
  );
}

async function list(table) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    if (error) {
      if (OPTIONAL_TABLES.has(table) && isMissingTableError(error)) return [];
      throw error;
    }
    return data || [];
  }
  return readLocal()[table] || [];
}

async function create(table, payload) {
  const cleanPayload = sanitizePayload(payload);
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).insert(cleanPayload).select().single();
    if (error && shouldRetryWithoutUserStatus(table, error, cleanPayload)) {
      const fallbackPayload = withoutStatus(cleanPayload);
      const retry = await supabase.from(table).insert(fallbackPayload).select().single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (error && shouldRetryWithoutEmailHistoryFields(table, error, cleanPayload)) {
      const fallbackPayload = withoutEmailHistoryFields(cleanPayload);
      const retry = await supabase.from(table).insert(fallbackPayload).select().single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (error && shouldRetryWithoutFamilyFields(table, error, cleanPayload)) {
      const fallbackPayload = withoutFamilyIntegrationFields(table, cleanPayload);
      const retry = await supabase.from(table).insert(fallbackPayload).select().single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (error) throw error;
    return data;
  }
  const db = readLocal();
  const row = { id: cleanPayload.id || crypto.randomUUID(), ...cleanPayload };
  db[table] = [row, ...(db[table] || [])];
  writeLocal(db);
  return row;
}

async function update(table, id, payload) {
  const cleanPayload = sanitizePayload(payload);
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).update(cleanPayload).eq('id', id).select().single();
    if (error && shouldRetryWithoutUserStatus(table, error, cleanPayload)) {
      const fallbackPayload = withoutStatus(cleanPayload);
      const retry = await supabase.from(table).update(fallbackPayload).eq('id', id).select().single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (error && shouldRetryWithoutFamilyFields(table, error, cleanPayload)) {
      const fallbackPayload = withoutFamilyIntegrationFields(table, cleanPayload);
      const retry = await supabase.from(table).update(fallbackPayload).eq('id', id).select().single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (error) throw error;
    return data;
  }
  const db = readLocal();
  db[table] = (db[table] || []).map((item) => (item.id === id ? { ...item, ...cleanPayload } : item));
  writeLocal(db);
  return db[table].find((item) => item.id === id);
}

async function remove(table, id) {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const db = readLocal();
  db[table] = (db[table] || []).filter((item) => item.id !== id);
  writeLocal(db);
  return true;
}

async function loadAll() {
  const entries = await Promise.all(TABLES.map(async (table) => [table, await list(table)]));
  return Object.fromEntries(entries);
}

function assertUniqueDocument(beneficiaries, payload, currentId) {
  const documentId = normalizeDocument(payload.document_id);
  if (!documentId) return;
  const duplicate = beneficiaries.find((item) => normalizeDocument(item.document_id) === documentId && item.id !== currentId);
  if (duplicate) throw new Error(`Ya existe un beneficiario con DNI/NIE / NIE O PASAPORTE ${documentId}: ${duplicate.full_name}.`);
}

function resetLocalDemo() {
  writeLocal(seedData);
}

function replaceLocalData(nextData) {
  writeLocal(nextData);
}

function shouldRetryWithoutUserStatus(table, error, payload) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return table === 'app_users' && Object.hasOwn(payload, 'status') && (error?.code === 'PGRST204' || message.includes('status'));
}

function withoutStatus(payload) {
  const { status, ...rest } = payload;
  return rest;
}

function shouldRetryWithoutEmailHistoryFields(table, error, payload) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const hasNewFields = ['provider_id', 'status', 'receipt_ids'].some((field) => Object.hasOwn(payload, field));
  return table === 'email_logs' && hasNewFields && (error?.code === 'PGRST204' || message.includes('column'));
}

function withoutEmailHistoryFields(payload) {
  const { provider_id, status, receipt_ids, ...fallback } = payload;
  if (provider_id) fallback.result = `${fallback.result || 'Correo enviado correctamente.'} Resend: ${provider_id}`;
  return fallback;
}

function shouldRetryWithoutFamilyFields(table, error, payload) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const hasFamilyField = ['status', 'archived_at', 'archive_reason', 'updated_at', 'family_relationship', 'family_id'].some((field) => Object.hasOwn(payload, field));
  return ['families', 'beneficiaries', 'beneficiary_documents', 'social_history'].includes(table)
    && hasFamilyField
    && (error?.code === 'PGRST204' || message.includes('column'));
}

function withoutFamilyIntegrationFields(table, payload) {
  if (table === 'families') {
    const { status, archived_at, archive_reason, updated_at, ...fallback } = payload;
    if (status === 'Archivada' || archived_at) {
      fallback.notes = withFamilyArchiveMarker(fallback.notes, archived_at, archive_reason);
    } else {
      fallback.notes = stripFamilyArchiveMarker(fallback.notes);
    }
    return fallback;
  }
  if (table === 'beneficiaries') {
    const { family_relationship, ...fallback } = payload;
    return fallback;
  }
  if (table === 'beneficiary_documents' || table === 'social_history') {
    const { family_id, ...fallback } = payload;
    return fallback;
  }
  return payload;
}

function withFamilyArchiveMarker(notes, archivedAt, reason) {
  const cleanNotes = stripFamilyArchiveMarker(notes);
  const marker = `${FAMILY_ARCHIVE_MARKER} ${archivedAt || new Date().toISOString()} ${String(reason || '').trim()}`.trim();
  return [cleanNotes, marker].filter(Boolean).join('\n');
}

function stripFamilyArchiveMarker(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(FAMILY_ARCHIVE_MARKER))
    .join('\n')
    .trim();
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('could not find the table')
    || (message.includes('relation') && message.includes('does not exist'));
}

export const dataStore = { list, create, update, remove, loadAll, assertUniqueDocument, resetLocalDemo, replaceLocalData };
