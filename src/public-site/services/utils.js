export const createEntityId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const isValidDateString = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time);
};

export const getToday = () => new Date().toISOString().slice(0, 10);
