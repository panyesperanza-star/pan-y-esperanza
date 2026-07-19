import { LocalStorageRepository } from "./LocalStorageRepository.js";
import {
  getRepositoryDriver,
  hasSupabaseConfig,
  shouldUseSupabaseRepository,
} from "../supabase/client.js";
import { SupabaseRepository } from "./SupabaseRepository.js";

export const createRepository = (options) =>
  shouldUseSupabaseRepository()
    ? new SupabaseRepository(options)
    : new LocalStorageRepository(options);

export { getRepositoryDriver, hasSupabaseConfig, shouldUseSupabaseRepository };
