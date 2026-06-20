import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'documentos';

export const hasSupabaseConfig = Boolean(url && anonKey);
export const supabase = hasSupabaseConfig ? createClient(url, anonKey) : null;
export const supabaseStorageBucket = storageBucket;

export function getSystemConfigStatus() {
  const mailStatus = typeof localStorage !== 'undefined' ? localStorage.getItem('pye-mail-configured') === 'true' : false;
  return {
    databaseConfigured: hasSupabaseConfig,
    emailConfigured: mailStatus,
    storageConfigured: hasSupabaseConfig && Boolean(storageBucket)
  };
}

export async function checkSupabaseStorage() {
  if (!supabase) return false;
  const { error } = await supabase.storage.from(storageBucket).list('', { limit: 1 });
  return !error;
}
