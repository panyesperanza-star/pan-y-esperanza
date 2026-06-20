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

async function list(table) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return readLocal()[table] || [];
}

async function create(table, payload) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw error;
    return data;
  }
  const db = readLocal();
  const row = { id: payload.id || crypto.randomUUID(), ...payload };
  db[table] = [row, ...(db[table] || [])];
  writeLocal(db);
  return row;
}

async function update(table, id, payload) {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const db = readLocal();
  db[table] = (db[table] || []).map((item) => (item.id === id ? { ...item, ...payload } : item));
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
  if (duplicate) throw new Error(`Ya existe un beneficiario con DNI/NIE ${documentId}: ${duplicate.full_name}.`);
}

function resetLocalDemo() {
  writeLocal(seedData);
}

function replaceLocalData(nextData) {
  writeLocal(nextData);
}

export const dataStore = { list, create, update, remove, loadAll, assertUniqueDocument, resetLocalDemo, replaceLocalData };
