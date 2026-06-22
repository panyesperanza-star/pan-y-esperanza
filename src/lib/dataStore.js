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
const STORAGE_KEY = 'pan-y-esperanza-real-data';
const DATE_FIELDS = new Set([
  'birth_date',
  'first_attention_at',
  'joined_at',
  'last_help_at',
  'date',
  'uploaded_at',
  'expires_at',
  'delivered_at',
  'reception_at',
  'sent_at',
  'donated_at',
  'income_at',
  'expense_at',
  'loan_at',
  'returned_at',
  'moved_at',
  'happened_at',
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
    if (error) throw error;
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

export const dataStore = { list, create, update, remove, loadAll, assertUniqueDocument, resetLocalDemo, replaceLocalData };
