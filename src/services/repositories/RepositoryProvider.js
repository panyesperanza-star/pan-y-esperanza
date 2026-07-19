import { dataStore as defaultDataStore } from '../../lib/dataStore';
import { hasSupabaseConfig as defaultHasSupabaseConfig, supabase as defaultSupabase } from '../../lib/supabase';
import { LocalStorageRepository } from './LocalStorageRepository';
import { SupabaseRepository } from './SupabaseRepository';

export function createRepositoryAdapter({
  dataStore = defaultDataStore,
  supabase = defaultSupabase,
  hasSupabaseConfig = defaultHasSupabaseConfig
} = {}) {
  const isProduction = import.meta.env.PROD;
  if (hasSupabaseConfig && supabase) {
    return new SupabaseRepository({
      supabase,
      fallbackStore: isProduction ? null : dataStore,
      allowMissingOptionalTables: !isProduction
    });
  }

  if (isProduction) {
    return new SupabaseRepositoryRequired();
  }

  return new LocalStorageRepository({ dataStore });
}

class SupabaseRepositoryRequired {
  constructor() {
    this.mode = 'supabase-required';
  }

  async list() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async loadAll() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async create() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async update() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async remove() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async replaceLocalData() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async resetLocalDemo() {
    throw new Error('Supabase no esta configurado para produccion.');
  }

  async rpc() {
    throw new Error('Supabase no esta configurado para produccion.');
  }
}
