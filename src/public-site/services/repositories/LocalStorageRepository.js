const cloneValue = (value) => JSON.parse(JSON.stringify(value));

export class LocalStorageRepository {
  constructor({ storageKey, fallbackValue, normalize }) {
    this.storageKey = storageKey;
    this.fallbackValue = fallbackValue;
    this.normalize = normalize;
  }

  getFallbackValue() {
    return cloneValue(this.fallbackValue);
  }

  read() {
    try {
      const storage = globalThis.localStorage;
      if (!storage) {
        return this.normalize(this.getFallbackValue());
      }

      const parsedValue = JSON.parse(storage.getItem(this.storageKey) || "null");
      return this.normalize(parsedValue ?? this.getFallbackValue());
    } catch {
      return this.normalize(this.getFallbackValue());
    }
  }

  write(value) {
    try {
      const storage = globalThis.localStorage;
      if (!storage) {
        return false;
      }

      storage.setItem(this.storageKey, JSON.stringify(this.normalize(value)));
      return true;
    } catch {
      return false;
    }
  }
}
