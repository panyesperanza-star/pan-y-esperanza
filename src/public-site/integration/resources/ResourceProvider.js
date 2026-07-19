import { StaticResourceAdapter } from "./adapters/StaticResourceAdapter.js";
import { ErpSupabaseResourceAdapter } from "./adapters/ErpSupabaseResourceAdapter.js";
import {
  hasSupabaseConfig,
  isProductionEnvironment,
} from "../../services/supabase/client.js";

const canUseStaticDevelopmentFallback = () => !isProductionEnvironment();

const createDefaultResourceRepository = () => {
  if (hasSupabaseConfig()) {
    return new ErpSupabaseResourceAdapter();
  }

  if (canUseStaticDevelopmentFallback()) {
    return new StaticResourceAdapter();
  }

  return new ErpSupabaseResourceAdapter();
};

export class ResourceProvider {
  constructor(repository = createDefaultResourceRepository()) {
    this.repository = repository;
    this.developmentFallbackRepository = canUseStaticDevelopmentFallback()
      ? new StaticResourceAdapter()
      : null;
  }

  setRepository(repository) {
    this.repository = repository;
  }

  async listResources() {
    return this.readWithDevelopmentFallback(
      () => this.repository.list(),
      () => this.developmentFallbackRepository.list(),
    );
  }

  async listPublishedResources() {
    return this.readWithDevelopmentFallback(
      () => this.repository.listPublished(),
      () => this.developmentFallbackRepository.listPublished(),
    );
  }

  async findResourceById(resourceId) {
    return this.readWithDevelopmentFallback(
      () => this.repository.findById(resourceId),
      () => this.developmentFallbackRepository.findById(resourceId),
    );
  }

  normalizeUrl(url) {
    return this.repository.normalizeUrl(url);
  }

  getFallbackUrl() {
    return this.repository.getFallbackUrl();
  }

  async readWithDevelopmentFallback(operation, fallbackOperation) {
    try {
      return await operation();
    } catch (error) {
      if (!this.developmentFallbackRepository) {
        throw error;
      }

      return fallbackOperation();
    }
  }
}

export const resourceProvider = new ResourceProvider();
